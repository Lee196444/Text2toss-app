from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request, BackgroundTasks, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, HTMLResponse
from dotenv import load_dotenv
import csv
import io
from io import BytesIO
import requests
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, validator, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, date, time, timedelta
import hashlib
import jwt
from passlib.context import CryptContext
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType, ImageContent
import json
import secrets
import re
import base64
import aiofiles
import shutil
from twilio.rest import Client
from templates import email_templates
import object_storage

# Register HEIC/HEIF (iPhone default) so any endpoint using PIL can decode it.
# Safe to call once at import time — register_heif_opener is idempotent.
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:  # pragma: no cover - optional dep
    pass

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Database indexes for performance optimization
@app.on_event("startup")
async def create_indexes():
    """Create database indexes on startup for optimal query performance"""
    try:
        # Bookings collection indexes
        await db.bookings.create_index([("pickup_date", 1), ("status", 1)])
        await db.bookings.create_index([("payment_status", 1)])
        await db.bookings.create_index([("user_id", 1)])
        await db.bookings.create_index([("id", 1)], unique=True)
        await db.bookings.create_index([("email", 1)])
        
        # Quotes collection indexes
        await db.quotes.create_index([("id", 1)], unique=True)
        await db.quotes.create_index([("approval_status", 1)])
        await db.quotes.create_index([("requires_approval", 1)])
        
        # Users collection indexes
        await db.users.create_index([("email", 1)], unique=True)
        await db.users.create_index([("id", 1)], unique=True)

        # Image quote cache — fast lookup on (image+description) hash
        await db.image_cache.create_index([("cache_key", 1)])
        # Fuzzy lookup via perceptual hash (catches re-uploads of the same photo)
        await db.image_cache.create_index([("phash", 1), ("desc_norm", 1), ("n_images", 1)])

        # Reviews collection — fast public lookup of published reviews
        await db.reviews.create_index([("id", 1)], unique=True)
        await db.reviews.create_index([("is_published", 1), ("display_order", 1)])

        logger.info("✅ Database indexes created successfully")
    except Exception as e:
        logger.warning(f"⚠️ Index creation warning (indexes may already exist): {str(e)}")

# Static file serving through API endpoint (due to Kubernetes routing)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = os.environ.get('JWT_SECRET_KEY')
if not SECRET_KEY:
    logger.error("JWT_SECRET_KEY not configured - using secure random key")
    SECRET_KEY = secrets.token_urlsafe(32)
ALGORITHM = "HS256"

# Twilio SMS setup
def get_twilio_client():
    """Get Twilio client. Supports two auth methods:
      1. API Key (preferred): TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET + TWILIO_ACCOUNT_SID
      2. Auth Token (legacy): TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
    Returns None if credentials are missing (triggers simulation mode)."""
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    if not account_sid or account_sid == 'your_twilio_account_sid':
        return None

    # Prefer API Key auth (more secure, individually revocable)
    api_key_sid = os.environ.get('TWILIO_API_KEY_SID')
    api_key_secret = os.environ.get('TWILIO_API_KEY_SECRET')
    if api_key_sid and api_key_secret:
        return Client(api_key_sid, api_key_secret, account_sid)

    # Fallback to Auth Token
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    if not auth_token:
        return None
    return Client(account_sid, auth_token)

async def send_sms(to_phone: str, message: str, image_url: str = None):
    """Send SMS with optional image attachment.

    Refactored helpers:
      - _simulate_sms_send  → console output when Twilio isn't configured
      - _send_real_sms      → actual Twilio API call
    """
    client = get_twilio_client()
    if not client:
        return _simulate_sms_send(to_phone, message, image_url)
    return _send_real_sms(client, to_phone, message, image_url)


def _simulate_sms_send(to_phone: str, message: str, image_url: str = None) -> dict:
    """Local-dev SMS simulator. Logs the message + tests image URL reachability."""
    logging.warning("Twilio not configured - SMS simulation mode")
    print("\n--- SMS SIMULATION ---")
    print(f"To: {to_phone}")
    print(f"Message: {message}")
    if image_url:
        print(f"Photo URL: {image_url}")
        _check_image_url_reachable(image_url)
    print("--- END SIMULATION ---\n")
    return {
        "status": "simulated",
        "message": "SMS simulated (Twilio not configured)",
        "to_phone": to_phone,
        "has_photo": bool(image_url),
        "photo_url": image_url if image_url else None,
    }


def _check_image_url_reachable(image_url: str) -> None:
    """Best-effort HEAD probe — used only by the SMS simulator."""
    try:
        import requests
        response = requests.head(image_url, timeout=5)
        if response.status_code == 200:
            print(f"✅ Photo URL is accessible (Status: {response.status_code})")
        else:
            print(f"❌ Photo URL returned status: {response.status_code}")
    except Exception as e:
        print(f"❌ Photo URL test failed: {str(e)}")


def _send_real_sms(client, to_phone: str, message: str, image_url: str = None) -> dict:
    """Actual Twilio API call."""
    try:
        message_params = {
            "body": message,
            "from_": os.environ.get("TWILIO_PHONE_NUMBER", "+1234567890"),
            "to": to_phone,
        }
        if image_url:
            message_params["media_url"] = [image_url]
        message_obj = client.messages.create(**message_params)
        return {
            "status": "sent",
            "message_sid": message_obj.sid,
            "message": "SMS sent successfully",
            "to_phone": to_phone,
            "has_photo": bool(image_url),
        }
    except Exception as e:
        logging.error(f"SMS send error: {str(e)}")
        return {"status": "error", "message": f"SMS failed: {str(e)}"}

# Email Configuration and Functions
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage

def is_email_enabled():
    """Check if email notifications are enabled"""
    return os.environ.get('EMAIL_ENABLED', 'false').lower() == 'true'

def is_sms_enabled():
    """Check if SMS notifications are enabled"""
    return os.environ.get('SMS_ENABLED', 'false').lower() == 'true'

async def send_email(to_email: str, subject: str, html_content: str, attachments: list = None):
    """Send email via Gmail SMTP"""
    if not is_email_enabled():
        logging.info(f"Email disabled - skipping: {subject} to {to_email}")
        return {"status": "disabled", "message": "Email notifications disabled"}
    
    try:
        # Email configuration
        email_host = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
        email_port = int(os.environ.get('EMAIL_PORT', 587))
        email_user = os.environ.get('EMAIL_USER')
        email_password = os.environ.get('EMAIL_PASSWORD')
        email_from = os.environ.get('EMAIL_FROM')
        email_from_name = os.environ.get('EMAIL_FROM_NAME', 'Text2toss')
        
        if not all([email_user, email_password, email_from]):
            logging.error("Email configuration incomplete")
            return {"status": "error", "message": "Email not configured"}
        
        # Create message
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = f"{email_from_name} <{email_from}>"
        message['To'] = to_email

        # Admin BCC — auto-copy every customer-facing email to the owner's
        # inbox for real-time delivery visibility (set ADMIN_BCC_EMAIL in .env).
        # Skipped if the recipient IS the admin (avoids infinite Gmail loops).
        admin_bcc = (os.environ.get('ADMIN_BCC_EMAIL') or '').strip()
        recipients = [to_email]
        if admin_bcc and admin_bcc.lower() != (to_email or '').lower():
            message['Bcc'] = admin_bcc
            recipients.append(admin_bcc)

        # Add HTML content
        html_part = MIMEText(html_content, 'html')
        message.attach(html_part)

        # Add attachments if provided
        if attachments:
            for attachment in attachments:
                message.attach(attachment)

        # Send email
        await aiosmtplib.send(
            message,
            hostname=email_host,
            port=email_port,
            start_tls=True,
            username=email_user,
            password=email_password,
            recipients=recipients,
        )

        bcc_tag = f" (bcc→{admin_bcc})" if admin_bcc and admin_bcc.lower() != (to_email or '').lower() else ""
        logging.info(f"Email sent successfully to {to_email}{bcc_tag}: {subject}")
        return {"status": "sent", "message": "Email sent successfully", "to_email": to_email}
        
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")
        return {"status": "error", "message": f"Email failed: {str(e)}"}

def create_booking_confirmation_email(booking_data: dict, quote_data: dict) -> str:
    """Thin wrapper — delegates to templates.email_templates."""
    return email_templates.booking_confirmation_email(booking_data, quote_data)


def create_payment_reminder_email(booking_data: dict, amount: float, booking_id: str, qr_code_url: str = None) -> str:
    """Thin wrapper — delegates to templates.email_templates."""
    return email_templates.payment_reminder_email(booking_data, amount, booking_id, qr_code_url)

# Helper functions for MongoDB datetime handling
def prepare_for_mongo(data):
    if isinstance(data.get('date'), date):
        data['date'] = data['date'].isoformat()
    if isinstance(data.get('time'), time):
        data['time'] = data['time'].strftime('%H:%M:%S')
    if isinstance(data.get('created_at'), datetime):
        data['created_at'] = data['created_at'].isoformat()
    if isinstance(data.get('pickup_date'), datetime):
        data['pickup_date'] = data['pickup_date'].isoformat()
    return data

def parse_from_mongo(item):
    if isinstance(item.get('date'), str):
        item['date'] = datetime.fromisoformat(item['date']).date()
    if isinstance(item.get('time'), str):
        item['time'] = datetime.strptime(item['time'], '%H:%M:%S').time()
    if isinstance(item.get('created_at'), str):
        item['created_at'] = datetime.fromisoformat(item['created_at'])
    if isinstance(item.get('pickup_date'), str):
        item['pickup_date'] = datetime.fromisoformat(item['pickup_date'])
    return item

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class JunkItem(BaseModel):
    name: str
    quantity: int
    size: str  # small, medium, large
    description: Optional[str] = None
    
    @validator('quantity', pre=True)
    def parse_quantity(cls, v):
        """Parse quantity - handle both integers and descriptive strings"""
        if isinstance(v, int):
            return v
        if isinstance(v, str):
            # Convert common descriptive quantities to numbers
            quantity_map = {
                'one': 1, 'single': 1, 'a': 1,
                'two': 2, 'couple': 2, 'pair': 2,
                'three': 3, 'few': 3,
                'four': 4, 'several': 4,
                'five': 5, 'multiple': 5,
                'six': 6, 'many': 6,
                'seven': 7, 'numerous': 7,
                'eight': 8, 'lots': 8,
                'nine': 9, 'plenty': 9,
                'ten': 10, 'dozens': 10
            }
            # Try to get mapped value (case insensitive)
            return quantity_map.get(v.lower(), 5)  # Default to 5 if unknown
        return 1  # Default fallback

class PriceQuote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    items: List[JunkItem]
    total_price: float
    scale_level: Optional[int] = None  # New: 1-10 scale level
    breakdown: Optional[dict] = None   # New: cost breakdown
    description: str
    ai_explanation: Optional[str] = None
    temp_image_path: Optional[str] = None  # Primary image (first of temp_image_paths); kept for backwards-compat
    temp_image_paths: List[str] = Field(default_factory=list)  # All uploaded images for multi-photo quotes
    dismissed_at: Optional[datetime] = None  # Admin-hidden from auto-approved bucket
    # Quote approval system for high-value jobs (Scale 9-20)
    approval_status: str = "auto_approved"  # auto_approved, pending_approval, approved, rejected
    requires_approval: bool = False  # True for Scale 9-20 quotes
    admin_notes: Optional[str] = None  # Admin notes for approval/rejection
    approved_price: Optional[float] = None  # Admin can adjust price
    approved_by: Optional[str] = None  # Admin who approved/rejected
    approved_at: Optional[datetime] = None  # When approved/rejected
    # === Heavy-pile equipment add-on ===
    # `heavy_pile` is true only when the photo is dominantly (≥70% of visual
    # area) a pile of one heavy material — dirt, sandbags, concrete, rock,
    # gravel, wood chips, mulch, or fill. Mixed junk photos stay false.
    heavy_pile: bool = False
    heavy_material_type: Optional[str] = None
    equipment_fee: float = 0.0
    equipment_required: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PriceQuoteCreate(BaseModel):
    items: List[JunkItem]
    description: str
    
class ImageQuoteCreate(BaseModel):
    description: str

class AdminLogin(BaseModel):
    username: str
    password: str

class AdminUser(BaseModel):
    username: str
    password_hash: str
    display_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Booking(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    quote_id: str
    pickup_date: datetime
    pickup_time: str
    address: str
    phone: str
    email: Optional[str] = None  # Customer email for notifications
    special_instructions: Optional[str] = None
    curbside_confirmed: bool = False
    sms_notifications: bool = False  # Kept for legacy/optional use
    email_notifications: bool = True  # Default to email notifications
    status: str = "pending_payment"  # pending_payment, scheduled, in_progress, completed, cancelled, pending_customer_approval
    payment_status: str = "pending"  # pending, paid, refunded
    payment_method: str = "venmo"  # venmo (only option currently)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    quote_details: Optional[PriceQuote] = None
    image_path: Optional[str] = None  # Path to customer's uploaded image
    completion_photo_path: Optional[str] = None  # Path to completion photo
    completion_note: Optional[str] = None  # Admin note for completion
    completed_at: Optional[datetime] = None  # When job was completed
    # Customer approval fields for price adjustments
    original_price: Optional[float] = None  # Original quoted price
    adjusted_price: Optional[float] = None  # Admin-adjusted price
    price_adjustment_reason: Optional[str] = None  # Admin reason for adjustment
    customer_approval_token: Optional[str] = None  # Token for customer approval
    customer_approved_at: Optional[datetime] = None  # When customer approved price change
    requires_customer_approval: bool = False  # Whether customer approval is needed
    # --- Priority Pickup ---
    priority_tier: Optional[str] = None  # None | "same_day" | "next_slot" | "emergency"
    priority_fee: float = 0.0            # Non-refundable surcharge added on top of quote
    equipment_required: bool = False     # Heavy-pile add-on opted in at quote time
    equipment_fee: float = 0.0           # Locked-in fee carried from quote
    # --- Tip the Crew (15/20/25/custom/skip, set on the pay page) ---
    tip_amount: float = 0.0              # Dollar amount, server-validated
    tip_set_at: Optional[datetime] = None
    # --- Legal consent (defense against payment disputes) ---
    consent_accepted: bool = False
    consent_accepted_at: Optional[datetime] = None
    consent_ip: Optional[str] = None
    consent_user_agent: Optional[str] = None
    consent_version: Optional[str] = None  # snapshot of policy version at acceptance

class BookingCreate(BaseModel):
    quote_id: str
    pickup_date: str
    pickup_time: str
    address: str
    phone: str
    email: Optional[str] = None
    special_instructions: Optional[str] = None
    curbside_confirmed: bool = False
    email_notifications: bool = True
    priority_tier: Optional[str] = None  # None | "same_day" | "next_slot" | "emergency"
    consent_accepted: bool = False        # Customer agreed to Terms + Refund Policy
    pay_in_person: bool = False           # Cash/card at pickup — skips Venmo flow
    
    @validator('email')
    def validate_email(cls, v):
        if v and '@' not in v:
            raise ValueError('Invalid email address')
        return v
    
    @validator('phone')
    def validate_phone(cls, v):
        # Clean and validate phone number
        phone = re.sub(r'[^\d+]', '', v)  # Remove non-digit chars except +
        
        # Add +1 if missing country code for US numbers
        if phone.startswith('1') and len(phone) == 11:
            phone = '+' + phone
        elif not phone.startswith('+') and len(phone) == 10:
            phone = '+1' + phone
        elif not phone.startswith('+'):
            raise ValueError('Phone number must include country code or be a valid US number')
        
        # Basic validation for US numbers
        if phone.startswith('+1') and len(phone) != 12:
            raise ValueError('US phone numbers must be 10 digits plus country code')
        
        return phone

class BookingCompletion(BaseModel):
    completion_note: Optional[str] = None

# Payment models removed - Venmo-only system

class QuoteApprovalAction(BaseModel):
    action: str  # "approve" or "reject"
    admin_notes: Optional[str] = None
    approved_price: Optional[float] = None

class CustomerPriceApproval(BaseModel):
    booking_id: str
    approved: bool
    customer_notes: Optional[str] = None

class PriceAdjustmentRequest(BaseModel):
    booking_id: str
    new_price: float
    adjustment_reason: str
    admin_notes: Optional[str] = None  # Admin can adjust price

# Volume-based pricing scale (1-20)
PRICING_SCALE = {
    1: {"range": (15, 15), "description": "15-gallon trash bag or smaller"},
    2: {"range": (20, 20), "description": "Small box, single small item"},
    3: {"range": (45, 55), "description": "Large trash bag, small electronics"},
    4: {"range": (55, 70), "description": "Multiple bags, small appliances"},
    5: {"range": (70, 85), "description": "Microwave, toaster oven sized items"},
    6: {"range": (85, 105), "description": "Small chair, end table"},
    7: {"range": (105, 125), "description": "Multiple small furniture pieces"},
    8: {"range": (125, 150), "description": "Office chair, small dresser"},
    9: {"range": (150, 175), "description": "Large chair, coffee table"},
    10: {"range": (175, 205), "description": "Love seat, medium dresser"},
    11: {"range": (205, 235), "description": "Dining table, bookshelf"},
    12: {"range": (235, 270), "description": "Sofa, large dresser"},
    13: {"range": (270, 310), "description": "Sectional sofa, wardrobe"},
    14: {"range": (310, 355), "description": "Bedroom set, multiple large items"},
    15: {"range": (355, 405), "description": "Living room set"},
    16: {"range": (405, 460), "description": "Multiple room furniture"},
    17: {"range": (460, 520), "description": "Small apartment cleanout"},
    18: {"range": (520, 585), "description": "Large apartment cleanout"},
    19: {"range": (585, 655), "description": "Small house cleanout"},
    20: {"range": (655, 750), "description": "Large house cleanout, estate sale items"}
}
# AI-powered pricing logic for ground level and curbside pickup only

# Pricing lookup tables (used by multiple functions)
MIN_PRICE_BY_COUNT = {1: 50.0, 2: 65.0, 3: 80.0, 4: 95.0, 5: 115.0}
MAX_PRICE_BY_COUNT = {1: 175.0, 2: 205.0, 3: 235.0, 4: 270.0, 5: 310.0}
MIN_SCALE_BY_COUNT = {1: 3, 2: 4, 3: 5, 4: 6, 5: 7}
MAX_SCALE_BY_COUNT = {1: 9, 2: 10, 3: 11, 4: 12, 5: 20}
VOLUME_BY_SIZE = {"small": 8, "medium": 25, "large": 60}

# Scale thresholds for price-to-scale conversion (upper price bound → scale)
PRICE_TO_SCALE_THRESHOLDS = [
    (20, 1), (45, 2), (70, 3), (85, 4), (105, 5), (125, 6),
    (150, 7), (175, 8), (205, 9), (235, 10), (270, 11), (310, 12),
]


def _estimate_item_volume(items: List[JunkItem]) -> float:
    """Estimate total volume in cubic feet from item list."""
    return sum(VOLUME_BY_SIZE.get(item.size.lower(), 25) * item.quantity for item in items)


def _price_to_scale(price: float) -> int:
    """Convert a price to the corresponding scale level (1-20)."""
    for threshold, scale in PRICE_TO_SCALE_THRESHOLDS:
        if price <= threshold:
            return scale
    return min(20, max(13, int(price / 40)))


def validate_pricing_logic(items: List[JunkItem], ai_price: float, ai_scale: Optional[int]) -> tuple[float, Optional[int]]:
    """Validate and clamp AI pricing within business rules."""
    count = min(len(items), 5)
    estimated_volume = _estimate_item_volume(items)

    # Price bounds
    volume_min = max(45.0, estimated_volume * 2.5)
    min_price = max(MIN_PRICE_BY_COUNT.get(count, 115.0), volume_min)
    max_price = MAX_PRICE_BY_COUNT.get(count, 750.0)
    validated_price = max(min_price, min(ai_price, max_price))

    # Scale bounds
    min_scale = MIN_SCALE_BY_COUNT.get(count, 7)
    max_scale = MAX_SCALE_BY_COUNT.get(count, 20)

    if ai_scale is not None:
        validated_scale = max(min_scale, min(ai_scale, max_scale))
    else:
        validated_scale = max(min_scale, min(_price_to_scale(validated_price), max_scale))

    return validated_price, validated_scale

def _build_text_pricing_prompt(items_summary: str, description: str) -> str:
    """Build the AI prompt for text-based pricing (no image)."""
    return (
        "You are a professional junk removal pricing expert for Text2toss — "
        "GROUND LEVEL and CURBSIDE PICKUP ONLY in Flagstaff, AZ.\n\n"
        "JUNK ITEMS TO REMOVE:\n" + items_summary + "\n\n"
        "ADDITIONAL DETAILS:\n" + (description or "None") + "\n\n"
        "PRICING SCALE (by total volume):\n"
        "1:$15|2:$20|3:$45-55|4:$55-70|5:$70-85|6:$85-105|7:$105-125|8:$125-150|"
        "9:$150-175|10:$175-205|11:$205-235|12:$235-270|13:$270-310|14:$310-355|"
        "15:$355-405|16:$405-460|17:$460-520|18:$520-585|19:$585-655|20:$655-750\n\n"
        "Rules:\n"
        "- Calculate TOTAL cubic feet for all items combined\n"
        "- Overestimate 15-20%. Heavy items (metal/appliances) +20%\n"
        "- E-waste +$15-35/item. Hazardous +$25-50\n"
        "- Ground level only — no stairs/upper floors\n"
        "- If uncertain, round UP to next scale\n\n"
        'JSON only:\n'
        '{"total_price":150.00,"scale_level":5,'
        '"breakdown":{"base_price":"140.00","volume_assessment":"Medium load",'
        '"items":[{"name":"Table","size":"large","estimated_cost":80.00}],'
        '"factors":["Ground level"],"additional_charges":10.00,"total":150.00},'
        '"explanation":"Scale 5 - table and chairs."}'
    )


def _parse_ai_pricing_response(response_text: str) -> tuple[float, str, Optional[int], Optional[dict]]:
    """Parse and extract pricing data from AI JSON response."""
    text = response_text.strip()
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
        text = json_match.group(0)

    pricing_data = json.loads(text)
    return (
        float(pricing_data.get("total_price", 0)),
        pricing_data.get("explanation", "AI-generated pricing estimate"),
        pricing_data.get("scale_level"),
        pricing_data.get("breakdown"),
    )


async def calculate_ai_price(items: List[JunkItem], description: str) -> tuple[float, str, Optional[int], Optional[dict]]:
    """Use AI to analyze junk description and provide intelligent pricing.

    Refactored from a 65-line/complexity-12 monolith into focused helpers:
      - _build_ai_pricing_prompt        → prompt assembly
      - _request_ai_text_pricing        → LLM call + parse
      - _apply_pricing_safety_adjustments → minimum-per-item, scale alignment, floor
      - _ai_pricing_fallback            → basic pricing when AI fails
    """
    items_text = [
        f"- {item.quantity}x {item.name} ({item.size} size)"
        + (f"\n  Description: {item.description}" if item.description else "")
        for item in items
    ]
    items_summary = "\n".join(items_text)
    ai_prompt = _build_text_pricing_prompt(items_summary, description)

    try:
        total_price, explanation, scale_level, breakdown = await _request_ai_text_pricing(ai_prompt)
    except Exception as e:
        print(f"AI pricing error: {str(e)}")
        return _ai_pricing_fallback(items)

    return _apply_pricing_safety_adjustments(items, total_price, scale_level, explanation, breakdown)


async def _request_ai_text_pricing(ai_prompt: str) -> tuple[float, str, Optional[int], Optional[dict]]:
    """Send the pricing prompt to the LLM and parse the structured response."""
    chat = LlmChat(
        api_key=os.environ.get('EMERGENT_LLM_KEY'),
        session_id=f"pricing_{datetime.now().timestamp()}",
        system_message="You are a professional junk removal pricing expert. Always respond with valid JSON only."
    ).with_model("openai", "gpt-5-mini")

    response = await chat.send_message(UserMessage(text=ai_prompt))
    return _parse_ai_pricing_response(response)


def _apply_pricing_safety_adjustments(
    items: List[JunkItem],
    total_price: float,
    scale_level: Optional[int],
    explanation: str,
    breakdown: Optional[dict],
) -> tuple[float, str, Optional[int], Optional[dict]]:
    """Run validated pricing through business floors + scale alignment."""
    validated_price, validated_scale = validate_pricing_logic(items, total_price, scale_level)

    # Per-item minimum so we never underprice tiny but real jobs.
    if items and (validated_price / len(items)) < 25:
        safety_price = len(items) * 30
        if safety_price > validated_price:
            validated_price = safety_price
            explanation += " (Safety adjustment applied - minimum $30 per item for business sustainability)"

    # Note any divergence between AI and validated values so the customer/admin
    # can see why the number changed.
    if validated_scale != scale_level and scale_level:
        explanation += f" (Scale adjusted from {scale_level} to {validated_scale} for pricing consistency)"
    elif validated_price != total_price:
        explanation += f" (Price adjusted from ${total_price:.2f} to ${validated_price:.2f} for business accuracy)"

    # Absolute service-call floor.
    absolute_minimum = 45.0
    if validated_price < absolute_minimum:
        validated_price = absolute_minimum
        validated_scale = 3
        explanation += f" (Applied minimum service charge of ${absolute_minimum})"

    return validated_price, explanation, validated_scale, breakdown


def _ai_pricing_fallback(items: List[JunkItem]) -> tuple[float, str, Optional[int], Optional[dict]]:
    """Basic deterministic pricing when the AI call fails."""
    fallback_price = calculate_basic_price(items)
    validated_price, validated_scale = validate_pricing_logic(items, fallback_price, None)
    fallback_breakdown = {
        "base_price": f"{validated_price:.2f}",
        "volume_assessment": f"Estimated {len(items)} items",
        "items": [
            {"name": item.name, "size": item.size, "estimated_cost": validated_price / len(items)}
            for item in items
        ],
        "factors": ["Ground level pickup included", "Business logic validated", "AI analysis unavailable"],
        "additional_charges": 0,
        "total": validated_price,
    }
    return (
        validated_price,
        "Basic pricing applied with business logic validation (AI temporarily unavailable)",
        validated_scale,
        fallback_breakdown,
    )

# Volume thresholds for basic pricing (max_volume → scale)
VOLUME_TO_SCALE = [
    (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (7, 7),
    (10, 10), (15, 12), (20, 15), (30, 17),
]


def calculate_basic_price(items: List[JunkItem]) -> float:
    """Fallback pricing when AI is unavailable — uses volume estimation + PRICING_SCALE."""
    volume_factors = {"small": 1, "medium": 5, "large": 12}
    total_volume = sum(volume_factors.get(item.size, 5) * item.quantity for item in items)

    scale = 20  # default for large volumes
    for max_vol, s in VOLUME_TO_SCALE:
        if total_volume <= max_vol:
            scale = s
            break

    price_range = PRICING_SCALE[scale]["range"]
    return round((price_range[0] + price_range[1]) / 2, 2)

# AI Vision Analysis for Image-based Quotes
async def analyze_image_for_quote(image_paths, description: str) -> tuple[List[JunkItem], float, str, Optional[int], Optional[dict]]:
    """Analyze one or more uploaded images as a SINGLE combined quote.

    Accepts either a single path (legacy call sites) or a list. When multiple
    images are provided the AI sees them all at once and returns one
    aggregated item list + price — the use case is a customer with multiple
    piles of junk at different spots who wants a single pickup quote.

    Implementation is broken down into helpers:
      - _compress_image_for_ai     → speed up upload & hashing
      - _check_image_cache          → return cached analysis if seen before
      - _build_vision_prompt        → centralizes the pricing prompt
      - _parse_ai_quote_response    → JSON extraction & item construction
      - _enhanced_text_fallback     → description-based fallback when vision fails
    """
    import time as _time
    t0 = _time.monotonic()

    # Normalize to list so the rest of the pipeline is single-branched.
    if isinstance(image_paths, (str, Path)):
        image_paths = [str(image_paths)]
    image_paths = [str(p) for p in image_paths]
    if not image_paths:
        raise ValueError("At least one image path is required")

    compressed_paths = [_compress_image_for_ai(p, t0) for p in image_paths]

    try:
        import hashlib
        hasher = hashlib.sha256()
        for cp in compressed_paths:
            with open(cp, "rb") as fh:
                hasher.update(fh.read())
            hasher.update(b"|")  # separator so (A,B) and (AB,) hash differently
        image_hash = hasher.hexdigest()

        # Perceptual hash: catches re-uploads where the customer snapped the
        # same photo again or the client compressed it slightly differently.
        # The byte-hash above is exact; pHash is fuzzy. We check both so any
        # match is a cache hit.
        phash = _perceptual_hash_batch(compressed_paths)

        # Description + image count are part of the cache key so "1 pile" and
        # "4 piles" with similar photos never collide.
        desc_norm = (description or "").strip().lower()
        cache_key = hashlib.sha256(
            f"{image_hash}|n={len(compressed_paths)}|{desc_norm}".encode()
        ).hexdigest()

        cached = await _check_image_cache(cache_key, image_hash, compressed_paths[0], image_paths[0], t0)
        if cached is not None:
            return cached

        # Fuzzy fallback: same perceptual hash + same desc + same image count
        cached = await _check_image_cache_by_phash(phash, desc_norm, len(compressed_paths), t0)
        if cached is not None:
            return cached

        logger.info(
            f"Cache MISS for batch {image_hash[:8]} (n={len(compressed_paths)}) "
            f"desc={desc_norm[:40]!r} - sending to AI"
        )
        response_text = await _request_ai_vision_quote(compressed_paths, description, image_hash, t0)

        # Clean up compressed files (they're separate from the scratch originals)
        for cp, op in zip(compressed_paths, image_paths):
            if cp != op and Path(cp).exists():
                Path(cp).unlink()

        items, total_price, explanation, scale_level, breakdown = _parse_ai_quote_response(response_text)

        # Cache the result for consistency
        await _cache_quote_analysis(cache_key, image_hash, desc_norm, items, total_price, explanation, scale_level, breakdown, phash)
        return items, total_price, explanation, scale_level, breakdown

    except InappropriateImageError:
        # Don't fallback — let the rejection bubble up to the endpoint.
        # Clean up the compressed scratch files we created.
        for cp, op in zip(compressed_paths, image_paths):
            if cp != op and Path(cp).exists():
                try:
                    Path(cp).unlink()
                except OSError:
                    pass
        raise
    except Exception as e:
        logger.error(f"AI vision analysis error: {e}")
        return await _enhanced_text_fallback(description)


def _perceptual_hash_batch(paths) -> str:
    """Compute a simple dhash (difference-hash) per image and join them.
    Robust to re-encoding / minor compression differences — two visually
    identical photos produce the same string. Pure-PIL, no external deps."""
    try:
        from PIL import Image as PILImage, ImageOps
        parts = []
        for p in paths:
            img = PILImage.open(p).convert("L")  # grayscale
            img = ImageOps.exif_transpose(img)
            img = img.resize((9, 8), PILImage.LANCZOS)
            pixels = list(img.getdata())
            bits = []
            for row in range(8):
                base = row * 9
                for col in range(8):
                    bits.append("1" if pixels[base + col] > pixels[base + col + 1] else "0")
            parts.append(f"{int(''.join(bits), 2):016x}")
        return "|".join(parts)
    except Exception as e:
        logger.warning(f"Perceptual hash failed: {e}")
        return ""


async def _check_image_cache_by_phash(phash: str, desc_norm: str, n_images: int, t0: float):
    """Fuzzy cache lookup keyed on perceptual hash + description + image count.

    Two passes:
      1. Exact phash match (fastest path — same photo, same compression).
      2. Hamming-distance match (≤ 10 bits across all 64-bit per-image hashes).
         Catches the case where the customer re-snaps the same scene from a
         slightly different angle/lighting and the dhash drifts by a few bits.
    """
    import time as _time
    if not phash:
        return None

    # 1) Exact match
    cached = await db.image_cache.find_one({
        "phash": phash,
        "desc_norm": desc_norm,
        "n_images": n_images,
    })
    if cached:
        logger.info(f"Cache HIT via phash exact (total {_time.monotonic()-t0:.1f}s)")
        return (
            [JunkItem(**item) for item in cached["items"]],
            cached["total_price"],
            cached["explanation"],
            cached.get("scale_level"),
            cached.get("breakdown")
        )

    # 2) Fuzzy match — the photo itself is the strongest signal. We ignore
    #    desc_norm in this pass (customers often rephrase / add typos on
    #    re-upload) and only require the SAME NUMBER of images so we're not
    #    comparing a single-photo quote against a 4-photo quote.
    #
    #    Hamming threshold: 15 bits per image (out of 64) — tight enough that
    #    visually different photos stay separate, loose enough that the same
    #    photo re-uploaded from a different phone / at a different JPEG
    #    quality still hits the cache. Threshold scales with image count.
    HAMMING_THRESHOLD_PER_IMAGE = 15
    new_parts = phash.split("|")
    threshold = HAMMING_THRESHOLD_PER_IMAGE * len(new_parts)
    cursor = db.image_cache.find({"n_images": n_images})
    async for candidate in cursor:
        cand_phash = candidate.get("phash") or ""
        if not cand_phash:
            continue
        cand_parts = cand_phash.split("|")
        if len(cand_parts) != len(new_parts):
            continue
        try:
            total_diff = sum(
                bin(int(a, 16) ^ int(b, 16)).count("1")
                for a, b in zip(new_parts, cand_parts)
            )
        except ValueError:
            continue
        if total_diff <= threshold:
            logger.info(
                f"Cache HIT via phash fuzzy (hamming={total_diff}/{threshold}, "
                f"desc_match={candidate.get('desc_norm') == desc_norm}, "
                f"total {_time.monotonic()-t0:.1f}s)"
            )
            return (
                [JunkItem(**item) for item in candidate["items"]],
                candidate["total_price"],
                candidate["explanation"],
                candidate.get("scale_level"),
                candidate.get("breakdown")
            )
    return None


def _compress_image_for_ai(image_path: str, t0: float) -> str:
    """Resize/compress image to 768px JPEG for fast hashing + AI upload.
    Falls back to the original path if compression fails."""
    import time as _time
    try:
        from PIL import Image as PILImage, ImageOps
        img = PILImage.open(image_path)
        # Auto-rotate based on EXIF orientation (iPhone/Samsung sideways photos)
        img = ImageOps.exif_transpose(img)
        max_dim = 768
        if max(img.size) > max_dim:
            ratio = max_dim / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, PILImage.LANCZOS)
        compressed_path = image_path.rsplit(".", 1)[0] + "_compressed.jpg"
        img.convert("RGB").save(compressed_path, "JPEG", quality=50, optimize=True)
        logger.info(
            f"Compressed image: {Path(image_path).stat().st_size // 1024}KB -> "
            f"{Path(compressed_path).stat().st_size // 1024}KB ({_time.monotonic()-t0:.1f}s)"
        )
        return compressed_path
    except Exception as e:
        logger.warning(f"Image compression failed, using original: {e}")
        return image_path


async def _check_image_cache(cache_key: str, image_hash: str, compressed_path: str, image_path: str, t0: float):
    """Return the cached analysis tuple if we've seen this (image+description) combo before, else None."""
    import time as _time
    cached_quote = await db.image_cache.find_one({"cache_key": cache_key})
    if not cached_quote:
        return None
    logger.info(f"Cache HIT for image {image_hash[:8]} (total {_time.monotonic()-t0:.1f}s)")
    if compressed_path != image_path and Path(compressed_path).exists():
        Path(compressed_path).unlink()
    return (
        [JunkItem(**item) for item in cached_quote["items"]],
        cached_quote["total_price"],
        cached_quote["explanation"],
        cached_quote.get("scale_level"),
        cached_quote.get("breakdown")
    )


def _build_vision_prompt(description: str, num_images: int = 1) -> str:
    """Centralized pricing prompt for the vision call.

    The prompt is deliberately anchored on explicit cubic-feet bands so the
    model has very little room to drift between calls. Coupled with
    temperature=0 / top_p=0 / seed in the AI call, the same photo always
    produces the same quote.
    """
    # When the customer uploads multiple photos of the SAME job (e.g. four
    # separate piles of junk around their property) the AI must aggregate
    # them into ONE combined quote, not treat each image as a separate job.
    multi_note = ""
    if num_images > 1:
        multi_note = (
            f"IMPORTANT: The customer has uploaded {num_images} photos of a SINGLE job "
            "(e.g. multiple piles at different spots on one property). Analyze ALL "
            f"{num_images} photos together and return ONE combined quote — sum all "
            "items/volumes across every photo. Do NOT return separate quotes.\n\n"
        )
    return (
        f"Junk removal pricing expert — Text2toss, Flagstaff AZ. GROUND LEVEL/CURBSIDE ONLY.\n\n"
        f"{multi_note}"
        f"Customer note: {description or 'None'}\n\n"

        "STEP 0 — CONTENT VALIDITY CHECK (most important).\n"
        "Before pricing, decide whether this photo represents legitimate residential\n"
        "junk-removal items that a 2-person crew would haul away in a pickup truck.\n"
        "REJECT (set is_inappropriate=true) any of:\n"
        "  • Human or animal remains (corpses, bones, blood, body parts, dead pets,\n"
        "    roadkill, internal organs, hunting trophies with raw flesh)\n"
        "  • Caskets, urns, coffins, or any funerary container\n"
        "  • Anything biohazardous: medical waste, used needles, soiled diapers in\n"
        "    bulk, chemical drums, asbestos, mold-infested debris\n"
        "  • Living things (people, live animals, plants in pots that look alive)\n"
        "  • Weapons, ammunition, explosives, propane/oxygen tanks\n"
        "  • Photos that are obviously joke uploads: ships (Titanic, boats over 12ft),\n"
        "    planes, helicopters, cars/trucks, buildings, mountains, celebrities,\n"
        "    memes, screenshots, drawings, anime, video-game stills, ANY image where\n"
        "    the primary subject is not real-world removable junk\n"
        "  • Nudity, sexual content, hateful imagery\n"
        "  • Empty rooms with no visible junk to remove\n"
        "When rejecting, return ONLY this JSON (no items, no price):\n"
        '{\"is_inappropriate\":true,\"rejection_reason\":\"<one short sentence the customer will see>\"}\n'
        "Examples of good rejection_reason values:\n"
        '  - \"We can\'t haul human or animal remains — please contact a licensed service.\"\n'
        '  - \"Looks like a joke upload. Please send a photo of the actual junk you need removed.\"\n'
        '  - \"This photo doesn\'t show any junk items. Try a clearer shot of the pile.\"\n'
        '  - \"For your safety we can\'t remove biohazardous material.\"\n'
        "If the photo IS legitimate junk (furniture, boxes, yard debris, appliances,\n"
        "mattresses, construction scraps, e-waste, etc.), set is_inappropriate=false\n"
        "and continue with the normal pricing flow below.\n\n"

        "STEP 1 — Estimate total cubic feet of junk in the photo(s). "
        "Use these anchors for consistency (always pick the same number for the same photo):\n"
        " - Microwave/toaster oven ≈ 3 cuft each\n"
        " - End table / small chair ≈ 8 cuft each\n"
        " - Office chair / nightstand ≈ 12 cuft each\n"
        " - Coffee table / large chair ≈ 20 cuft each\n"
        " - Loveseat / medium dresser ≈ 35 cuft each\n"
        " - Sofa / large dresser ≈ 55 cuft each\n"
        " - Sectional / wardrobe ≈ 75 cuft each\n"
        " - Mattress (queen) ≈ 25 cuft, (king) ≈ 35 cuft\n"
        " - Trash bag full ≈ 4 cuft each\n"
        "Add 15% buffer for irregular shapes, +20% for heavy items (concrete, dirt, wet wood).\n\n"

        "BULKY-DIY UPCHARGE (very important — pallet & solid-wood DIY furniture):\n"
        " Pallet-built furniture (sectionals, couches, tables, beds made from wood\n"
        " pallets) and other DIY/homemade solid-wood furniture are MUCH heavier and\n"
        " harder to handle than they look. A pallet sectional weighs 200–400 lbs of\n"
        " solid hardwood nailed together, sits low to the ground (awkward lift), and\n"
        " often has exposed nails/splinters requiring PPE. Same logic applies to:\n"
        "  • DIY plywood/2x4 furniture (custom shelves, workbenches, lofted beds)\n"
        "  • Solid hardwood antiques (armoires, china cabinets, pianos)\n"
        "  • Workout equipment (treadmills, weight benches, ellipticals)\n"
        "  • Hot tubs, large generators, cast-iron stoves\n"
        " When ANY of these items dominate the photo, bump the final scale_level by\n"
        " +2 (e.g., a scale-9 pallet sectional becomes scale_level 11). Do NOT\n"
        " mention this bump in the customer-facing `explanation` field — keep the\n"
        " explanation about volume/items only, never about the bulk surcharge.\n"
        " Do NOT also flag heavy_pile=true — that's a separate signal for loose\n"
        " bulk material, not for finished furniture.\n\n"

        "STEP 2 — Map total cubic feet to scale_level (pick the LOWEST scale whose max ≥ your estimate):\n"
        " 1:≤2cuft|2:≤4|3:≤10|4:≤18|5:≤30|6:≤45|7:≤60|8:≤80|9:≤100|10:≤125|"
        "11:≤150|12:≤180|13:≤215|14:≤255|15:≤300|16:≤350|17:≤405|18:≤465|19:≤530|20:≤600\n\n"
        "STEP 3 — Look up the price for that scale_level (no rounding, no swing):\n"
        " 1:$15|2:$20|3:$50|4:$63|5:$78|6:$95|7:$115|8:$138|9:$163|10:$190|"
        "11:$220|12:$253|13:$290|14:$333|15:$380|16:$433|17:$490|18:$553|19:$620|20:$703\n\n"
        "DETERMINISM RULES — read carefully, your output must be reproducible:\n"
        " • The SAME photo MUST always produce the SAME cubic_feet and scale_level.\n"
        " • Do not vary by mood, lighting interpretation, or 'best-guess swings'.\n"
        " • If unsure between two scales, ALWAYS pick the lower one.\n"
        " • cubic_feet must be a whole number.\n\n"
        "HEAVY-PILE DETECTION (separate from pricing):\n"
        ' Set "heavy_pile": true ONLY when ≥70% of the visual area of the photo(s) is\n'
        " ONE pile of heavy bulk material: dirt, sandbags, concrete chunks/rubble, rock,\n"
        " gravel, wood chips, mulch, or fill dirt. Mixed-junk photos (couch + boxes +\n"
        " some debris) must stay false. Single bagged item ≠ pile.\n"
        ' Set "heavy_material_type" to a short label like "dirt", "sandbags+concrete",\n'
        ' or "wood chips". Use null/empty when heavy_pile is false.\n\n'
        'JSON only (legitimate junk path):\n'
        '{"is_inappropriate":false,"rejection_reason":null,'
        '"items":[{"name":"item","quantity":1,"size":"small/medium/large","description":"brief"}],'
        '"total_price":150.00,"scale_level":5,"cubic_feet":62,'
        '"heavy_pile":false,"heavy_material_type":null,'
        '"breakdown":{"base_price":"140.00","volume_assessment":"Medium load",'
        '"items":[{"name":"Table","size":"large","estimated_cost":80.00}],'
        '"factors":["Ground level"],"additional_charges":10.00,"total":150.00},'
        '"explanation":"Scale 5 - table and chairs."}'
    )


async def _request_ai_vision_quote(compressed_paths, description: str, image_hash: str, t0: float) -> str:
    """Send one or more compressed images + prompt to Gemini Flash and return the raw response.

    Accepts either a single path (legacy) or a list of paths for multi-image
    quotes. Gemini 3 Flash Preview handles multi-image prompts natively — we
    just hand it the full list of FileContentWithMimeType objects.
    """
    import time as _time
    if isinstance(compressed_paths, (str, Path)):
        compressed_paths = [str(compressed_paths)]

    image_files = [
        FileContentWithMimeType(file_path=str(p), mime_type="image/jpeg")
        for p in compressed_paths
    ]
    chat = (
        LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"vision_{image_hash}",
            system_message="Junk removal pricing expert. Respond with valid JSON only."
        )
        .with_model("gemini", "gemini-3-flash-preview")
        # Determinism: temperature/top_p=0 → same photo always returns the
        # same quote. This kills the "uploaded same photo 3x and got 3
        # different prices" complaint. (Gemini doesn't support `seed`.)
        .with_params(temperature=0, top_p=0)
    )
    user_message = UserMessage(
        text=_build_vision_prompt(description, num_images=len(image_files)),
        file_contents=image_files,
    )
    t_ai = _time.monotonic()
    response = await chat.send_message(user_message)
    logger.info(
        f"AI response in {_time.monotonic()-t_ai:.1f}s "
        f"(n_images={len(image_files)}, total {_time.monotonic()-t0:.1f}s)"
    )
    return response.strip()


class InappropriateImageError(Exception):
    """Raised when the AI vision model flags the uploaded photo as
    off-topic / unsafe / biohazardous. Bubbles up as HTTP 400 to the customer."""
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def _parse_ai_quote_response(response_text: str):
    """Extract JSON, build JunkItems, return the 5-tuple. Cubic feet is
    returned via the `breakdown` dict so the API response shape stays stable.

    Raises InappropriateImageError if the AI flagged the photo as off-topic
    (Titanic, casket, animal remains, weapons, biohazard, joke upload, etc.).
    """
    json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
    if json_match:
        response_text = json_match.group(0)
    analysis_data = json.loads(response_text)

    # Content-validity gate — AI refused the image.
    if analysis_data.get("is_inappropriate") is True:
        reason = (
            analysis_data.get("rejection_reason")
            or "This photo can't be processed. Please upload a photo of removable junk items."
        )
        raise InappropriateImageError(str(reason).strip()[:300])

    items = [
        JunkItem(
            name=item_data.get("name", "Unknown item"),
            quantity=item_data.get("quantity", 1),
            size=item_data.get("size", "medium"),
            description=item_data.get("description", "")
        )
        for item_data in analysis_data.get("items", [])
    ]
    total_price = float(analysis_data.get("total_price", 0))
    explanation = analysis_data.get("explanation", "AI vision analysis of uploaded image")
    scale_level = analysis_data.get("scale_level")
    breakdown = analysis_data.get("breakdown") or {}
    # Surface cubic feet on the breakdown so the customer's progress UI can
    # show it. Tolerate either string or number from the model.
    cubic_feet = analysis_data.get("cubic_feet")
    if cubic_feet is not None and "cubic_feet" not in breakdown:
        try:
            breakdown["cubic_feet"] = float(cubic_feet)
        except (TypeError, ValueError):
            pass
    # Heavy-pile flag — only true when ≥70% of the photo is dirt/sandbags/etc.
    # Stored on breakdown so the 5-tuple signature stays stable.
    if "heavy_pile" not in breakdown:
        breakdown["heavy_pile"] = bool(analysis_data.get("heavy_pile", False))
    if "heavy_material_type" not in breakdown:
        breakdown["heavy_material_type"] = analysis_data.get("heavy_material_type") or None
    return items, total_price, explanation, scale_level, breakdown


async def _cache_quote_analysis(cache_key, image_hash, desc_norm, items, total_price, explanation, scale_level, breakdown, phash: str = ""):
    cache_data = {
        "cache_key": cache_key,
        "image_hash": image_hash,
        "description_norm": desc_norm,
        "desc_norm": desc_norm,        # mirrored field for phash-based lookups
        "phash": phash,
        "n_images": len((phash or "").split("|")) if phash else 1,
        "items": [item.dict() for item in items],
        "total_price": total_price,
        "explanation": explanation,
        "scale_level": scale_level,
        "breakdown": breakdown,
        "cached_at": datetime.now(timezone.utc).isoformat()
    }
    try:
        await db.image_cache.insert_one(cache_data)
        logger.info(f"Cached analysis for image {image_hash[:8]} desc={desc_norm[:40]!r}")
    except Exception as cache_error:
        logger.warning(f"Failed to cache analysis: {cache_error}")


async def _enhanced_text_fallback(description: str):
    """Two-tier fallback: description-based AI pricing → flat estimate."""
    if description and description.strip():
        logger.info(f"Attempting text-AI fallback with description: {description[:80]}")
        try:
            fallback_items = [JunkItem(name="Items from image description", quantity=1, size="large", description=description)]
            fallback_price, fallback_explanation, scale_level, breakdown = await calculate_ai_price(
                fallback_items, f"Image analysis unavailable. Based on description: {description}"
            )
            return (
                fallback_items, fallback_price,
                f"Image analysis temporarily unavailable. Pricing based on description: {fallback_explanation}",
                scale_level, breakdown
            )
        except Exception as text_ai_error:
            logger.warning(f"Text-based fallback also failed: {text_ai_error}")

    # Basic flat-rate fallback when nothing else works
    fallback_items = [JunkItem(name="Unidentified items from image", quantity=1, size="medium")]
    return (
        fallback_items, 75.0,
        "Image analysis temporarily unavailable. Basic estimate provided - please describe items for accurate pricing.",
        None, None
    )

# Authentication helpers
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(user_id: str) -> str:
    payload = {"user_id": user_id}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = None) -> str:
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("user_id")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Routes
@api_router.get("/")
async def root():
    return {"message": "Text2toss Junk Removal API"}

@api_router.post("/auth/register", response_model=dict)
async def register(user_data: UserCreate):
    # Check if user already exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    user_dict = user_data.dict()
    user_dict["password"] = hash_password(user_data.password)
    user = User(**{k: v for k, v in user_dict.items() if k != "password"})
    
    user_mongo = prepare_for_mongo(user.dict())
    user_mongo["password"] = user_dict["password"]
    
    await db.users.insert_one(user_mongo)
    
    token = create_access_token(user.id)
    return {"token": token, "user": user}

@api_router.post("/auth/login", response_model=dict)
async def login(login_data: UserLogin):
    user_doc = await db.users.find_one({"email": login_data.email})
    if not user_doc:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    
    if not verify_password(login_data.password, user_doc["password"]):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    
    user_doc = parse_from_mongo(user_doc)
    user = User(**{k: v for k, v in user_doc.items() if k != "password"})
    
    token = create_access_token(user.id)
    return {"token": token, "user": user}

@api_router.post("/quotes", response_model=PriceQuote)
async def create_quote(quote_data: PriceQuoteCreate):
    # Validate that items exist
    if not quote_data.items or len(quote_data.items) == 0:
        raise HTTPException(status_code=400, detail="At least one item is required for a quote")
    
    # Use AI to calculate intelligent pricing
    total_price, ai_explanation, scale_level, breakdown = await calculate_ai_price(quote_data.items, quote_data.description)
    
    # Determine if quote requires approval (Scale 9-20)
    requires_approval = scale_level and scale_level >= 9
    approval_status = "pending_approval" if requires_approval else "auto_approved"
    
    quote = PriceQuote(
        user_id="anonymous",  # Allow anonymous quotes
        items=quote_data.items,
        total_price=total_price,
        scale_level=scale_level,
        breakdown=breakdown,
        description=quote_data.description,
        ai_explanation=ai_explanation,
        requires_approval=requires_approval,
        approval_status=approval_status
    )
    
    quote_mongo = prepare_for_mongo(quote.dict())
    await db.quotes.insert_one(quote_mongo)
    
    return quote

async def cleanup_old_quote_images(keep_count: int = 30):
    """Keep only the latest N quote images, delete older ones"""
    try:
        quote_images_dir = Path("/app/static/quote_images")
        if not quote_images_dir.exists():
            return
        
        # Get all quote image files sorted by modification time (newest first)
        image_files = sorted(
            [f for f in quote_images_dir.glob("quote_*") if f.is_file()],
            key=lambda f: f.stat().st_mtime,
            reverse=True
        )
        
        # Delete files beyond the keep_count
        for old_file in image_files[keep_count:]:
            try:
                old_file.unlink()
                logger.info(f"Cleaned up old quote image: {old_file.name}")
            except Exception as e:
                logger.error(f"Failed to delete {old_file.name}: {str(e)}")
    except Exception as e:
        logger.error(f"Error during quote image cleanup: {str(e)}")

@api_router.post("/quotes/image", response_model=PriceQuote)
async def create_quote_from_image(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(default=None),
    files: List[UploadFile] = File(default_factory=list),
    description: str = Form(default="")
):
    """Create a single quote by analyzing ONE OR MORE uploaded images.

    For multi-pile jobs (customer has 4 piles of junk around their property),
    the frontend sends all photos as repeated `files` form fields. The backend
    hands all photos to the AI vision model in a single request so it can see
    the full scope and return one aggregated item list + price.

    The legacy single-photo API continues to work via the `file` field.
    """
    # Normalize: accept either legacy `file` or the new `files` list (or both).
    uploads: List[UploadFile] = []
    if files:
        uploads.extend(files)
    if file is not None:
        uploads.append(file)
    if not uploads:
        raise HTTPException(status_code=400, detail="At least one image is required")
    if len(uploads) > 8:
        # Soft cap — AI cost/latency scales with image count.
        raise HTTPException(status_code=400, detail="Up to 8 images per quote")

    print(f"Image quote endpoint received {len(uploads)} image(s); description: '{description}'")

    for upload in uploads:
        _validate_image_upload(upload)

    db_paths, scratch_paths = await _save_images_permanently(uploads)
    primary_db_path = db_paths[0]

    try:
        items, total_price, ai_explanation, scale_level, breakdown = await analyze_image_for_quote(
            [str(p) for p in scratch_paths], description
        )
        quote = _build_quote_record(items, total_price, scale_level, breakdown, ai_explanation, description, primary_db_path)
        quote.temp_image_paths = db_paths
        await db.quotes.insert_one(prepare_for_mongo(quote.dict()))

        logger.info(
            f"Quote created: id={quote.id}, scale={scale_level}, "
            f"requires_approval={quote.requires_approval}, approval_status={quote.approval_status}, "
            f"images={len(db_paths)} (first={Path(primary_db_path).name})"
        )
        background_tasks.add_task(cleanup_old_quote_images, 30)
        return quote

    except InappropriateImageError as exc:
        # Content filter rejected the upload — clean up and surface 400 to client.
        logger.info(f"Quote rejected by content filter: {exc.reason}")
        for scratch in scratch_paths:
            if scratch.exists():
                try:
                    scratch.unlink()
                except OSError:
                    pass
        for db_path in db_paths:
            if not object_storage.looks_like_storage_path(db_path):
                orphan = Path(db_path)
                if orphan.exists():
                    try:
                        orphan.unlink()
                    except OSError:
                        pass
        raise HTTPException(status_code=400, detail=exc.reason)

    except Exception:
        # Drop scratch files + any disk-fallback orphans. We don't delete from
        # object storage (no delete API — GC handles it).
        for scratch in scratch_paths:
            if scratch.exists():
                scratch.unlink()
        for db_path in db_paths:
            if not object_storage.looks_like_storage_path(db_path):
                orphan = Path(db_path)
                if orphan.exists():
                    orphan.unlink()
        raise

    finally:
        for scratch in scratch_paths:
            if scratch.exists():
                try:
                    scratch.unlink()
                except OSError:
                    pass


def _validate_image_upload(file: UploadFile) -> None:
    """Guard clause — only accept image/* uploads."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")


async def _save_image_permanently(file: UploadFile) -> tuple[str, Path]:
    """Persist a single upload. Convenience wrapper around _save_images_permanently."""
    db_paths, scratch_paths = await _save_images_permanently([file])
    return db_paths[0], scratch_paths[0]


async def _save_images_permanently(files: List[UploadFile]) -> tuple[List[str], List[Path]]:
    """Persist N uploads in order; returns (db_paths, scratch_paths).

    `db_paths[i]` is the storage-or-disk path we save on the quote record.
    `scratch_paths[i]` is a local file the AI vision pipeline reads. Caller
    must unlink the scratch files after analysis.
    """
    db_paths: List[str] = []
    scratch_paths: List[Path] = []
    scratch_dir = Path("/tmp/text2toss_uploads")
    scratch_dir.mkdir(parents=True, exist_ok=True)

    for file in files:
        file_extension = Path(file.filename or "photo.jpg").suffix or ".jpg"
        filename = f"quote_{uuid.uuid4()}{file_extension}"
        data = await file.read()

        scratch_path = scratch_dir / filename
        async with aiofiles.open(scratch_path, "wb") as fh:
            await fh.write(data)
        scratch_paths.append(scratch_path)

        try:
            storage_key = object_storage.storage_path("quote_images", filename)
            object_storage.put_bytes(storage_key, data, file.content_type or "image/jpeg")
            db_paths.append(storage_key)
        except Exception as exc:
            logger.error("[storage] quote upload failed for %s: %s", filename, exc)
            # Fail loudly instead of writing to ephemeral pod disk — files
            # persisted only on the pod are invisible after redeploys and
            # will 404 in production.
            raise HTTPException(status_code=502, detail="Image upload failed — please retry") from exc

    return db_paths, scratch_paths


def _build_quote_record(items, total_price, scale_level, breakdown, ai_explanation, description, file_path) -> PriceQuote:
    """Assemble the PriceQuote — including the requires_approval threshold (>=9)."""
    requires_approval = scale_level is not None and scale_level >= 9
    # Heavy-pile flags are smuggled in via breakdown by _parse_ai_quote_response.
    heavy_pile = bool((breakdown or {}).get("heavy_pile"))
    heavy_material_type = (breakdown or {}).get("heavy_material_type") or None
    return PriceQuote(
        user_id="anonymous",
        items=items,
        total_price=total_price,
        scale_level=scale_level,
        breakdown=breakdown,
        description=f"Image analysis: {description}" if description else "Image-based quote",
        ai_explanation=ai_explanation,
        temp_image_path=str(file_path),
        requires_approval=requires_approval,
        approval_status="pending_approval" if requires_approval else "auto_approved",
        heavy_pile=heavy_pile,
        heavy_material_type=heavy_material_type,
    )

@api_router.get("/quotes/{quote_id}", response_model=PriceQuote)
async def get_quote(quote_id: str):
    quote_doc = await db.quotes.find_one({"id": quote_id})
    if not quote_doc:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    quote_doc = parse_from_mongo(quote_doc)
    return PriceQuote(**quote_doc)


# Flat fee applied when the customer confirms a heavy pile needs equipment
# (skid steer / dolly / ramps). Hardcoded per pricing decision.
EQUIPMENT_FEE = 150.0


class EquipmentToggleRequest(BaseModel):
    equipment_required: bool


@api_router.patch("/quotes/{quote_id}/equipment")
async def set_quote_equipment(quote_id: str, body: EquipmentToggleRequest):
    """Toggle the heavy-material equipment add-on on a quote.

    Only callable on quotes flagged `heavy_pile=true` by the AI vision pass.
    Adds (or removes) a flat $150 to the displayed total. The base
    `total_price` from the AI stays untouched — the surcharge is tracked
    separately so it can be itemized in emails / receipts.
    """
    quote_doc = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not quote_doc:
        raise HTTPException(status_code=404, detail="Quote not found")
    if not quote_doc.get("heavy_pile"):
        raise HTTPException(
            status_code=400,
            detail="This quote was not flagged as a heavy pile. Equipment toggle not applicable."
        )

    fee = EQUIPMENT_FEE if body.equipment_required else 0.0
    await db.quotes.update_one(
        {"id": quote_id},
        {"$set": {
            "equipment_required": body.equipment_required,
            "equipment_fee": fee,
        }}
    )
    return {
        "success": True,
        "equipment_required": body.equipment_required,
        "equipment_fee": fee,
        "base_total": quote_doc.get("total_price", 0),
        "combined_total": (quote_doc.get("total_price", 0) or 0) + fee,
    }

def _build_admin_booking_notification(booking, quote_doc, requires_approval):
    """Build the admin notification HTML email for a new booking."""
    status_class = 'approval-required' if requires_approval else 'ready-to-pay'
    status_text = 'PENDING APPROVAL' if requires_approval else 'READY FOR PAYMENT'
    action_html = (
        '<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:15px;margin:20px 0;border-radius:5px;">'
        '<strong>Action Required:</strong> This quote requires your approval before the customer can proceed with payment.</div>'
        if requires_approval else
        '<div style="background:#d1fae5;border-left:4px solid #10b981;padding:15px;margin:20px 0;border-radius:5px;">'
        '<strong>Ready:</strong> Customer can proceed with payment.</div>'
    )
    instructions_html = (
        f'<div class="detail-row"><span class="detail-label">Special Instructions:</span>'
        f'<span class="detail-value">{booking.special_instructions}</span></div>'
        if booking.special_instructions else ''
    )
    return f"""<!DOCTYPE html><html><head><style>
body{{font-family:Arial,sans-serif;line-height:1.6;color:#333}}
.container{{max-width:600px;margin:0 auto;padding:20px;background:#fff}}
.header{{background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:30px;text-align:center;border-radius:10px 10px 0 0}}
.content{{background:#f9fafb;padding:30px;border-radius:0 0 10px 10px}}
.booking-details{{background:#fff;padding:20px;margin:20px 0;border-radius:8px;border:2px solid #10b981}}
.detail-row{{padding:10px 0;border-bottom:1px solid #e5e7eb}}
.detail-label{{font-weight:bold;color:#374151}}
.detail-value{{color:#1f2937}}
.status-badge{{display:inline-block;padding:6px 12px;border-radius:20px;font-size:14px;font-weight:600}}
.{status_class}{{background:#fef3c7;color:#92400e;border:2px solid #f59e0b}}
</style></head><body><div class="container">
<div class="header"><h1 style="margin:0">New Booking Received!</h1></div>
<div class="content"><div class="booking-details">
<h2 style="margin-top:0;color:#10b981">Booking Information</h2>
<div class="detail-row"><span class="detail-label">Status:</span>
<span class="status-badge {status_class}">{status_text}</span></div>
<div class="detail-row"><span class="detail-label">Customer Email:</span>
<span class="detail-value">{booking.email}</span></div>
<div class="detail-row"><span class="detail-label">Phone:</span>
<span class="detail-value">{booking.phone}</span></div>
<div class="detail-row"><span class="detail-label">Address:</span>
<span class="detail-value">{booking.address}</span></div>
<div class="detail-row"><span class="detail-label">Pickup Date:</span>
<span class="detail-value">{booking.pickup_date.strftime('%B %d, %Y')}</span></div>
<div class="detail-row"><span class="detail-label">Pickup Time:</span>
<span class="detail-value">{booking.pickup_time}</span></div>
<div class="detail-row"><span class="detail-label">Quote Amount:</span>
<span class="detail-value" style="font-size:24px;font-weight:bold;color:#10b981">${quote_doc.get('total_price',0):.2f}</span></div>
{instructions_html}
<div class="detail-row" style="border-bottom:none"><span class="detail-label">Curbside Confirmed:</span>
<span class="detail-value">{'Yes' if booking.curbside_confirmed else 'No'}</span></div>
</div>{action_html}
<div style="text-align:center;margin-top:30px">
<p style="color:#6b7280;font-size:14px;margin:0">Booking ID: {booking.id}</p>
<p style="color:#6b7280;font-size:12px;margin-top:5px">Received: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</p>
</div></div></div></body></html>"""


def _build_under_review_email(booking, quote_doc):
    """Thin wrapper — delegates to templates.email_templates."""
    return email_templates.quote_under_review_email(booking, quote_doc)


@api_router.post("/bookings", response_model=Booking)
async def create_booking(booking_data: BookingCreate, request: Request, token: str = None):
    """Create a booking from an existing quote.

    Implementation broken down into focused helpers:
      - _resolve_user_id            → optionally look up authenticated user
      - _validate_pickup_request    → ensures Mon-Thu + slot availability
      - _build_booking              → constructs the Booking object
      - _send_post_booking_emails   → admin + customer notifications
      - _send_post_booking_sms      → optional confirmation SMS
    """
    if not booking_data.consent_accepted:
        raise HTTPException(
            status_code=400,
            detail="You must accept the Terms of Service and Refund Policy to book."
        )

    user_id = await _resolve_user_id(token)

    quote_doc = await db.quotes.find_one({"id": booking_data.quote_id})
    if not quote_doc:
        raise HTTPException(status_code=404, detail="Quote not found")

    pickup_datetime = await _validate_pickup_request(booking_data)

    consent_meta = _capture_consent_metadata(request)
    booking = _build_booking(booking_data, pickup_datetime, quote_doc, user_id, consent_meta)
    await db.bookings.insert_one(prepare_for_mongo(booking.dict()))

    quote_requires_approval = quote_doc.get("requires_approval", False)
    logging.info(
        f"Booking created: {booking.id}, Quote ID: {booking.quote_id}, "
        f"Requires Approval: {quote_requires_approval}, Email: {booking.email}"
    )

    await _send_post_booking_emails(booking, quote_doc, quote_requires_approval)
    await _send_post_booking_sms(booking)
    return booking


async def _resolve_user_id(token: Optional[str]) -> str:
    """Best-effort: resolve user id from token; falls back to anonymous."""
    if not token:
        return "anonymous"
    try:
        return await get_current_user(token)
    except Exception:
        return "anonymous"


async def _validate_pickup_request(booking_data: BookingCreate) -> datetime:
    """Parse pickup datetime, enforce Mon-Thu, and ensure the slot is free."""
    pickup_datetime = datetime.fromisoformat(booking_data.pickup_date)

    # 0=Mon ... 6=Sun. We allow Monday-Thursday only.
    if pickup_datetime.weekday() > 3:
        raise HTTPException(
            status_code=400,
            detail="Pickup not available on Fridays or weekends. Please select Monday-Thursday."
        )

    existing_booking = await db.bookings.find_one({
        "pickup_date": {"$regex": f"^{booking_data.pickup_date}"},
        "pickup_time": booking_data.pickup_time,
        "status": {"$in": ["scheduled", "in_progress"]}
    })
    if existing_booking:
        raise HTTPException(
            status_code=409,
            detail=f"Time slot {booking_data.pickup_time} is already booked for {booking_data.pickup_date}"
        )

    # Priority slot validation — max per-day cap (admin configurable)
    if booking_data.priority_tier:
        fees = await _get_priority_fees()
        if booking_data.priority_tier not in fees:
            raise HTTPException(status_code=400, detail="Invalid priority tier")
        cap = await _get_priority_max_per_day()
        priority_count = await _count_priority_bookings_for_date(booking_data.pickup_date)
        if priority_count >= cap:
            raise HTTPException(
                status_code=409,
                detail=f"Priority slots are full for {booking_data.pickup_date}. Choose a different date or remove priority."
            )
    return pickup_datetime


# === Priority Pickup ====================================================
# Default fees / cap. These are the *fallback* when the admin hasn't
# overridden values in /admin/marketing/settings.
PRIORITY_FEES = {
    "same_day": 75.0,
    "next_slot": 40.0,
    "emergency": 100.0,
}
MAX_PRIORITY_PER_DAY = 2
CONSENT_VERSION = "2026-02-01"  # bump when terms/refund policy materially changes

# Tiny in-process cache so high-traffic paths (BookingCreate, availability
# endpoint) don't slam Mongo on every request. Refreshed on save.
_PRIORITY_SETTINGS_CACHE: dict = {"fees": None, "cap": None}


def _coerce_priority_fees(raw: dict | None) -> dict:
    """Validate + normalize an admin-supplied priority_fees dict."""
    out = dict(PRIORITY_FEES)
    if not isinstance(raw, dict):
        return out
    for tier in ("same_day", "next_slot", "emergency"):
        v = raw.get(tier)
        try:
            if v is not None:
                fee = float(v)
                if 0 <= fee <= 1000:
                    out[tier] = fee
        except (TypeError, ValueError):
            continue
    return out


async def _get_priority_fees() -> dict:
    cached = _PRIORITY_SETTINGS_CACHE.get("fees")
    if cached is not None:
        return cached
    doc = await db.marketing_settings.find_one({"_id": "singleton"}, {"_id": 0})
    fees = _coerce_priority_fees((doc or {}).get("priority_fees"))
    _PRIORITY_SETTINGS_CACHE["fees"] = fees
    return fees


async def _get_priority_max_per_day() -> int:
    cached = _PRIORITY_SETTINGS_CACHE.get("cap")
    if cached is not None:
        return cached
    doc = await db.marketing_settings.find_one({"_id": "singleton"}, {"_id": 0})
    raw = (doc or {}).get("priority_max_per_day", MAX_PRIORITY_PER_DAY)
    try:
        cap = int(raw)
        cap = max(0, min(cap, 20))
    except (TypeError, ValueError):
        cap = MAX_PRIORITY_PER_DAY
    _PRIORITY_SETTINGS_CACHE["cap"] = cap
    return cap


def _get_priority_fees_sync() -> dict:
    """Synchronous accessor for code paths that already loaded fees, or
    fall back to PRIORITY_FEES defaults. Safe to call from non-async helpers."""
    cached = _PRIORITY_SETTINGS_CACHE.get("fees")
    return cached if cached is not None else dict(PRIORITY_FEES)


def _invalidate_priority_cache() -> None:
    _PRIORITY_SETTINGS_CACHE["fees"] = None
    _PRIORITY_SETTINGS_CACHE["cap"] = None


async def _count_priority_bookings_for_date(date_str: str) -> int:
    """Count existing priority bookings for a given YYYY-MM-DD."""
    return await db.bookings.count_documents({
        "pickup_date": {"$regex": f"^{date_str}"},
        "priority_tier": {"$in": list(PRIORITY_FEES.keys())},
        "status": {"$nin": ["cancelled"]},
    })


@api_router.get("/priority/config")
async def get_priority_config():
    """Public, date-agnostic priority pricing config. Used by booking UI
    to render up-to-date fee amounts without doing a date lookup."""
    fees = await _get_priority_fees()
    cap = await _get_priority_max_per_day()
    return {"fees": fees, "max_per_day": cap}


@api_router.get("/priority/availability")
async def get_priority_availability(date: str):
    """Return priority-slot availability for the given YYYY-MM-DD.

    Public endpoint used by the booking flow to show "Priority full — try
    [next available date]" hints before the customer commits.
    """
    try:
        target = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

    fees = await _get_priority_fees()
    cap = await _get_priority_max_per_day()
    used = await _count_priority_bookings_for_date(date)
    available = max(0, cap - used)

    # If full, scan forward for the next date with capacity (max 14 days)
    next_available = None
    if available == 0:
        for delta in range(1, 15):
            candidate = target + timedelta(days=delta)
            if candidate.weekday() > 3:  # skip Fri/Sat/Sun
                continue
            if await _count_priority_bookings_for_date(candidate.isoformat()) < cap:
                next_available = candidate.isoformat()
                break

    return {
        "date": date,
        "used": used,
        "available": available,
        "max_per_day": cap,
        "fees": fees,
        "next_available_date": next_available,
    }


def _capture_consent_metadata(request: Request) -> dict:
    """Pull IP + User-Agent from the request for legal/dispute defense.
    Respects X-Forwarded-For when behind a proxy (Kubernetes ingress)."""
    fwd = request.headers.get("x-forwarded-for", "")
    client_ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)
    return {
        "ip": client_ip,
        "user_agent": request.headers.get("user-agent"),
        "accepted_at": datetime.now(timezone.utc),
    }


def _build_booking(
    booking_data: BookingCreate,
    pickup_datetime: datetime,
    quote_doc: dict,
    user_id: str,
    consent_meta: Optional[dict] = None,
) -> "Booking":
    """Assemble the Booking object, including initial status based on approval rules."""
    # "Pay in person" customers go straight to `scheduled` so the job lands on
    # the admin calendar immediately (no Venmo wait). Payment_status stays
    # `pending` until the admin marks it paid after pickup.
    # Pay-in-person OVERRIDES the high-scale approval gate — admin will see the
    # job, talk to the customer in person, and can adjust the cash amount on
    # pickup. No reason to bury cash bookings in approval limbo.
    if booking_data.pay_in_person:
        booking_status = "scheduled"
    elif quote_doc.get("requires_approval", False):
        booking_status = "pending_customer_approval"
    else:
        booking_status = "pending_payment"
    payment_method = "cash" if booking_data.pay_in_person else "venmo"
    fees = _get_priority_fees_sync()
    priority_fee = fees.get(booking_data.priority_tier, 0.0) if booking_data.priority_tier else 0.0
    # Carry the equipment add-on (set by the customer on the quote screen) onto the booking.
    equipment_required = bool(quote_doc.get("equipment_required"))
    equipment_fee = float(quote_doc.get("equipment_fee") or 0.0)
    meta = consent_meta or {}
    return Booking(
        user_id=user_id,
        quote_id=booking_data.quote_id,
        pickup_date=pickup_datetime,
        pickup_time=booking_data.pickup_time,
        address=booking_data.address,
        phone=booking_data.phone,
        email=booking_data.email,
        special_instructions=booking_data.special_instructions,
        curbside_confirmed=booking_data.curbside_confirmed,
        email_notifications=booking_data.email_notifications,
        image_path=quote_doc.get("temp_image_path"),
        status=booking_status,
        payment_method=payment_method,
        priority_tier=booking_data.priority_tier,
        priority_fee=priority_fee,
        equipment_required=equipment_required,
        equipment_fee=equipment_fee,
        consent_accepted=booking_data.consent_accepted,
        consent_accepted_at=meta.get("accepted_at"),
        consent_ip=meta.get("ip"),
        consent_user_agent=meta.get("user_agent"),
        consent_version=CONSENT_VERSION,
    )


async def _send_post_booking_emails(booking: "Booking", quote_doc: dict, quote_requires_approval: bool):
    """Send admin notification + customer email (under-review or confirmation)."""
    if not is_email_enabled():
        logging.warning("Email NOT sent - email is disabled in environment")
        return

    # Admin notification — never blocks customer flow
    try:
        admin_email = os.environ.get("EMAIL_FROM", "text2toss@gmail.com")
        admin_subject = f"New Booking Received - ${quote_doc.get('total_price', 0):.2f}"
        admin_html = _build_admin_booking_notification(booking, quote_doc, quote_requires_approval)
        await send_email(admin_email, admin_subject, admin_html)
        logging.info(f"Admin notification email sent to {admin_email} for booking {booking.id}")
    except Exception as admin_email_error:
        logging.error(f"Failed to send admin notification email: {admin_email_error}")

    # Customer email
    if not booking.email:
        logging.warning(f"Email NOT sent - no email address provided for booking {booking.id}")
        return

    if quote_requires_approval:
        logging.info("Quote requires approval - sending 'Under Review' email")
        email_html = _build_under_review_email(booking, quote_doc)
        subject = "Quote Submitted - Under Review | Text2toss"
    else:
        logging.info("Quote auto-approved - sending standard booking confirmation")
        email_html = create_booking_confirmation_email(booking.dict(), quote_doc)
        subject = f"🎉 Booking Confirmed - {booking.pickup_date.strftime('%B %d, %Y')}"
    email_result = await send_email(to_email=booking.email, subject=subject, html_content=email_html)
    logging.info(f"Booking email sent to {booking.email}: {email_result}")


async def _send_post_booking_sms(booking: "Booking"):
    """Send a confirmation SMS if SMS is enabled and the phone number is usable."""
    if not is_sms_enabled():
        return

    phone = (booking.phone or "").replace("(", "").replace(")", "").replace(" ", "").replace("-", "")
    if not phone:
        return
    if not phone.startswith("+"):
        phone = "+1" + phone

    pickup_date_str = booking.pickup_date.strftime("%B %d, %Y")
    confirmation_message = (
        f"✅ Text2toss Confirmed: Junk removal scheduled for {pickup_date_str} "
        f"between {booking.pickup_time} at {booking.address}. Check your email for details!"
    )
    sms_result = await send_sms(phone, confirmation_message)
    logging.info(f"Booking confirmation SMS sent: {sms_result}")

@api_router.get("/bookings/lookup")
async def lookup_bookings(email: str):
    """Customer-facing: look up bookings by email"""
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    bookings = await db.bookings.find({"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}).sort("created_at", -1).to_list(20)
    
    result = []
    for booking in bookings:
        if "_id" in booking:
            del booking["_id"]
        b = parse_from_mongo(booking)
        # Get quote details
        quote = await db.quotes.find_one({"id": b.get("quote_id")})
        if quote:
            if "_id" in quote:
                del quote["_id"]
            b["quote_details"] = {
                "total_price": quote.get("total_price"),
                "approved_price": quote.get("approved_price"),
                "approval_status": quote.get("approval_status"),
                "items": quote.get("items", [])
            }
        result.append(b)
    
    return result

@api_router.get("/bookings/{booking_id}/payment-info")
async def get_booking_payment_info(booking_id: str):
    """Public endpoint: minimal payment info for the customer's pay-from-email page.

    Auth-less by design — booking ids are UUIDs (unguessable) and the same
    pattern is used for `/customer-approval/:token`. Only returns fields the
    customer needs to complete their Venmo payment.
    """
    booking_doc = await db.bookings.find_one({"id": booking_id})
    if not booking_doc:
        raise HTTPException(status_code=404, detail="Booking not found")

    quote_doc = await db.quotes.find_one({"id": booking_doc.get("quote_id")}) if booking_doc.get("quote_id") else None

    # Prefer the admin-approved price if set, otherwise fall back to the original quote
    base_amount = (
        (quote_doc.get("approved_price") if quote_doc else None)
        or (quote_doc.get("total_price") if quote_doc else None)
        or 0
    )
    priority_fee = float(booking_doc.get("priority_fee") or 0)
    equipment_fee = float(booking_doc.get("equipment_fee") or 0)
    tip_amount = float(booking_doc.get("tip_amount") or 0)
    amount_due = float(base_amount) + priority_fee + equipment_fee + tip_amount

    return {
        "booking_id": booking_doc.get("id"),
        "customer_name": booking_doc.get("name", "Valued Customer"),
        "address": booking_doc.get("address"),
        "pickup_date": booking_doc.get("pickup_date"),
        "pickup_time": booking_doc.get("pickup_time"),
        "amount_due": amount_due,
        "base_amount": float(base_amount) if base_amount else 0,
        "priority_tier": booking_doc.get("priority_tier"),
        "priority_fee": priority_fee,
        "equipment_required": bool(booking_doc.get("equipment_required")),
        "equipment_fee": equipment_fee,
        "tip_amount": tip_amount,
        "status": booking_doc.get("status"),
        "payment_status": booking_doc.get("payment_status", "pending"),
        "venmo_qr_url": os.environ.get(
            "VENMO_QR_URL",
            "https://www.paypal.com/qrcodes/venmocs/9f1f97dd-23ed-4676-82b5-3fc2126def65?created=1762118921",
        ),
    }


class TipUpdateRequest(BaseModel):
    tip_amount: float


@api_router.patch("/bookings/{booking_id}/tip")
async def update_booking_tip(booking_id: str, body: TipUpdateRequest):
    """Customer sets/updates a crew tip from the pay page (before paying).
    Refused after payment is captured. Capped at $500 sanity-check.
    """
    if body.tip_amount < 0 or body.tip_amount > 500:
        raise HTTPException(status_code=400, detail="Tip must be between $0 and $500")

    booking_doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking_doc:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking_doc.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Booking is already paid")
    if booking_doc.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Booking is cancelled")

    tip = round(float(body.tip_amount), 2)
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "tip_amount": tip,
            "tip_set_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    # Return the fresh amount-due so the client doesn't have to refetch separately
    refreshed = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    quote_doc = (
        await db.quotes.find_one({"id": refreshed.get("quote_id")}, {"_id": 0})
        if refreshed.get("quote_id") else None
    )
    return {
        "booking_id": booking_id,
        "tip_amount": tip,
        "amount_due": _compute_booking_amount_due(refreshed, quote_doc),
    }


# === Stripe Card Checkout =========================================
# Customer can pick "Pay with Card" instead of Venmo. Amount is computed
# server-side from the booking record so the client can't tamper.

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)


class StripeCheckoutCreateRequest(BaseModel):
    booking_id: str
    origin_url: str  # window.location.origin from the client


def _compute_booking_amount_due(booking_doc: dict, quote_doc: Optional[dict]) -> float:
    """Server-side source of truth for what the customer owes (incl. crew tip)."""
    base_amount = (
        (quote_doc.get("approved_price") if quote_doc else None)
        or (quote_doc.get("total_price") if quote_doc else None)
        or 0
    )
    return (
        float(base_amount)
        + float(booking_doc.get("priority_fee") or 0)
        + float(booking_doc.get("equipment_fee") or 0)
        + float(booking_doc.get("tip_amount") or 0)
    )


@api_router.post("/bookings/{booking_id}/stripe-checkout")
async def create_stripe_checkout(booking_id: str, body: StripeCheckoutCreateRequest, request: Request):
    """Create a Stripe Checkout session for a booking and return its URL.

    Security: amount is NEVER taken from the client. We look up the booking,
    sum base+priority+equipment server-side, then create the session. A
    `payment_transactions` row is inserted with status='pending' before the
    customer is redirected.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    booking_doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking_doc:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking_doc.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="This booking is already paid")

    quote_doc = (
        await db.quotes.find_one({"id": booking_doc.get("quote_id")}, {"_id": 0})
        if booking_doc.get("quote_id") else None
    )
    amount_due = _compute_booking_amount_due(booking_doc, quote_doc)
    if amount_due <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount due")

    origin = (body.origin_url or "").rstrip("/")
    if not origin.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid origin_url")
    success_url = f"{origin}/pay/{booking_id}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/pay/{booking_id}?stripe=cancelled"

    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)

    checkout_req = CheckoutSessionRequest(
        amount=float(f"{amount_due:.2f}"),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "booking_id": booking_id,
            "source": "text2toss_booking",
        },
    )
    session = await stripe_checkout.create_checkout_session(checkout_req)

    # Record the pending transaction BEFORE the customer leaves the page
    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "booking_id": booking_id,
        "amount": amount_due,
        "currency": "usd",
        "status": "pending",
        "payment_status": "pending",
        "metadata": {"booking_id": booking_id, "source": "text2toss_booking"},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/payments/checkout-status/{session_id}")
async def get_checkout_status(session_id: str, request: Request):
    """Poll the Stripe session status. Idempotent — only marks the booking
    paid once even on parallel calls."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Unknown session")

    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    status = await stripe_checkout.get_checkout_status(session_id)

    # Update transaction record
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {
            "status": status.status,
            "payment_status": status.payment_status,
            "amount_total": status.amount_total,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    # Idempotent booking update — only mark paid if not already paid
    if status.payment_status == "paid":
        booking_id = txn.get("booking_id") or (status.metadata or {}).get("booking_id")
        if booking_id:
            booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "payment_status": 1})
            if booking and booking.get("payment_status") != "paid":
                await db.bookings.update_one(
                    {"id": booking_id},
                    {"$set": {
                        "payment_status": "paid",
                        "payment_method": "stripe",
                        "status": "scheduled",  # locked in once paid
                        "paid_at": datetime.now(timezone.utc).isoformat(),
                    }}
                )

    return {
        "session_id": session_id,
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (mirror of polling for redundancy)."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)

    body_bytes = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        event = await stripe_checkout.handle_webhook(body_bytes, sig)
    except Exception as e:
        logger.warning(f"Stripe webhook verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    session_id = event.session_id
    if not session_id:
        return {"received": True}

    booking_id = (event.metadata or {}).get("booking_id")
    if event.payment_status == "paid" and booking_id:
        # Idempotent
        existing = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "payment_status": 1})
        if existing and existing.get("payment_status") != "paid":
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {
                    "payment_status": "paid",
                    "payment_method": "stripe",
                    "status": "scheduled",
                    "paid_at": datetime.now(timezone.utc).isoformat(),
                }}
            )
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": "complete",
                "payment_status": "paid",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )

    return {"received": True}


@api_router.get("/bookings", response_model=List[Booking])
async def get_bookings(token: str = None):
    user_id = await get_current_user(token) if token else "anonymous"
    
    bookings = await db.bookings.find({"user_id": user_id}).to_list(1000)
    return [Booking(**parse_from_mongo(booking)) for booking in bookings]

@api_router.post("/bookings/{booking_id}/payment-reminder")
async def send_payment_reminder(booking_id: str):
    """Send SMS payment reminder to customer for pending payment"""
    # Get booking
    booking_doc = await db.bookings.find_one({"id": booking_id})
    if not booking_doc:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    booking = Booking(**parse_from_mongo(booking_doc))
    
    # Get quote details for amount
    quote_doc = await db.quotes.find_one({"id": booking.quote_id})
    if not quote_doc:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    amount = quote_doc.get("total_price", 0)
    
    # Venmo QR code URL
    venmo_qr_url = "https://www.paypal.com/qrcodes/venmocs/9f1f97dd-23ed-4676-82b5-3fc2126def65?created=1762118921"
    
    # Send payment reminder email (primary method)
    if is_email_enabled() and booking.email:
        email_html = create_payment_reminder_email(
            booking.dict(), 
            amount, 
            booking_id,
            venmo_qr_url
        )
        
        try:
            email_result = await send_email(
                to_email=booking.email,
                subject=f"💳 Payment Reminder - Booking {booking_id[:8]}",
                html_content=email_html
            )
            logging.info(f"Payment reminder email sent for booking {booking_id} to {booking.email}: {email_result}")
            return {"success": True, "message": "Payment reminder sent via email"}
        except Exception as e:
            logging.error(f"Failed to send payment reminder email: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
    
    # Fallback to SMS if email disabled
    elif is_sms_enabled():
        phone = booking.phone
        if not phone.startswith('+'):
            phone = '+1' + phone.replace('(', '').replace(')', '').replace(' ', '').replace('-', '')
        
        pickup_date_str = booking.pickup_date.strftime('%B %d, %Y')
        payment_message = (
            f"💳 Text2toss Payment Reminder\n\n"
            f"Pickup: {pickup_date_str} at {booking.pickup_time}\n"
            f"Amount Due: ${amount}\n\n"
            f"Pay via Venmo:\n"
            f"• Send ${amount} to @Text2toss\n"
            f"• Include Booking ID: {booking_id[:8]}\n\n"
            f"Questions? Reply to this text or call us!"
        )
        
        try:
            sms_result = await send_sms(phone, payment_message)
            logging.info(f"Payment reminder SMS sent for booking {booking_id}: {sms_result}")
            return {"success": True, "message": "Payment reminder sent via SMS"}
        except Exception as e:
            logging.error(f"Failed to send payment reminder: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to send SMS: {str(e)}")
    else:
        return {"success": False, "message": "No notification method enabled"}

@api_router.get("/admin/daily-schedule")
async def get_daily_schedule(date: str = None):
    """Get all PAID bookings for a specific date (YYYY-MM-DD format) or today if no date specified. Only shows jobs that are scheduled/in_progress/completed (payment confirmed)."""
    if date is None:
        target_date = datetime.now(timezone.utc).date()
    else:
        target_date = datetime.fromisoformat(date).date()
    
    # Find bookings for the target date - match date part of pickup_date
    target_date_str = target_date.strftime("%Y-%m-%d")
    
    # IMPORTANT: Only show bookings that are NOT pending_payment (i.e., payment has been confirmed)
    bookings = await db.bookings.find({
        "pickup_date": {
            "$regex": f"^{target_date_str}"
        },
        "status": {"$in": ["scheduled", "in_progress", "completed"]}  # Exclude pending_payment
    }).sort("pickup_time", 1).to_list(1000)
    
    # OPTIMIZATION: Batch fetch all quotes to avoid N+1 query problem
    quote_ids = [booking['quote_id'] for booking in bookings if booking.get('quote_id')]
    quotes = []
    if quote_ids:
        quotes = await db.quotes.find({"id": {"$in": quote_ids}}).to_list(length=1000)
    
    # Create quote lookup dictionary for O(1) access
    quote_dict = {quote['id']: quote for quote in quotes}
    
    result = []
    for booking in bookings:
        # Remove MongoDB _id field to avoid serialization issues
        if "_id" in booking:
            del booking["_id"]
        booking_data = parse_from_mongo(booking)
        
        # Add quote details from pre-fetched dictionary (no database query)
        quote = quote_dict.get(booking_data["quote_id"])
        if quote:
            if "_id" in quote:
                del quote["_id"]
            booking_data["quote_details"] = parse_from_mongo(quote)
            
        # Validate Booking data structure (skip malformed records instead of
        # 500-ing the whole schedule — old bookings predating user_id may
        # still be in the DB).
        clean_booking_data = {k: v for k, v in booking_data.items() if k != "quote_details"}
        try:
            Booking(**clean_booking_data)  # Validate only
        except Exception as ve:
            logger.warning(
                f"Skipping malformed booking {booking_data.get('id')} on daily schedule: {ve}"
            )
            continue

        result.append(booking_data)  # Return raw data instead of Pydantic object
    
    return result

@api_router.get("/admin/pending-payments")
async def get_pending_payments():
    """Get all bookings with pending payments"""
    bookings = await db.bookings.find({
        "payment_status": "pending"
    }).sort("created_at", -1).to_list(1000)
    
    # OPTIMIZATION: Batch fetch all quotes to avoid N+1 query problem
    quote_ids = [booking['quote_id'] for booking in bookings if booking.get('quote_id')]
    quotes = []
    if quote_ids:
        quotes = await db.quotes.find({"id": {"$in": quote_ids}}).to_list(length=1000)
    
    # Create quote lookup dictionary for O(1) access
    quote_dict = {quote['id']: quote for quote in quotes}
    
    result = []
    for booking in bookings:
        if "_id" in booking:
            del booking["_id"]
        booking_data = parse_from_mongo(booking)
        
        # Add quote details from pre-fetched dictionary (no database query)
        quote = quote_dict.get(booking_data["quote_id"])
        if quote:
            if "_id" in quote:
                del quote["_id"]
            booking_data["quote_details"] = parse_from_mongo(quote)
        
        result.append(booking_data)
    
    return result

@api_router.post("/admin/bookings/{booking_id}/mark-paid")
async def mark_booking_paid(booking_id: str):
    """Mark a booking as paid and move it to scheduled status (adds to calendar)"""
    result = await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "payment_status": "paid",
            "status": "scheduled"  # Move from pending_payment to scheduled (visible in calendar)
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    return {"success": True, "message": "Booking marked as paid and added to calendar"}

@api_router.get("/admin/weekly-schedule")
async def get_weekly_schedule(start_date: str = None):
    """Get bookings for a week starting from start_date or current week"""
    if start_date is None:
        start = datetime.now(timezone.utc).date()
        # Get Monday of current week
        start = start - timedelta(days=start.weekday())
    else:
        start = datetime.fromisoformat(start_date).date()
    
    end = start + timedelta(days=7)
    
    # OPTIMIZATION: Use MongoDB date range query instead of fetching all and filtering in Python
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")
    
    # Get bookings within date range using regex (more efficient than fetching all)
    bookings = await db.bookings.find({
        "pickup_date": {
            "$gte": start_str,
            "$lt": end_str
        }
    }).to_list(1000)
    
    # OPTIMIZATION: Batch fetch all quotes to avoid N+1 query problem
    quote_ids = [booking['quote_id'] for booking in bookings if booking.get('quote_id')]
    quotes = []
    if quote_ids:
        quotes = await db.quotes.find({"id": {"$in": quote_ids}}).to_list(length=1000)
    
    # Create quote lookup dictionary for O(1) access
    quote_dict = {quote['id']: quote for quote in quotes}
    
    # Group by date
    schedule = {}
    for booking in bookings:
        # Remove MongoDB _id field
        if "_id" in booking:
            del booking["_id"]
        booking_data = parse_from_mongo(booking)
        
        # Extract date key from pickup_date
        pickup_date = booking_data.get("pickup_date")
        if pickup_date:
            if isinstance(pickup_date, str):
                date_key = pickup_date.split("T")[0]  # Get YYYY-MM-DD part
            else:
                date_key = pickup_date.strftime("%Y-%m-%d")
        else:
            continue
            
        if date_key not in schedule:
            schedule[date_key] = []
        
        # Add quote details from pre-fetched dictionary (no database query)
        quote = quote_dict.get(booking_data["quote_id"])
        if quote:
            if "_id" in quote:
                del quote["_id"]
            booking_data["quote_details"] = parse_from_mongo(quote)
            
        schedule[date_key].append(booking_data)
    
    return schedule

@api_router.get("/admin/calendar-data")
async def get_calendar_data(start_date: str, end_date: str):
    """Get calendar data for a month range showing all PAID scheduled jobs.

    Refactored helpers:
      - _calendar_pipeline       → mongo aggregation
      - _strip_mongo_ids         → drop _id from booking + nested quote
      - _group_bookings_by_date  → bucket by pickup_date_only
    """
    try:
        bookings = await db.bookings.aggregate(
            _calendar_pipeline(start_date, end_date)
        ).to_list(length=2000)
        return _group_bookings_by_date(bookings)
    except Exception as e:
        logger.error(f"Error fetching calendar data: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch calendar data")


def _calendar_pipeline(start_date: str, end_date: str) -> list:
    """Mongo aggregation: PAID bookings in [start_date, end_date] joined with their quotes."""
    return [
        {"$match": {"status": {"$in": ["scheduled", "in_progress", "completed"]}}},
        {
            "$addFields": {
                "pickup_date_only": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": {"$dateFromString": {"dateString": "$pickup_date"}},
                    }
                }
            }
        },
        {"$match": {"pickup_date_only": {"$gte": start_date, "$lte": end_date}}},
        {
            "$lookup": {
                "from": "quotes",
                "localField": "quote_id",
                "foreignField": "id",
                "as": "quote_details",
            }
        },
        {"$unwind": {"path": "$quote_details", "preserveNullAndEmptyArrays": True}},
        {"$sort": {"pickup_date": 1, "pickup_time": 1}},
    ]


def _strip_mongo_ids(booking: dict) -> None:
    """Drop _id from booking + nested quote_details so the response is JSON-safe."""
    booking.pop("_id", None)
    if "quote_details" in booking and isinstance(booking["quote_details"], dict):
        booking["quote_details"].pop("_id", None)


def _group_bookings_by_date(bookings: list) -> dict:
    calendar_data: dict = {}
    for booking in bookings:
        _strip_mongo_ids(booking)
        parsed = parse_from_mongo(booking)
        date_key = parsed["pickup_date_only"]
        calendar_data.setdefault(date_key, []).append(parsed)
    return calendar_data

@api_router.get("/availability/{date}")
async def check_availability(date: str):
    """Check available time slots for a specific date"""
    try:
        # Check if date is allowed (Monday-Thursday only)
        date_obj = datetime.fromisoformat(date).date()
        if date_obj.weekday() >= 4:  # Friday(4), Saturday(5), Sunday(6)
            return {
                "date": date,
                "available_slots": [],
                "booked_slots": [],
                "is_restricted": True,
                "restriction_reason": "Pickup not available on Fridays, Saturdays, or Sundays"
            }
        
        # Get existing PAID bookings for this date (only count scheduled/in_progress/completed)
        pipeline = [
            {
                "$match": {
                    "status": {"$in": ["scheduled", "in_progress", "completed"]}  # Only count paid bookings
                }
            },
            {
                "$addFields": {
                    "pickup_date_only": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": {"$dateFromString": {"dateString": "$pickup_date"}}
                        }
                    }
                }
            },
            {
                "$match": {
                    "pickup_date_only": date
                }
            }
        ]
        
        bookings_cursor = db.bookings.aggregate(pipeline)
        bookings = await bookings_cursor.to_list(length=2000)  # Reasonable limit for calendar month
        
        # All possible time slots
        all_slots = [
            "08:00-10:00",
            "10:00-12:00", 
            "12:00-14:00",
            "14:00-16:00",
            "16:00-18:00"
        ]
        
        # Get booked time slots
        booked_slots = [booking["pickup_time"] for booking in bookings]
        available_slots = [slot for slot in all_slots if slot not in booked_slots]
        
        return {
            "date": date,
            "available_slots": available_slots,
            "booked_slots": booked_slots,
            "is_restricted": False,
            "available_count": len(available_slots),
            "total_slots": len(all_slots)
        }
        
    except Exception as e:
        logging.error(f"Error checking availability for {date}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check availability")

@api_router.get("/availability-range")
async def check_availability_range(start_date: str, end_date: str):
    """Check availability for a date range — used for calendar view.

    Refactored from a 71-line/5-deep monolith into focused helpers:
      - _restricted_day_payload      → static "weekend/Friday closed" record
      - _availability_pipeline       → mongo aggregation per date
      - _slot_status_for             → 0/1-2/3+ → status string
    """
    try:
        start = datetime.fromisoformat(start_date).date()
        end = datetime.fromisoformat(end_date).date()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid date format")

    try:
        availability_data: dict = {}
        current_date = start
        while current_date <= end:
            date_str = current_date.isoformat()
            availability_data[date_str] = await _resolve_day_availability(current_date, date_str)
            current_date += timedelta(days=1)
        return availability_data
    except Exception as e:
        logging.error(f"Error checking availability range: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check availability range")


async def _resolve_day_availability(current_date, date_str: str) -> dict:
    """Build the per-day availability record. Early-returns on restricted days."""
    # Pickups are Mon-Thu only (weekday >= 4 means Fri/Sat/Sun)
    if current_date.weekday() >= 4:
        return _restricted_day_payload()

    bookings = await db.bookings.aggregate(_availability_pipeline(date_str)).to_list(length=2000)
    booked_count = len(bookings)
    available_count = 5 - booked_count  # 5 total time slots
    return {
        "available_count": available_count,
        "total_slots": 5,
        "is_restricted": False,
        "status": _slot_status_for(available_count),
    }


def _restricted_day_payload() -> dict:
    """Static record for weekend / Friday days when no pickups happen."""
    return {
        "available_count": 0,
        "total_slots": 5,
        "is_restricted": True,
        "status": "restricted",
    }


def _availability_pipeline(date_str: str) -> list:
    """Mongo aggregation that counts PAID bookings for `date_str`."""
    return [
        {"$match": {"status": {"$in": ["scheduled", "in_progress", "completed"]}}},
        {
            "$addFields": {
                "pickup_date_only": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": {"$dateFromString": {"dateString": "$pickup_date"}},
                    }
                }
            }
        },
        {"$match": {"pickup_date_only": date_str}},
    ]


def _slot_status_for(available_count: int) -> str:
    if available_count <= 0:
        return "fully_booked"
    if available_count <= 2:
        return "limited"
    return "available"

@api_router.patch("/admin/bookings/{booking_id}")
async def update_booking_status(booking_id: str, status_update: dict):
    """Update booking status and send SMS notification.

    Refactored helpers:
      - _build_status_update_data    → derive {status, payment_status, completed_at}
      - _normalize_us_phone          → strip formatting + add +1
      - _maybe_notify_status_change  → opt-in SMS dispatch
    """
    allowed_statuses = ["scheduled", "in_progress", "completed", "cancelled"]
    new_status = status_update.get("status")
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    update_data = _build_status_update_data(new_status)
    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})

    await _maybe_notify_status_change(booking, booking_id, new_status)
    await _maybe_email_invoice_on_complete(booking_id, new_status)
    return {"message": "Booking status updated and customer notified"}


async def _maybe_email_invoice_on_complete(booking_id: str, new_status: str) -> None:
    """Fire an auto-invoice email when a job is marked complete.

    Idempotent — sets `invoice_emailed_at` on the booking after send so
    repeated status flips don't re-send. Silent no-op if customer has no
    email on file. Admin BCC (ADMIN_BCC_EMAIL) still applies via send_email
    so text2toss@gmail.com automatically gets its own permanent copy.
    """
    if new_status != "completed":
        return
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        return
    if booking.get("invoice_emailed_at"):
        return  # already emailed once — don't spam on re-flip
    customer_email = (booking.get("email") or "").strip()
    if not customer_email:
        logging.info(f"[auto-invoice] skip {booking_id}: no customer email")
        return
    quote = None
    if booking.get("quote_id"):
        quote = await db.quotes.find_one({"id": booking["quote_id"]}, {"_id": 0})
    try:
        html, grand_total = _build_invoice_email_html(booking, quote)
        invoice_number = booking_id[:8].upper()
        subject = f"Your Text2toss invoice #{invoice_number} — ${grand_total:.2f}"
        pdf_attachment = _build_invoice_pdf_attachment(booking, quote)
        res = await send_email(
            to_email=customer_email,
            subject=subject,
            html_content=html,
            attachments=[pdf_attachment] if pdf_attachment else None,
        )
        if res.get("status") == "sent":
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"invoice_emailed_at": datetime.now(timezone.utc).isoformat()}},
            )
            logging.info(f"[auto-invoice] sent invoice for {booking_id} → {customer_email}")
        else:
            logging.warning(f"[auto-invoice] send returned non-sent status for {booking_id}: {res}")
    except Exception as exc:
        logging.warning(f"[auto-invoice] failed for {booking_id}: {exc}")


def _build_status_update_data(new_status: str) -> dict:
    """Return the $set payload for a status transition."""
    update_data: dict = {"status": new_status}
    if new_status == "cancelled":
        update_data["payment_status"] = "cancelled"
    elif new_status == "completed":
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    return update_data


def _normalize_us_phone(raw: str) -> str:
    """Strip pretty formatting and add +1 country code if missing."""
    phone = raw.replace("(", "").replace(")", "").replace(" ", "").replace("-", "")
    if phone and not phone.startswith("+"):
        phone = "+1" + phone
    return phone


async def _maybe_notify_status_change(booking: dict, booking_id: str, new_status: str) -> None:
    """Send a status-change SMS only if the customer is opted in."""
    sms_messages = {
        "in_progress": f"🚛 Text2toss Update: Your junk removal team has started working at {booking['address']}. We'll notify you when complete!",
        "completed": f"✅ Text2toss Complete: Your junk removal is finished at {booking['address']}. Thank you for choosing our service!",
        "cancelled": f"❌ Text2toss Notice: Your junk removal appointment for {booking['address']} has been cancelled. Contact us for rescheduling.",
    }
    if new_status not in sms_messages:
        return

    phone = _normalize_us_phone(booking.get("phone", ""))
    if not phone:
        return

    if booking.get("sms_notifications", False):
        sms_result = await send_sms(phone, sms_messages[new_status])
        logging.info(f"SMS sent for booking {booking_id}: {sms_result}")
    else:
        logging.info(f"SMS not sent for booking {booking_id}: Customer opted out of notifications")

@api_router.post("/admin/bookings/{booking_id}/completion")
async def upload_completion_photo(
    booking_id: str,
    file: UploadFile = File(...),
    completion_note: str = Form(default="")
):
    """Upload completion photo and note for a booking.

    Refactored helpers:
      - _validate_completion_upload    → booking + file checks
      - _save_completion_photo         → write to disk, return path
      - _persist_completion_metadata   → DB update
      - _notify_customer_completion    → SMS w/ photo (opt-in)
    """
    booking = await _validate_completion_upload(booking_id, file)
    photo_path = await _save_completion_photo(booking_id, file)

    try:
        await _persist_completion_metadata(booking_id, photo_path, completion_note)
        await _notify_customer_completion(booking, booking_id, completion_note)
        return {
            "message": "Completion photo uploaded and customer notified with photo",
            "photo_path": str(photo_path),
            "completion_note": completion_note
        }
    except Exception:
        # Clean up file on any post-save error so we don't leak partial state
        if photo_path.exists():
            photo_path.unlink()
        raise


async def _validate_completion_upload(booking_id: str, file: UploadFile) -> dict:
    """Confirm the booking is completed and the upload is an image."""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Can only add completion photos to completed bookings")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    return booking


async def _save_completion_photo(booking_id: str, file: UploadFile) -> str:
    """Persist the completion photo and return the path to store on the booking.

    Prefers managed object storage (key like
    ``text2toss/completion_photos/completion_<bid>_<ts>.jpg``) and falls back
    to the legacy on-disk location if storage is unavailable. The frontend's
    image-URL helper handles either format transparently.
    """
    file_extension = Path(file.filename).suffix or ".jpg"
    photo_filename = f"completion_{booking_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}{file_extension}"
    data = await file.read()

    try:
        storage_key = object_storage.storage_path("completion_photos", photo_filename)
        object_storage.put_bytes(
            storage_key,
            data,
            file.content_type or "image/jpeg",
        )
        return storage_key
    except Exception as exc:
        logger.error("[storage] completion photo upload failed for booking %s: %s", booking_id, exc)
        # Fail loudly — pod-local files disappear on redeploy and would
        # 404 the moment production restarts.
        raise HTTPException(status_code=502, detail="Photo upload failed — please retry") from exc


async def _persist_completion_metadata(booking_id: str, photo_path: str, completion_note: str):
    result = await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"completion_photo_path": photo_path, "completion_note": completion_note}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")


async def _notify_customer_completion(booking: dict, booking_id: str, completion_note: str):
    """SMS the customer the completion photo if they opted in."""
    raw_phone = (booking.get("phone") or "").replace("(", "").replace(")", "").replace(" ", "").replace("-", "")
    if not raw_phone:
        return
    phone = raw_phone if raw_phone.startswith("+") else "+1" + raw_phone

    backend_url = os.environ.get("BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
    photo_url = f"{backend_url}/api/public/completion-photo/{booking_id}"

    message = f"📸 Text2toss Complete: Your junk has been removed from {booking['address']}. "
    if completion_note:
        message += f"Note: {completion_note} "
    message += "See attached photo of the cleaned area!"

    if booking.get("sms_notifications", False):
        sms_result = await send_sms(phone, message, photo_url)
        logging.info(f"Completion SMS sent for booking {booking_id}: {sms_result}")
    else:
        logging.info(f"Completion SMS not sent for booking {booking_id}: customer opted out")

@api_router.get("/admin/booking-image/{booking_id}")
async def get_booking_image(booking_id: str):
    """Get image for a specific booking"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking or not booking.get("image_path"):
        raise HTTPException(status_code=404, detail="Booking image not found")
    
    image_path = Path(booking["image_path"])
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    
    return FileResponse(image_path)

@api_router.get("/admin/completion-photo/{booking_id}")
async def get_completion_photo(booking_id: str):
    """Get completion photo for a specific booking"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking or not booking.get("completion_photo_path"):
        raise HTTPException(status_code=404, detail="Completion photo not found")
    
    photo_path = Path(booking["completion_photo_path"])
    if not photo_path.exists():
        raise HTTPException(status_code=404, detail="Photo file not found")
    
    return FileResponse(photo_path)

# Public endpoint for SMS photo access (no authentication required)
@api_router.get("/public/completion-photo/{booking_id}")
async def get_public_completion_photo(booking_id: str):
    """Get completion photo for SMS - publicly accessible"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking or not booking.get("completion_photo_path"):
        raise HTTPException(status_code=404, detail="Completion photo not found")
    
    photo_path = Path(booking["completion_photo_path"])
    if not photo_path.exists():
        raise HTTPException(status_code=404, detail="Photo file not found")
    
    # Add proper headers for image serving
    return FileResponse(
        photo_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"}
    )

@api_router.post("/admin/cleanup-temp-images")
async def cleanup_temporary_images():
    """Clean up old quote images, keeping only the latest 30"""
    await cleanup_old_quote_images(30)
    
    # Also clean old temp_uploads older than 7 days
    import time
    temp_dir = Path("/app/static/temp_uploads")
    cleaned_count = 0
    if temp_dir.exists():
        cutoff_time = time.time() - (7 * 24 * 60 * 60)
        for file_path in temp_dir.glob("temp_*"):
            if file_path.is_file() and file_path.stat().st_mtime < cutoff_time:
                try:
                    file_path.unlink()
                    cleaned_count += 1
                except Exception as e:
                    logger.error(f"Failed to delete {file_path.name}: {str(e)}")
    
    return {"message": f"Cleanup complete. Removed {cleaned_count} old temp files. Latest 30 quote images retained."}

@api_router.post("/admin/bookings/{booking_id}/notify-customer")
async def notify_customer_completion(booking_id: str):
    """Send completion notification with photo to customer via SMS"""
    
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    phone = booking.get('phone', '').replace('(', '').replace(')', '').replace(' ', '').replace('-', '')
    if phone and not phone.startswith('+'):
        phone = '+1' + phone
    
    if not phone:
        raise HTTPException(status_code=400, detail="No phone number available")
    
    # Send SMS with or without photo
    if booking.get("completion_photo_path"):
        # Send with photo
        backend_url = os.environ.get('BACKEND_URL') or os.environ.get('REACT_APP_BACKEND_URL')
        photo_url = f"{backend_url}/api/public/completion-photo/{booking_id}"
        
        message = f"📸 Text2toss Complete: Your junk removal is finished at {booking['address']}. "
        if booking.get("completion_note"):
            message += f"Note: {booking['completion_note']} "
        message += "See the cleaned area in the photo!"
        
        sms_result = await send_sms(phone, message, photo_url)
    else:
        # Send without photo
        message = f"✅ Text2toss Complete: Your junk removal is finished at {booking['address']}. Thank you for your business!"
        sms_result = await send_sms(phone, message)
    
    return {
        "message": "Customer SMS notification sent successfully",
        "customer_phone": booking.get("phone"),
        "completion_note": booking.get("completion_note", ""),
        "photo_available": bool(booking.get("completion_photo_path")),
        "sms_status": sms_result
    }

@api_router.patch("/admin/bookings/{booking_id}/quote-price")
async def admin_adjust_quote_price(booking_id: str, body: dict):
    """Admin fast-edit for a booking BEFORE payment.

    Updates any of: price (via quote.approved_price), name, email, phone,
    address, pickup_date, pickup_time. `_compute_booking_amount_due` reads
    approved_price first so the customer sees the new number immediately.

    Body: { new_price?: float, name?, email?, phone?, address?,
            pickup_date?, pickup_time?, reason?: str }
    """
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Booking is already paid — cannot edit")
    if booking.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Booking is cancelled")

    reason = (body.get("reason") or "").strip()[:280]
    now_iso = datetime.now(timezone.utc).isoformat()

    # --- Optional customer-info updates on the booking doc ---
    booking_patch = {}
    for field in ("name", "email", "phone", "address", "pickup_date", "pickup_time"):
        value = body.get(field)
        if value is None:
            continue
        cleaned = str(value).strip()
        if cleaned:
            booking_patch[field] = cleaned[:200]

    # --- Optional price update on the linked quote ---
    price_change = None
    quote_id = booking.get("quote_id")
    if body.get("new_price") is not None:
        try:
            new_price = float(body["new_price"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="new_price must be a number")
        if new_price < 0 or new_price > 100000:
            raise HTTPException(status_code=400, detail="new_price out of range")
        if not quote_id:
            raise HTTPException(status_code=400, detail="Booking has no linked quote")
        quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found")
        old_price = float(quote.get("approved_price") or quote.get("total_price") or 0)
        await db.quotes.update_one(
            {"id": quote_id},
            {"$set": {
                "approved_price": new_price,
                "admin_notes": (reason or quote.get("admin_notes") or "")[:280],
                "price_adjusted_at": now_iso,
                "price_adjusted_by": "admin",
            }},
        )
        price_change = {"old": old_price, "new": new_price}

    if not booking_patch and price_change is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Apply booking-level updates + recompute amount_due
    if booking_patch:
        booking_patch["last_admin_edit_at"] = now_iso
        await db.bookings.update_one({"id": booking_id}, {"$set": booking_patch})

    fresh_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    fresh_quote = (
        await db.quotes.find_one({"id": quote_id}, {"_id": 0}) if quote_id else None
    )
    new_amount_due = _compute_booking_amount_due(fresh_booking, fresh_quote)
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"amount_due": new_amount_due}},
    )

    logger.info(
        f"Admin edited booking {booking_id}: fields={list(booking_patch.keys())}, "
        f"price={price_change}"
    )

    # ---- Optional customer notification (SMS + email) --------------------
    notify_result = {"sent_email": False, "sent_sms": False}
    if body.get("notify_customer") and (price_change or booking_patch):
        try:
            # Build human-friendly change list
            field_labels = {
                "name": "Name on the booking",
                "email": "Email address",
                "phone": "Phone number",
                "address": "Pickup address",
                "pickup_date": "Pickup date",
                "pickup_time": "Pickup time",
            }
            changes = [
                field_labels[k]
                for k in booking_patch.keys()
                if k in field_labels
            ]
            base_url = (
                os.environ.get("PUBLIC_SITE_URL")
                or os.environ.get("BACKEND_URL")
                or os.environ.get("REACT_APP_BACKEND_URL")
                or "https://text2toss.com"
            ).rstrip("/")
            pay_link = f"{base_url}/pay/{booking_id}"

            customer_email = fresh_booking.get("email")
            customer_phone = fresh_booking.get("phone")
            customer_name = fresh_booking.get("name") or "Friend"

            if customer_email:
                html = email_templates.booking_updated_email(
                    customer_name=customer_name,
                    booking_id=booking_id,
                    old_price=price_change["old"] if price_change else None,
                    new_price=price_change["new"] if price_change else None,
                    changes=changes,
                    reason=reason or None,
                    pay_link=pay_link,
                )
                subject = (
                    f"Your Text2toss booking has been updated"
                    + (f" — new total ${price_change['new']:.2f}" if price_change else "")
                )
                res = await send_email(
                    to_email=customer_email,
                    subject=subject,
                    html_content=html,
                )
                notify_result["sent_email"] = res.get("status") == "sent"

            if customer_phone:
                sms_lines = ["Text2toss update:"]
                if price_change:
                    sms_lines.append(
                        f"Your total is now ${price_change['new']:.2f} "
                        f"(was ${price_change['old']:.2f})."
                    )
                if changes:
                    sms_lines.append("Updated: " + ", ".join(changes) + ".")
                if reason:
                    sms_lines.append(reason[:120])
                sms_lines.append(f"Review + pay: {pay_link}")
                sms_body = "\n".join(sms_lines)[:1500]
                sms_res = await send_sms(to_phone=customer_phone, message=sms_body)
                notify_result["sent_sms"] = sms_res.get("status") == "sent"
        except Exception as exc:
            logger.warning(f"Notify customer failed for {booking_id}: {exc}")

    return {
        "success": True,
        "booking_id": booking_id,
        "quote_id": quote_id,
        "amount_due": new_amount_due,
        "price_change": price_change,
        "fields_updated": list(booking_patch.keys()),
        "notify_result": notify_result,
    }



def _categorize_item(name: str) -> str:
    """Bucket a line item into a human-friendly category for grouped invoices."""
    n = (name or "").lower()
    # Order matters — check more specific first
    if any(k in n for k in ("mattress", "boxspring", "box spring", "bed frame", "headboard")):
        return "Mattresses & Bedding"
    if any(k in n for k in ("bag", "trash", "garbage", "sack")):
        return "Bulk Bags & Loose Debris"
    if any(k in n for k in ("couch", "sofa", "sectional", "loveseat", "recliner", "chair", "table", "desk", "dresser", "cabinet", "shelf", "bookcase", "armoire", "wardrobe", "ottoman", "bench", "stool", "furniture")):
        return "Furniture"
    if any(k in n for k in ("fridge", "refrigerator", "freezer", "washer", "dryer", "dishwasher", "stove", "oven", "microwave", "appliance", "ac unit", "air conditioner", "water heater")):
        return "Appliances"
    if any(k in n for k in ("tv", "television", "monitor", "computer", "printer", "electronic")):
        return "Electronics"
    if any(k in n for k in ("yard", "branch", "leaves", "debris", "dirt", "rocks", "gravel", "sod", "wood", "lumber", "pallet", "fence", "brush")):
        return "Yard & Construction Debris"
    if any(k in n for k in ("box", "carton", "container", "bin", "tote")):
        return "Boxes & Containers"
    return "Miscellaneous"


def _venmo_qr_data_uri(venmo_url: str) -> str:
    """Return a base64-encoded PNG data URI of a Venmo-blue QR code for the
    given deep-link URL. Cached per-URL for the process lifetime so repeated
    invoice renders don't re-encode."""
    global _VENMO_QR_CACHE
    try:
        _VENMO_QR_CACHE  # type: ignore[used-before-def]
    except NameError:
        _VENMO_QR_CACHE = {}
    if venmo_url in _VENMO_QR_CACHE:
        return _VENMO_QR_CACHE[venmo_url]
    try:
        import qrcode, io
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=6, border=2,
        )
        qr.add_data(venmo_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#0891b2", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data_uri = f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"
        _VENMO_QR_CACHE[venmo_url] = data_uri
        return data_uri
    except Exception as exc:
        logging.warning(f"[venmo-qr] generation failed: {exc}")
        return ""


def _t2t_logo_data_uri() -> str:
    """Base64-encoded transparent-TEXT logo, cached at module import for
    inline embedding in invoice emails so mail clients that block remote
    images (Gmail default, Outlook, etc.) still render the branding."""
    global _T2T_LOGO_DATA_URI
    try:
        return _T2T_LOGO_DATA_URI
    except NameError:
        pass
    logo_path = "/app/frontend/public/t2t_logo_light.png"
    try:
        with open(logo_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        _T2T_LOGO_DATA_URI = f"data:image/png;base64,{b64}"  # noqa: F841
        return _T2T_LOGO_DATA_URI
    except Exception as exc:
        logging.warning(f"[invoice] could not load logo for inline embed: {exc}")
        return ""


def _build_invoice_pdf_attachment(booking: dict, quote: Optional[dict]):
    """Render the invoice HTML to a PDF and return a `MIMEApplication` ready
    to attach to an outgoing email. Returns `None` if the PDF cannot be
    rendered (never blocks the email itself)."""
    try:
        from weasyprint import HTML as _WHtml
        from email.mime.application import MIMEApplication
        html, _ = _build_invoice_html(booking, quote, for_email=True)
        pdf_bytes = _WHtml(string=html).write_pdf()
        invoice_number = str(booking.get("id", ""))[:8].upper()
        filename = f"text2toss-invoice-{invoice_number}.pdf"
        att = MIMEApplication(pdf_bytes, _subtype="pdf")
        att.add_header("Content-Disposition", "attachment", filename=filename)
        return att
    except Exception as exc:  # noqa: BLE001
        logging.warning(f"[invoice-pdf-attach] render failed: {exc}")
        return None


def _build_invoice_html(
    booking: dict,
    quote: Optional[dict],
    *,
    for_email: bool = False,
) -> tuple[str, float]:
    """Shared invoice HTML builder used by both the view endpoint and the
    email endpoint. Returns (html, grand_total).

    Line items are grouped by category (Mattresses, Furniture, Bulk bags,
    etc.) with subtotals per group — much easier for customers to read than
    a raw AI-parsed item dump.

    When `for_email=True`, the logo is inlined as a base64 data-URI and the
    interactive Print / Email / status controls are stripped so the HTML
    renders cleanly inside mail clients that block remote images or scripts.
    """
    from html import escape as _html_escape

    # For email: inline base64 logo so it always renders (Gmail/Outlook block
    # remote images by default). For browser view: use the hosted URL.
    if for_email:
        logo_url = _t2t_logo_data_uri()
    else:
        _public_base = (os.environ.get("PUBLIC_BASE_URL")
                        or os.environ.get("FRONTEND_URL")
                        or "https://booking-tracker-pro-1.preview.emergentagent.com").rstrip("/")
        logo_url = f"{_public_base}/t2t_logo_light.png"

    booking_id = booking.get("id", "")
    items = (quote or {}).get("items") or []
    # Base price fallback chain — covers new bookings (approved_price on quote,
    # then quote.total_price) AND older bookings that stored the final price
    # directly on the booking as adjusted_price / original_price / total_price.
    base_price = float(
        (quote or {}).get("approved_price")
        or (quote or {}).get("total_price")
        or booking.get("approved_price")
        or booking.get("total_price")
        or booking.get("adjusted_price")
        or booking.get("original_price")
        or 0
    )
    priority_fee = float(booking.get("priority_fee") or 0)
    equipment_fee = float(booking.get("equipment_fee") or 0)
    tip_amount = float(booking.get("tip_amount") or 0)
    grand_total = base_price + priority_fee + equipment_fee + tip_amount

    # Bucket items by category
    groups: "dict[str, dict]" = {}
    total_cuft = 0
    for i in items:
        raw_name = str(i.get("name", "Item"))
        size = str(i.get("size", "medium")).lower()
        qty = int(i.get("quantity", 1) or 1)
        item_cuft = VOLUME_BY_SIZE.get(size, 25) * qty
        total_cuft += item_cuft
        category = _categorize_item(raw_name)
        bucket = groups.setdefault(category, {"items": [], "cuft": 0})
        bucket["items"].append({
            "name": _html_escape(raw_name),
            "quantity": qty,
            "size": _html_escape(size.title()),
            "description": _html_escape(str(i.get("description", ""))),
            "cuft": item_cuft,
        })
        bucket["cuft"] += item_cuft

    if total_cuft <= 0:
        total_cuft = 1  # avoid div/0

    # Allocate cost proportional to each group's cuft share
    for cat, bucket in groups.items():
        bucket["cost"] = round(base_price * (bucket["cuft"] / total_cuft), 2)

    # Category priority for display order — mattresses first (most common
    # request), then bulk bags, furniture, everything else alphabetical.
    CATEGORY_ORDER = [
        "Mattresses & Bedding",
        "Bulk Bags & Loose Debris",
        "Furniture",
        "Appliances",
        "Electronics",
        "Yard & Construction Debris",
        "Boxes & Containers",
        "Miscellaneous",
    ]
    sorted_groups = sorted(
        groups.items(),
        key=lambda kv: (CATEGORY_ORDER.index(kv[0]) if kv[0] in CATEGORY_ORDER else 999, kv[0]),
    )

    invoice_number = booking_id[:8].upper()
    pickup_date_raw = booking.get("pickup_date") or ""
    pickup_date = str(pickup_date_raw)[:10] if pickup_date_raw else "—"
    issued_at = datetime.now(timezone.utc).strftime("%B %d, %Y")

    # Customer fields: new bookings store these inside `customer_details`,
    # older ones use flat top-level keys. Fall back through both shapes.
    cust = booking.get("customer_details") or {}
    safe_name = _html_escape(str(cust.get("name") or booking.get("name") or "Customer"))
    safe_address = _html_escape(str(cust.get("address") or booking.get("address") or ""))
    safe_email = _html_escape(str(cust.get("email") or booking.get("email") or ""))
    safe_phone = _html_escape(str(cust.get("phone") or booking.get("phone") or ""))

    paid_badge = '<span class="paid-badge">PAID</span>' if booking.get("payment_status") == "paid" else ""
    # Big diagonal watermark stamped on paid invoices (auto-hidden when unpaid)
    paid_watermark = (
        '<div class="paid-watermark" aria-hidden="true">PAID</div>'
        if booking.get("payment_status") == "paid" else ""
    )

    # "Pay with Venmo" CTA — only rendered for unpaid invoices. Tapping opens
    # the Venmo app on mobile (via https link redirect) or the web checkout
    # on desktop, both pre-filled with the amount and invoice number.
    import urllib.parse as _urlparse
    _venmo_handle = os.environ.get("VENMO_USERNAME", "Text2toss")
    _venmo_note = _urlparse.quote(f"Text2toss Invoice #{invoice_number}")
    _venmo_amount = f"{grand_total:.2f}"
    venmo_web_url = f"https://venmo.com/{_venmo_handle}?txn=pay&amount={_venmo_amount}&note={_venmo_note}"
    venmo_block = ""
    if booking.get("payment_status") != "paid":
        _venmo_qr = _venmo_qr_data_uri(venmo_web_url)
        _qr_img = f'<img src="{_venmo_qr}" alt="Scan to pay with Venmo" class="pay-qr" width="120" height="120">' if _venmo_qr else ""
        venmo_block = f"""
    <div class="pay-cta">
      <div class="pay-cta-inner">
        <div class="pay-cta-main">
          <a class="pay-btn" href="{venmo_web_url}" target="_blank" rel="noopener">
            <span class="pay-btn-lead">Pay with</span>
            <span class="pay-btn-brand">Venmo</span>
            <span class="pay-btn-amount">${_venmo_amount}</span>
          </a>
          <div class="pay-hint">Tap on your phone → Venmo opens with the amount pre-filled. Send to <strong>@{_venmo_handle}</strong>.</div>
        </div>
        <div class="pay-qr-wrap">
          {_qr_img}
          <div class="pay-qr-label">Scan to pay</div>
        </div>
      </div>
    </div>"""

    # Interactive controls (Print / Email / PDF buttons + JS) are only rendered
    # for the browser view — stripped for email so mail clients see just the
    # branded invoice content.
    actions_block = "" if for_email else f"""
    <div class="actions no-print">
      <button class="btn" onclick="window.print()">🖨️ Print</button>
      <a class="btn" href="/api/admin/bookings/{booking_id}/invoice.pdf" target="_blank" rel="noopener">📥 Download PDF</a>
      <button class="btn email-btn" id="email-btn" onclick="emailInvoice()">📧 Email to customer</button>
    </div>
    <div id="email-status" class="no-print"></div>

    <script>
      async function emailInvoice() {{
        const btn = document.getElementById('email-btn');
        const status = document.getElementById('email-status');
        btn.disabled = true;
        btn.textContent = 'Sending…';
        status.textContent = '';
        status.className = '';
        try {{
          const res = await fetch(
            '/api/admin/bookings/{booking_id}/invoice/email',
            {{ method: 'POST', credentials: 'include' }}
          );
          const data = await res.json();
          if (res.ok && data.success) {{
            status.textContent = '✅ Invoice emailed to ' + (data.to_email || 'customer');
            status.className = 'ok';
            btn.textContent = '✉️ Sent';
          }} else {{
            status.textContent = '❌ ' + (data.detail || 'Send failed');
            status.className = 'err';
            btn.disabled = false;
            btn.textContent = '📧 Email to customer';
          }}
        }} catch (err) {{
          status.textContent = '❌ Network error — try again';
          status.className = 'err';
          btn.disabled = false;
          btn.textContent = '📧 Email to customer';
        }}
      }}
    </script>
"""

    # Group rows: header row + itemized detail rows + subtotal row
    group_rows = ""
    if sorted_groups:
        for cat, bucket in sorted_groups:
            group_rows += f'''
            <tr class="group-header">
              <td colspan="4"><strong>{_html_escape(cat)}</strong></td>
              <td class="right"><strong>{bucket["cuft"]} cu ft</strong></td>
              <td class="right money"><strong>${bucket["cost"]:.2f}</strong></td>
            </tr>'''
            for row in bucket["items"]:
                group_rows += f'''
            <tr class="group-item">
              <td></td>
              <td class="item-name">
                <div class="name">{row["name"]}</div>
                <div class="desc">{row["description"] or ""}</div>
              </td>
              <td class="right">{row["quantity"]}</td>
              <td class="right">{row["size"]}</td>
              <td class="right">{row["cuft"]} cu ft</td>
              <td class="right money">—</td>
            </tr>'''
    else:
        group_rows = '<tr><td colspan="6" class="right" style="padding:24px;color:#737373">No line items on this quote.</td></tr>'

    extras_rows = ""
    if priority_fee > 0:
        extras_rows += f'<tr><td colspan="5" class="right">Priority scheduling fee</td><td class="right money">${priority_fee:.2f}</td></tr>'
    if equipment_fee > 0:
        extras_rows += f'<tr><td colspan="5" class="right">Heavy-pile equipment fee</td><td class="right money">${equipment_fee:.2f}</td></tr>'
    if tip_amount > 0:
        extras_rows += f'<tr><td colspan="5" class="right">Crew tip</td><td class="right money">${tip_amount:.2f}</td></tr>'

    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Text2toss Invoice #{invoice_number}</title>
  <style>
    @page {{ size: Letter; margin: 0.35in; }}
    @media print {{
      .no-print {{ display:none !important; }}
      body {{ margin:0; padding:0; background:#ffffff; }}
      .invoice {{ box-shadow:none; border:0; border-radius:0; max-width:none; }}
      .body {{ padding:0 8px !important; }}
      .header {{ padding:8px 12px !important; }}
      .footer {{ padding:10px 12px !important; }}
    }}
    body {{ font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; margin:0; padding:20px 20px; background:#f1f5f9; color:#0a0a0a; }}
    .invoice {{ max-width:820px; margin:0 auto; background:#ffffff; border-radius:14px; box-shadow:0 20px 60px rgba(6,182,212,0.18); overflow:hidden; border:1px solid #e2e8f0; }}
    .header {{ background:#ffffff; padding:20px 28px; display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #22d3ee; gap:20px; flex-wrap:wrap; }}
    .header .logo-wrap {{ flex:1; min-width:200px; }}
    .header .logo {{ display:block; width:100%; max-width:260px; height:auto; }}
    .biz-info {{ text-align:right; font-size:11px; color:#475569; line-height:1.5; }}
    .biz-info strong {{ color:#0891b2; font-size:12px; letter-spacing:1px; text-transform:uppercase; }}
    .body {{ padding:20px 28px; }}
    h2 {{ font-size:11px; text-transform:uppercase; letter-spacing:3px; color:#0891b2; margin:0 0 6px; font-weight:800; }}
    .meta {{ display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:18px; }}
    .meta-block {{ font-size:13px; color:#0a0a0a; line-height:1.45; }}
    .meta-block .label {{ text-transform:uppercase; font-size:10px; letter-spacing:2px; color:#0891b2; margin-bottom:4px; font-weight:800; }}
    .paid-badge {{ display:inline-block; background:linear-gradient(135deg,#22d3ee,#06b6d4); color:#0a0a0a; padding:4px 12px; border-radius:999px; font-size:10px; font-weight:900; letter-spacing:2px; box-shadow:0 4px 12px rgba(34,211,238,0.35); -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
    table {{ width:100%; border-collapse:collapse; margin-top:4px; }}
    th {{ font-size:9px; text-transform:uppercase; letter-spacing:1.5px; color:#64748b; text-align:left; padding:8px 6px; border-bottom:2px solid #0891b2; }}
    th.right, td.right {{ text-align:right; }}
    td {{ padding:7px 6px; border-bottom:1px solid #e2e8f0; font-size:13px; vertical-align:top; }}
    tr.group-header td {{ background:#ecfeff; color:#0e7490; border-top:2px solid #22d3ee; font-size:12px; font-weight:800; letter-spacing:1px; text-transform:uppercase; padding:8px 6px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
    tr.group-item td {{ background:#ffffff; font-size:12px; color:#334155; padding-top:6px; padding-bottom:6px; }}
    tr.group-item td:first-child {{ width:16px; border-right:3px solid #22d3ee; padding:0; }}
    .item-name .name {{ font-weight:600; color:#0a0a0a; }}
    .item-name .desc {{ font-size:11px; color:#64748b; margin-top:1px; }}
    .money {{ font-weight:700; font-variant-numeric:tabular-nums; }}
    .totals {{ margin-top:6px; page-break-inside:avoid; break-inside:avoid; }}
    .totals td {{ border-bottom:0; padding:4px 6px; font-size:13px; color:#475569; }}
    .totals .subtotal {{ padding-top:10px; border-top:2px solid #0891b2; }}
    .totals .grand td {{ font-size:20px; font-weight:900; color:#0a0a0a; padding:14px 6px 4px; }}
    .totals .grand td.right {{ color:#0891b2; }}
    .footer {{ margin-top:0; text-align:center; font-size:11px; color:#64748b; padding:14px 28px; border-top:1px solid #e2e8f0; background:#ffffff; page-break-inside:avoid; break-inside:avoid; }}
    .footer strong {{ color:#0891b2; letter-spacing:2px; text-transform:uppercase; }}
    .actions {{ text-align:center; margin:16px 28px 20px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }}
    .btn {{ display:inline-block; background:#ffffff; color:#0891b2; padding:10px 22px; border-radius:999px; text-decoration:none; font-weight:800; text-transform:uppercase; letter-spacing:2px; font-size:11px; border:2px solid #22d3ee; cursor:pointer; transition:all 0.2s ease; }}
    .btn:hover {{ background:#22d3ee; color:#ffffff; transform:translateY(-1px); }}
    .btn.email-btn {{ background:linear-gradient(135deg,#22d3ee,#06b6d4); color:#ffffff; border-color:transparent; }}
    .btn.email-btn:hover {{ background:linear-gradient(135deg,#06b6d4,#0891b2); color:#ffffff; }}
    .btn:disabled {{ opacity:0.5; cursor:not-allowed; transform:none; }}
    .cuft-note {{ font-size:10px; color:#64748b; margin-top:8px; padding:6px 10px; background:#f0fdff; border-left:3px solid #22d3ee; border-radius:4px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
    /* "Pay with Venmo" CTA — only rendered for unpaid invoices */
    .pay-cta {{ margin-top:14px; text-align:center; page-break-inside:avoid; break-inside:avoid; }}
    .pay-cta-inner {{ display:inline-flex; align-items:center; gap:24px; flex-wrap:wrap; justify-content:center; }}
    .pay-cta-main {{ display:flex; flex-direction:column; align-items:center; gap:6px; }}
    .pay-qr-wrap {{ display:flex; flex-direction:column; align-items:center; gap:4px; }}
    .pay-qr {{ display:block; width:120px; height:120px; border-radius:10px; border:3px solid #22d3ee; padding:4px; background:#ffffff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
    .pay-qr-label {{ font-size:10px; text-transform:uppercase; letter-spacing:2px; color:#0891b2; font-weight:800; }}
    @media (max-width:480px) {{ .pay-qr-wrap {{ display:none; }} }}
    .pay-btn {{ display:inline-flex; align-items:center; gap:10px; background:linear-gradient(135deg,#3d95ce,#008cff); color:#ffffff !important; text-decoration:none; padding:14px 26px; border-radius:999px; font-weight:900; box-shadow:0 8px 24px -6px rgba(0,140,255,0.5); -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
    .pay-btn:hover {{ transform:translateY(-1px); box-shadow:0 12px 28px -6px rgba(0,140,255,0.6); }}
    .pay-btn-lead {{ font-size:11px; text-transform:uppercase; letter-spacing:2px; opacity:0.9; }}
    .pay-btn-brand {{ font-size:20px; font-style:italic; font-weight:900; letter-spacing:0.5px; }}
    .pay-btn-amount {{ background:rgba(255,255,255,0.22); padding:3px 10px; border-radius:999px; font-size:14px; font-variant-numeric:tabular-nums; }}
    .pay-hint {{ font-size:10px; color:#64748b; margin-top:6px; }}
    .pay-hint strong {{ color:#0891b2; }}
    #email-status {{ margin:10px 28px 0; text-align:center; font-size:12px; font-weight:700; }}
    #email-status.ok {{ color:#059669; }}
    #email-status.err {{ color:#dc2626; }}
    /* Diagonal PAID watermark — only rendered when payment_status == 'paid' */
    .invoice {{ position:relative; }}
    .paid-watermark {{ position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) rotate(-22deg); font-family:'Anton','Bebas Neue',Impact,sans-serif; font-size:170px; font-weight:900; letter-spacing:14px; color:#22d3ee; opacity:0.11; pointer-events:none; user-select:none; z-index:5; text-transform:uppercase; white-space:nowrap; -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
    @media (max-width:640px) {{ .paid-watermark {{ font-size:100px; letter-spacing:8px; }} }}
  </style>
</head>
<body>
  <div class="invoice">
    {paid_watermark}
    <div class="header">
      <div class="logo-wrap">
        <img src="{logo_url}" alt="Text2toss Junk Removal · Snap it. Send it. Gone. · 928-853-9619" class="logo">
      </div>
      <div class="biz-info">
        <strong>Text2toss Junk Removal</strong><br>
        Flagstaff, AZ<br>
        text2toss@gmail.com<br>
        (928) 853-9619
      </div>
    </div>

    <div class="body">
    <div class="meta">
      <div class="meta-block">
        <div class="label">Bill to</div>
        <strong>{safe_name}</strong><br>
        {safe_address}<br>
        {safe_email}<br>
        {safe_phone}
      </div>
      <div class="meta-block" style="text-align:right;">
        <div class="label">Invoice</div>
        <strong>#{invoice_number}</strong><br>
        <span style="font-size:12px;">Issued {issued_at}</span><br>
        <span style="font-size:12px;">Service date {pickup_date}</span><br>
        <div style="margin-top:8px;">{paid_badge}</div>
      </div>
    </div>

    <h2>Line items (grouped)</h2>
    <table>
      <thead>
        <tr>
          <th style="width:20px;"></th>
          <th>Item / category</th>
          <th class="right">Qty</th>
          <th class="right">Size</th>
          <th class="right">Volume</th>
          <th class="right">Cost</th>
        </tr>
      </thead>
      <tbody>
        {group_rows}
      </tbody>
    </table>
    <div class="cuft-note">Total volume hauled: <strong>{total_cuft} cu ft</strong>. Cost is shown per category, allocated proportional to cubic-feet volume.</div>

    <table class="totals">
      <tr>
        <td colspan="5" class="right subtotal">Service subtotal</td>
        <td class="right money subtotal">${base_price:.2f}</td>
      </tr>
      {extras_rows}
      <tr class="grand">
        <td colspan="5" class="right">Grand total</td>
        <td class="right">${grand_total:.2f}</td>
      </tr>
    </table>
{venmo_block}
    </div>

    <div class="footer">
      <strong>Thank you for choosing Text2toss</strong><br>
      Questions? Reply to text2toss@gmail.com or call (928) 853-9619.
    </div>
{actions_block}
  </div>
</body>
</html>"""
    return html, grand_total


def _build_invoice_email_html(booking: dict, quote: Optional[dict]) -> tuple[str, float]:
    """Return an email-client-friendly invoice HTML (inline styles + table
    layout only). Gmail mobile, Apple Mail, Outlook, etc. strip most `<style>`
    blocks and modern CSS — the branded `_build_invoice_html` version renders
    as unstyled plain text in those clients. This version uses only the CSS
    subset every mail client supports (backgrounds via `bgcolor=""`, spacing
    via cellpadding/style, inline `style="…"` on every element).
    """
    from html import escape as _e

    booking_id = booking.get("id", "")
    invoice_number = booking_id[:8].upper()

    cust = booking.get("customer_details") or {}
    safe_name = _e(str(cust.get("name") or booking.get("name") or "Customer"))
    safe_address = _e(str(cust.get("address") or booking.get("address") or ""))
    safe_email = _e(str(cust.get("email") or booking.get("email") or ""))
    safe_phone = _e(str(cust.get("phone") or booking.get("phone") or ""))

    base_price = float(
        (quote or {}).get("approved_price")
        or (quote or {}).get("total_price")
        or booking.get("approved_price")
        or booking.get("total_price")
        or booking.get("adjusted_price")
        or booking.get("original_price")
        or 0
    )
    priority_fee = float(booking.get("priority_fee") or 0)
    equipment_fee = float(booking.get("equipment_fee") or 0)
    tip_amount = float(booking.get("tip_amount") or 0)
    grand_total = base_price + priority_fee + equipment_fee + tip_amount

    items = (quote or {}).get("items") or []
    # Bucket items by category (same logic as branded view)
    groups: dict = {}
    total_cuft = 0
    for it in items:
        raw_name = str(it.get("name", "Item"))
        size = str(it.get("size", "medium")).lower()
        qty = int(it.get("quantity", 1) or 1)
        cuft = VOLUME_BY_SIZE.get(size, 25) * qty
        total_cuft += cuft
        category = _categorize_item(raw_name)
        bucket = groups.setdefault(category, {"items": [], "cuft": 0})
        bucket["items"].append({
            "name": _e(raw_name), "quantity": qty, "size": _e(size.title()),
            "description": _e(str(it.get("description", ""))), "cuft": cuft,
        })
        bucket["cuft"] += cuft
    if total_cuft <= 0:
        total_cuft = 1
    for _, bucket in groups.items():
        bucket["cost"] = round(base_price * (bucket["cuft"] / total_cuft), 2)

    CATEGORY_ORDER = [
        "Mattresses & Bedding", "Bulk Bags & Loose Debris", "Furniture",
        "Appliances", "Electronics", "Yard & Construction Debris",
        "Boxes & Containers", "Miscellaneous",
    ]
    sorted_groups = sorted(
        groups.items(),
        key=lambda kv: (CATEGORY_ORDER.index(kv[0]) if kv[0] in CATEGORY_ORDER else 999, kv[0]),
    )

    # Row builders — all inline styles
    line_rows = []
    for cat, bucket in sorted_groups:
        line_rows.append(
            f'<tr><td colspan="4" bgcolor="#ecfeff" style="background:#ecfeff;color:#0e7490;'
            f'font-weight:800;font-size:13px;letter-spacing:1px;text-transform:uppercase;'
            f'padding:10px 12px;border-top:2px solid #22d3ee;">{_e(cat)}</td>'
            f'<td bgcolor="#ecfeff" align="right" style="background:#ecfeff;color:#0e7490;'
            f'font-weight:800;padding:10px 12px;border-top:2px solid #22d3ee;">'
            f'${bucket["cost"]:.2f}</td></tr>'
        )
        for it in bucket["items"]:
            desc = (f'<div style="font-size:11px;color:#64748b;margin-top:2px;">'
                    f'{it["description"]}</div>') if it["description"] else ""
            line_rows.append(
                f'<tr>'
                f'<td width="6" bgcolor="#22d3ee" style="background:#22d3ee;">&nbsp;</td>'
                f'<td style="padding:8px 12px;color:#0a0a0a;font-size:13px;border-bottom:1px solid #e2e8f0;">'
                f'<strong>{it["name"]}</strong>{desc}</td>'
                f'<td align="center" style="padding:8px 12px;color:#334155;font-size:13px;border-bottom:1px solid #e2e8f0;">{it["quantity"]}</td>'
                f'<td align="center" style="padding:8px 12px;color:#334155;font-size:13px;border-bottom:1px solid #e2e8f0;">{it["size"]}</td>'
                f'<td align="right" style="padding:8px 12px;color:#334155;font-size:13px;border-bottom:1px solid #e2e8f0;">{it["cuft"]} cu ft</td>'
                f'</tr>'
            )
    line_rows_html = "\n".join(line_rows) or (
        '<tr><td colspan="5" align="center" style="padding:16px;color:#94a3b8;font-style:italic;">'
        'No line items on this invoice.</td></tr>'
    )

    extra_rows = ""
    if priority_fee > 0:
        extra_rows += (
            '<tr><td colspan="4" align="right" style="padding:4px 12px;color:#475569;font-size:13px;">Priority scheduling</td>'
            f'<td align="right" style="padding:4px 12px;color:#475569;font-size:13px;">${priority_fee:.2f}</td></tr>'
        )
    if equipment_fee > 0:
        extra_rows += (
            '<tr><td colspan="4" align="right" style="padding:4px 12px;color:#475569;font-size:13px;">Equipment fee</td>'
            f'<td align="right" style="padding:4px 12px;color:#475569;font-size:13px;">${equipment_fee:.2f}</td></tr>'
        )
    if tip_amount > 0:
        extra_rows += (
            '<tr><td colspan="4" align="right" style="padding:4px 12px;color:#475569;font-size:13px;">Crew tip</td>'
            f'<td align="right" style="padding:4px 12px;color:#475569;font-size:13px;">${tip_amount:.2f}</td></tr>'
        )

    is_paid = booking.get("payment_status") == "paid"
    paid_badge = (
        '<div style="display:inline-block;background:#22d3ee;color:#0a0a0a;'
        'padding:6px 16px;border-radius:999px;font-size:12px;font-weight:900;'
        'letter-spacing:2px;">PAID</div>'
    ) if is_paid else ""

    # Venmo pay button — only for unpaid invoices
    import urllib.parse as _urlparse
    venmo_handle = os.environ.get("VENMO_USERNAME", "Text2toss")
    venmo_note = _urlparse.quote(f"Text2toss Invoice #{invoice_number}")
    venmo_url = f"https://venmo.com/{venmo_handle}?txn=pay&amount={grand_total:.2f}&note={venmo_note}"
    venmo_qr_uri = _venmo_qr_data_uri(venmo_url) if not is_paid else ""
    qr_cell = (
        f'<td width="130" align="center" valign="middle" style="padding:0 0 0 20px;">'
        f'<img src="{venmo_qr_uri}" alt="Scan to pay with Venmo" width="120" height="120" '
        f'style="display:block;width:120px;height:120px;border:3px solid #22d3ee;border-radius:10px;padding:4px;background:#ffffff;">'
        f'<div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#0891b2;font-weight:800;margin-top:4px;">Scan to pay</div>'
        f'</td>'
    ) if venmo_qr_uri else ""
    pay_block = "" if is_paid else f"""
    <tr><td align="center" style="padding:24px 20px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td bgcolor="#008cff" style="background:#008cff;border-radius:999px;padding:16px 32px;" align="center">
              <a href="{venmo_url}" target="_blank" style="color:#ffffff;text-decoration:none;font-family:-apple-system,Arial,sans-serif;font-weight:900;font-size:18px;">
                <span style="font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Pay with </span>
                <span style="font-style:italic;font-size:22px;">Venmo</span>
                <span style="background:rgba(255,255,255,0.22);padding:4px 12px;border-radius:999px;margin-left:8px;font-size:15px;">${grand_total:.2f}</span>
              </a>
            </td>
          </tr></table>
        </td>
        {qr_cell}
      </tr></table>
    </td></tr>
    <tr><td align="center" style="padding:0 20px 12px;font-size:11px;color:#64748b;font-family:-apple-system,Arial,sans-serif;">
      Tap on your phone → Venmo opens with the amount pre-filled. Send to <strong style="color:#0891b2;">@{venmo_handle}</strong>.
    </td></tr>"""

    pickup_date = _e(str(booking.get("pickup_date") or "")[:10])
    from datetime import datetime as _dt, timezone as _tz
    issued_at = _dt.now(_tz.utc).strftime("%B %d, %Y")

    logo_uri = _t2t_logo_data_uri()

    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Text2toss Invoice #{invoice_number}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9;">
  <tr><td align="center" style="padding:20px 12px;">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;max-width:640px;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">

      <!-- HEADER: logo + business info -->
      <tr><td style="padding:20px 24px;border-bottom:3px solid #22d3ee;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="left" valign="middle" style="width:60%;">
            <img src="{logo_uri}" alt="Text2toss Junk Removal" width="240" style="display:block;width:240px;max-width:60%;height:auto;">
          </td>
          <td align="right" valign="middle" style="font-size:11px;color:#475569;line-height:1.5;">
            <strong style="color:#0891b2;font-size:12px;letter-spacing:1px;text-transform:uppercase;">Text2toss Junk Removal</strong><br>
            Flagstaff, AZ<br>
            text2toss@gmail.com<br>
            (928) 853-9619
          </td>
        </tr></table>
      </td></tr>

      <!-- BILL TO / INVOICE META -->
      <tr><td style="padding:20px 24px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="top" style="width:50%;font-size:13px;color:#0a0a0a;line-height:1.5;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#0891b2;margin-bottom:4px;font-weight:800;">Bill to</div>
            <strong>{safe_name}</strong><br>
            {safe_address}<br>
            {safe_email}<br>
            {safe_phone}
          </td>
          <td valign="top" align="right" style="font-size:13px;color:#0a0a0a;line-height:1.5;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#0891b2;margin-bottom:4px;font-weight:800;">Invoice</div>
            <strong>#{invoice_number}</strong><br>
            <span style="font-size:12px;">Issued {issued_at}</span><br>
            <span style="font-size:12px;">Service date {pickup_date}</span><br>
            <div style="margin-top:6px;">{paid_badge}</div>
          </td>
        </tr></table>
      </td></tr>

      <!-- LINE ITEMS -->
      <tr><td style="padding:8px 24px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#0891b2;font-weight:800;margin-bottom:6px;">Line items (grouped)</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td width="6" style="border-bottom:2px solid #0891b2;"></td>
            <td style="border-bottom:2px solid #0891b2;padding:8px 12px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">Item / category</td>
            <td align="center" style="border-bottom:2px solid #0891b2;padding:8px 12px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">Qty</td>
            <td align="center" style="border-bottom:2px solid #0891b2;padding:8px 12px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">Size</td>
            <td align="right" style="border-bottom:2px solid #0891b2;padding:8px 12px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;">Volume / cost</td>
          </tr>
          {line_rows_html}
        </table>
        <div style="font-size:10px;color:#64748b;margin-top:8px;padding:8px 12px;background:#f0fdff;border-left:3px solid #22d3ee;">
          Total volume hauled: <strong>{total_cuft} cu ft</strong>. Cost is shown per category, allocated proportional to volume.
        </div>
      </td></tr>

      <!-- TOTALS -->
      <tr><td style="padding:0 24px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td colspan="4" align="right" style="padding:12px 12px 4px;border-top:2px solid #0891b2;font-size:13px;color:#475569;">Service subtotal</td>
            <td align="right" style="padding:12px 12px 4px;border-top:2px solid #0891b2;font-size:13px;color:#475569;font-weight:700;">${base_price:.2f}</td>
          </tr>
          {extra_rows}
          <tr>
            <td colspan="4" align="right" style="padding:14px 12px 4px;font-size:20px;font-weight:900;color:#0a0a0a;">Grand total</td>
            <td align="right" style="padding:14px 12px 4px;font-size:20px;font-weight:900;color:#0891b2;">${grand_total:.2f}</td>
          </tr>
        </table>
      </td></tr>

      {pay_block}

      <!-- FOOTER -->
      <tr><td align="center" style="padding:20px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
        <strong style="color:#0891b2;letter-spacing:2px;text-transform:uppercase;">Thank you for choosing Text2toss</strong><br>
        Questions? Reply to text2toss@gmail.com or call (928) 853-9619.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""
    return html, grand_total


@api_router.post("/admin/bookings/manual-invoice")
async def admin_create_manual_invoice():
    """Create a blank booking + quote pair so admins can compose a manual
    invoice from scratch (e.g. an in-person job that never went through the
    self-serve quote flow). Returns the new booking ID so the frontend can
    open it directly in the Invoices modal editor.
    """
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    now_iso = _dt.now(_tz.utc).isoformat()
    today = _dt.now(_tz.utc).strftime("%Y-%m-%d")

    quote_id = str(_uuid.uuid4())
    booking_id = str(_uuid.uuid4())

    await db.quotes.insert_one({
        "id": quote_id,
        "items": [],
        "approved_price": 0,
        "total_price": 0,
        "created_by_admin_manual": True,
        "created_at": now_iso,
    })
    await db.bookings.insert_one({
        "id": booking_id,
        "quote_id": quote_id,
        "status": "manual",
        "payment_status": "unpaid",
        "pickup_date": today,
        "customer_details": {"name": "", "address": "", "email": "", "phone": ""},
        "name": "", "address": "", "email": "", "phone": "",
        "approved_price": 0, "total_price": 0,
        "priority_fee": 0, "equipment_fee": 0, "tip_amount": 0,
        "created_by_admin_manual": True,
        "created_at": now_iso,
    })
    return {"success": True, "id": booking_id, "quote_id": quote_id}


@api_router.get("/admin/bookings/{booking_id}/invoice-data")
async def admin_get_invoice_data(booking_id: str):
    """Return the editable payload backing an invoice (customer, pricing,
    line items). Used by the admin Invoices modal to prefill the form."""
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    quote = None
    if booking.get("quote_id"):
        quote = await db.quotes.find_one({"id": booking["quote_id"]}, {"_id": 0})

    cust = booking.get("customer_details") or {}
    base_price = float(
        (quote or {}).get("approved_price")
        or (quote or {}).get("total_price")
        or booking.get("approved_price")
        or booking.get("total_price")
        or booking.get("adjusted_price")
        or booking.get("original_price")
        or 0
    )
    return {
        "id": booking_id,
        "invoice_number": booking_id[:8].upper(),
        "customer": {
            "name": cust.get("name") or booking.get("name") or "",
            "address": cust.get("address") or booking.get("address") or "",
            "email": cust.get("email") or booking.get("email") or "",
            "phone": cust.get("phone") or booking.get("phone") or "",
        },
        "pricing": {
            "base_price": round(base_price, 2),
            "priority_fee": float(booking.get("priority_fee") or 0),
            "equipment_fee": float(booking.get("equipment_fee") or 0),
            "tip_amount": float(booking.get("tip_amount") or 0),
        },
        "pickup_date": str(booking.get("pickup_date") or "")[:10],
        "status": booking.get("status") or "",
        "payment_status": booking.get("payment_status") or "",
        "items": (quote or {}).get("items") or [],
        "quote_id": booking.get("quote_id"),
    }


@api_router.patch("/admin/bookings/{booking_id}/invoice-data")
async def admin_update_invoice_data(booking_id: str, payload: dict):
    """Save edits made in the admin Invoices modal.

    Accepts any subset of `{customer, pricing, items, pickup_date}` and
    persists it — customer/pricing fields go on the `booking` doc while the
    line items array is written back to the linked `quote` doc (or a
    freshly-created quote if the booking never had one).
    """
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking_update: dict = {}
    cust = payload.get("customer") or {}
    if cust:
        # Store both the modern nested `customer_details` shape AND the flat
        # legacy fields so every existing UI/report keeps working.
        booking_update["customer_details"] = {
            "name": str(cust.get("name") or "").strip(),
            "address": str(cust.get("address") or "").strip(),
            "email": str(cust.get("email") or "").strip(),
            "phone": str(cust.get("phone") or "").strip(),
        }
        booking_update["name"] = booking_update["customer_details"]["name"]
        booking_update["address"] = booking_update["customer_details"]["address"]
        booking_update["email"] = booking_update["customer_details"]["email"]
        booking_update["phone"] = booking_update["customer_details"]["phone"]

    pricing = payload.get("pricing") or {}
    if "base_price" in pricing:
        booking_update["approved_price"] = float(pricing["base_price"] or 0)
        booking_update["total_price"] = float(pricing["base_price"] or 0)
    if "priority_fee" in pricing:
        booking_update["priority_fee"] = float(pricing["priority_fee"] or 0)
    if "equipment_fee" in pricing:
        booking_update["equipment_fee"] = float(pricing["equipment_fee"] or 0)
    if "tip_amount" in pricing:
        booking_update["tip_amount"] = float(pricing["tip_amount"] or 0)

    if payload.get("pickup_date"):
        booking_update["pickup_date"] = str(payload["pickup_date"])[:10]

    # Payment status controls the diagonal PAID watermark on the invoice.
    # Accept only the known values so admins can flip a booking paid/unpaid
    # right from the Invoices modal without touching the DB.
    if "payment_status" in payload:
        raw = str(payload.get("payment_status") or "").strip().lower()
        if raw in ("paid", "unpaid", "cancelled", "refunded"):
            booking_update["payment_status"] = raw

    if booking_update:
        booking_update["last_admin_edit_at"] = datetime.now(timezone.utc).isoformat()
        await db.bookings.update_one({"id": booking_id}, {"$set": booking_update})

    # Items live on the quote doc. Create one on the fly for legacy bookings
    # that never had a quote so admins can still add invoice line items.
    if "items" in payload:
        items = payload["items"] or []
        # Sanitize each item — accept only known keys, coerce types.
        clean_items = []
        for it in items:
            if not isinstance(it, dict):
                continue
            clean_items.append({
                "name": str(it.get("name") or "").strip() or "Item",
                "quantity": max(1, int(it.get("quantity") or 1)),
                "size": str(it.get("size") or "medium").strip().lower(),
                "description": str(it.get("description") or "").strip(),
            })
        quote_id = booking.get("quote_id")
        if quote_id:
            existing_quote = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
            if existing_quote:
                await db.quotes.update_one(
                    {"id": quote_id},
                    {"$set": {"items": clean_items,
                              "approved_price": float(pricing.get("base_price") or existing_quote.get("approved_price") or existing_quote.get("total_price") or 0),
                              "total_price": float(pricing.get("base_price") or existing_quote.get("total_price") or 0),
                              "last_admin_edit_at": datetime.now(timezone.utc).isoformat()}},
                )
            else:
                # Legacy booking pointing at a missing quote — recreate it.
                await db.quotes.insert_one({
                    "id": quote_id,
                    "items": clean_items,
                    "approved_price": float(pricing.get("base_price") or 0),
                    "total_price": float(pricing.get("base_price") or 0),
                    "created_by_admin_edit": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        else:
            # No quote_id at all — create one and link it.
            import uuid as _uuid
            new_quote_id = str(_uuid.uuid4())
            await db.quotes.insert_one({
                "id": new_quote_id,
                "items": clean_items,
                "approved_price": float(pricing.get("base_price") or 0),
                "total_price": float(pricing.get("base_price") or 0),
                "created_by_admin_edit": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"quote_id": new_quote_id}},
            )
    return {"success": True, "id": booking_id}


@api_router.get("/admin/bookings/{booking_id}/invoice", response_class=HTMLResponse)
async def admin_booking_invoice(booking_id: str):
    """Render the invoice HTML for browser view / print.

    Wrapped in a try/except so any legacy-booking data-shape surprise still
    returns a readable HTML page (never a blank white screen).
    """
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    quote = None
    if booking.get("quote_id"):
        quote = await db.quotes.find_one({"id": booking["quote_id"]}, {"_id": 0})
    try:
        html, _ = _build_invoice_html(booking, quote)
        return html
    except Exception as exc:  # noqa: BLE001
        logging.exception(f"[invoice-html] render failed for {booking_id}")
        fallback = f"""<!doctype html><html><head><meta charset='utf-8'>
<title>Invoice #{booking_id[:8].upper()}</title>
<style>body{{font-family:-apple-system,Arial,sans-serif;max-width:640px;margin:60px auto;padding:24px;color:#0f172a}}
h1{{color:#0891b2}} .err{{background:#fee2e2;border:1px solid #fecaca;padding:12px;border-radius:8px;color:#991b1b;font-size:13px}}</style></head>
<body>
<h1>Invoice #{booking_id[:8].upper()}</h1>
<p><strong>Customer:</strong> {_h(booking.get('name') or booking.get('email') or 'Customer')}</p>
<p><strong>Pickup date:</strong> {_h(str(booking.get('pickup_date') or '—')[:10])}</p>
<p><strong>Total:</strong> ${float(booking.get('approved_price') or booking.get('adjusted_price') or booking.get('original_price') or 0):.2f}</p>
<p><strong>Status:</strong> {_h(booking.get('status') or 'unknown')}</p>
<div class='err'>Some legacy fields on this booking couldn't be rendered as a full branded invoice. If you need a formal copy, please edit the booking to fill in the missing fields, then reopen this invoice.</div>
</body></html>"""
        return HTMLResponse(content=fallback, status_code=200)


def _h(s) -> str:
    """Lightweight HTML escape used by the invoice fallback template."""
    from html import escape as _html_escape
    return _html_escape(str(s if s is not None else ""))


@api_router.post("/webhooks/venmo-payment")
async def venmo_payment_webhook(payload: dict, request: Request):
    """Auto-mark-paid endpoint driven by an external Venmo bridge.

    Venmo does NOT offer public webhooks for personal accounts — so this
    endpoint is designed to be called by an **IFTTT / Zapier bridge** the
    user configures against their own Venmo notification emails:

        IFTTT applet:
          Trigger: Gmail → New email from `venmo@venmo.com` matching "paid you"
          Action:  Webhooks → POST to `{PUBLIC_BASE_URL}/api/webhooks/venmo-payment`
                   Body (JSON): {
                     "secret":  "<VENMO_WEBHOOK_SECRET from backend .env>",
                     "amount":  "{{Amount}}",           # e.g. "645.00"
                     "note":    "{{Note}}",             # e.g. "Text2toss Invoice #3AF2ACBF"
                     "from":    "{{From}}"              # optional — sender handle
                   }

    The endpoint extracts the invoice number from the Venmo `note` (which our
    invoice pre-fills as "Text2toss Invoice #XXXXXXXX") and flips that
    booking's payment_status to `paid`. If no invoice number is found it
    falls back to matching on the exact grand-total amount for the newest
    unpaid booking.
    """
    # Auth — plain shared-secret check keeps this endpoint spam-proof.
    expected = os.environ.get("VENMO_WEBHOOK_SECRET", "").strip()
    supplied = (
        (payload or {}).get("secret")
        or request.headers.get("x-webhook-secret")
        or ""
    ).strip()
    if not expected or supplied != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret")

    note = str((payload or {}).get("note") or "").strip()
    amount_raw = str((payload or {}).get("amount") or "").replace("$", "").replace(",", "").strip()
    try:
        amount = float(amount_raw) if amount_raw else 0.0
    except ValueError:
        amount = 0.0

    # 1) Try to extract the invoice number from the Venmo memo.
    import re as _re
    match = _re.search(r"#([A-F0-9]{8})", note.upper())
    booking = None
    match_method = None
    if match:
        prefix = match.group(1).lower()
        booking = await db.bookings.find_one(
            {"id": {"$regex": f"^{prefix}", "$options": "i"}, "payment_status": {"$ne": "paid"}},
            {"_id": 0},
        )
        if booking:
            match_method = "invoice_number"

    # 2) Fallback: match on grand-total amount for the newest unpaid booking.
    if not booking and amount > 0:
        cursor = db.bookings.find({"payment_status": {"$ne": "paid"}}, {"_id": 0}).sort("created_at", -1)
        async for b in cursor:
            b_total = float(
                b.get("approved_price")
                or b.get("total_price")
                or b.get("adjusted_price")
                or b.get("original_price")
                or 0
            ) + float(b.get("tip_amount") or 0)
            if abs(b_total - amount) < 0.01:
                booking = b
                match_method = "amount"
                break

    if not booking:
        logging.warning(f"[venmo-webhook] no booking matched note={note!r} amount={amount}")
        return {"success": False, "matched": False, "message": "No matching unpaid booking"}

    await db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {
            "payment_status": "paid",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "paid_via": "venmo_webhook",
            "venmo_webhook_meta": {
                "matched_by": match_method,
                "note": note,
                "amount": amount,
                "sender": (payload or {}).get("from"),
                "received_at": datetime.now(timezone.utc).isoformat(),
            },
        }},
    )
    logging.info(f"[venmo-webhook] flipped {booking['id']} to paid via {match_method}")
    return {
        "success": True,
        "matched": True,
        "booking_id": booking["id"],
        "matched_by": match_method,
        "amount": amount,
    }


@api_router.get("/admin/bookings/{booking_id}/invoice.pdf")
async def admin_booking_invoice_pdf(booking_id: str):
    """Server-side rendered PDF of the branded invoice.

    Uses WeasyPrint to convert the same HTML the browser view produces
    into a clean, single-file PDF that customers can save/attach without
    fiddling with browser print dialogs.
    """
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    quote = None
    if booking.get("quote_id"):
        quote = await db.quotes.find_one({"id": booking["quote_id"]}, {"_id": 0})
    # `for_email=True` gives us: inlined base64 logo (no network fetch during
    # PDF rendering) + no interactive script/print buttons in the output.
    try:
        html, _ = _build_invoice_html(booking, quote, for_email=True)
    except Exception as exc:  # noqa: BLE001
        logging.exception(f"[invoice-pdf] html build failed for {booking_id}")
        raise HTTPException(status_code=500, detail="Invoice data incomplete — open the booking, fill in missing fields, then retry")
    try:
        from weasyprint import HTML as _WHtml
        pdf_bytes = _WHtml(string=html).write_pdf()
    except Exception as exc:
        logging.error(f"[invoice-pdf] weasyprint failed for {booking_id}: {exc}")
        raise HTTPException(status_code=500, detail="PDF render failed")
    invoice_number = booking_id[:8].upper()
    filename = f"text2toss-invoice-{invoice_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@api_router.post("/admin/bookings/{booking_id}/invoice/email")
async def admin_email_invoice(booking_id: str):
    """One-click send: emails the branded invoice to the customer on file."""
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    customer_email = (booking.get("email") or "").strip()
    if not customer_email:
        raise HTTPException(status_code=400, detail="No email on file for this customer")
    quote = None
    if booking.get("quote_id"):
        quote = await db.quotes.find_one({"id": booking["quote_id"]}, {"_id": 0})
    html, grand_total = _build_invoice_email_html(booking, quote)
    invoice_number = booking_id[:8].upper()
    subject = f"Your Text2toss invoice #{invoice_number} — ${grand_total:.2f}"
    pdf_attachment = _build_invoice_pdf_attachment(booking, quote)
    res = await send_email(
        to_email=customer_email,
        subject=subject,
        html_content=html,
        attachments=[pdf_attachment] if pdf_attachment else None,
    )
    if res.get("status") != "sent":
        raise HTTPException(status_code=500, detail=f"Email send failed: {res.get('message', 'unknown error')}")
    return {"success": True, "to_email": customer_email, "invoice_number": invoice_number}


@api_router.get("/admin/sms-status/{message_sid}")
async def get_sms_status(message_sid: str):
    """Fetch the live delivery status of a sent SMS by Twilio SID.

    Carriers update status async (queued → sent → delivered or undelivered).
    Returns error_code so the UI can show friendly help text for 30034 (A2P
    not registered), 21610 (recipient unsubscribed), etc.
    """
    client = get_twilio_client()
    if not client:
        raise HTTPException(status_code=500, detail="SMS not configured")
    try:
        msg = client.messages(message_sid).fetch()
        return {
            "message_sid": msg.sid,
            "status": msg.status,
            "error_code": msg.error_code,
            "error_message": msg.error_message,
            "price": msg.price,
            "to": msg.to,
            "date_sent": msg.date_sent.isoformat() if msg.date_sent else None,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@api_router.post("/admin/test-sms")
async def test_sms_setup():
    """Test SMS configuration"""
    client = get_twilio_client()
    if not client:
        return {
            "configured": False,
            "message": "SMS not configured - missing Twilio credentials"
        }
    
    return {
        "configured": True,
        "message": "Twilio SMS is configured and ready",
        "account_sid": os.environ.get('TWILIO_ACCOUNT_SID')[:8] + "..." if os.environ.get('TWILIO_ACCOUNT_SID') else None
    }

@api_router.get("/admin/sms-messages")
async def get_sms_messages():
    """Get SMS message history from Twilio"""
    try:
        client = get_twilio_client()
        if not client:
            raise HTTPException(status_code=500, detail="SMS not configured")
        
        # Get messages from Twilio (last 50 messages)
        messages = client.messages.list(limit=50)
        
        message_list = []
        for msg in messages:
            message_list.append({
                "message_sid": msg.sid,
                "to": msg.to,
                "from": msg.from_,
                "body": msg.body,
                "status": msg.status,
                "date_sent": msg.date_sent.isoformat() if msg.date_sent else None,
                "date_created": msg.date_created.isoformat() if msg.date_created else None,
                "direction": msg.direction,
                "price": msg.price,
                "error_code": msg.error_code,
                "error_message": msg.error_message
            })
        
        return {
            "success": True,
            "messages": message_list,
            "count": len(message_list)
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch SMS messages: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch SMS messages: {str(e)}")

@api_router.post("/admin/send-sms")
async def send_sms_admin(request: dict):
    """Send SMS message to customer from admin"""
    try:
        phone = request.get('phone')
        message = request.get('message')
        
        if not phone or not message:
            raise HTTPException(status_code=400, detail="Phone number and message are required")
        
        client = get_twilio_client()
        if not client:
            raise HTTPException(status_code=500, detail="SMS not configured")
        
        twilio_phone = os.environ.get('TWILIO_PHONE_NUMBER')
        if not twilio_phone:
            raise HTTPException(status_code=500, detail="Twilio phone number not configured")
        
        # Send SMS via Twilio
        message_instance = client.messages.create(
            body=message,
            from_=twilio_phone,
            to=phone
        )
        
        # Log the SMS activity
        logger.info(f"Admin SMS sent to {phone}: {message_instance.sid}")
        
        return {
            "success": True,
            "message_sid": message_instance.sid,
            "status": message_instance.status,
            "to": phone,
            "message": "SMS sent successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to send admin SMS: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send SMS: {str(e)}")

@api_router.post("/admin/test-sms-photo/{booking_id}")
async def test_sms_photo(booking_id: str):
    """Test SMS photo sending to confirm setup and functionality"""
    
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if not booking.get("completion_photo_path"):
        raise HTTPException(status_code=400, detail="No completion photo available")
    
    # Create fully accessible URL for the completion photo
    backend_url = os.environ.get('BACKEND_URL') or os.environ.get('REACT_APP_BACKEND_URL')
    completion_photo_url = f"{backend_url}/api/public/completion-photo/{booking_id}"
    
    result = await send_sms(
        booking["phone"],
        f"TEST: Text2toss job completion photo. View at: {completion_photo_url}"
    )
    
    return {
        "message": "SMS photo test completed",
        "sms_configured": result["success"],
        "sms_simulation": result.get("simulation", False),
        "photo_url": completion_photo_url,
        "phone": booking["phone"]
    }

# Quote Approval System Endpoints
@api_router.get("/admin/pending-quotes")
async def get_pending_quotes():
    """Get all quotes pending approval (Scale 9-20)"""
    try:
        pipeline = [
            {
                "$match": {
                    "approval_status": "pending_approval"
                }
            },
            {
                "$sort": {"created_at": -1}
            }
        ]
        
        quotes_cursor = db.quotes.aggregate(pipeline)
        quotes = await quotes_cursor.to_list(length=1000)  # Reasonable limit for pending quotes dashboard
        
        # Parse quotes from mongo
        parsed_quotes = []
        for quote in quotes:
            # Remove MongoDB _id field to avoid serialization issues
            if "_id" in quote:
                del quote["_id"]
            parsed_quote = parse_from_mongo(quote)
            parsed_quotes.append(parsed_quote)
        
        return parsed_quotes
        
    except Exception as e:
        logger.error(f"Error fetching pending quotes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch pending quotes")


@api_router.get("/admin/auto-approved-quotes")
async def get_auto_approved_quotes(limit: int = 100, include_dismissed: bool = False):
    """Return recently auto-approved quotes with their associated booking
    (if any). Dismissed quotes are hidden by default; pass
    ``?include_dismissed=true`` to show them for an audit view."""
    try:
        cap = max(1, min(limit, 500))
        query = {"approval_status": "auto_approved"}
        if not include_dismissed:
            query["$or"] = [
                {"dismissed_at": {"$exists": False}},
                {"dismissed_at": None},
            ]
        cursor = db.quotes.find(query, {"_id": 0}).sort("created_at", -1).limit(cap)
        quotes = await cursor.to_list(length=cap)
        if not quotes:
            return []

        # Batch-load matching bookings so the operator can see which quotes
        # turned into real jobs (and skip the ones that abandoned).
        quote_ids = [q["id"] for q in quotes]
        bookings_cursor = db.bookings.find(
            {"quote_id": {"$in": quote_ids}},
            {
                "_id": 0, "id": 1, "quote_id": 1, "address": 1, "phone": 1,
                "email": 1, "customer_name": 1, "pickup_date": 1, "pickup_time": 1,
                "status": 1, "payment_status": 1, "created_at": 1,
            },
        )
        bookings_by_quote = {}
        async for b in bookings_cursor:
            bookings_by_quote.setdefault(b["quote_id"], []).append(parse_from_mongo(b))

        for q in quotes:
            parsed = parse_from_mongo(q)
            related = bookings_by_quote.get(q["id"], [])
            # Pick the most recent booking if multiple exist
            related.sort(key=lambda b: b.get("created_at") or "", reverse=True)
            q.update(parsed)
            q["booking"] = related[0] if related else None
            q["has_booking"] = bool(related)

        return quotes
    except Exception as e:
        logger.error(f"Error fetching auto-approved quotes: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch auto-approved quotes")


@api_router.post("/admin/quotes/{quote_id}/dismiss")
async def dismiss_quote(quote_id: str):
    """Hide a quote from the auto-approved bucket without deleting it.

    The record stays in the database (audit trail, stats still count it);
    it just no longer clutters the operator's review surface.
    """
    now = datetime.now(timezone.utc).isoformat()
    result = await db.quotes.update_one(
        {"id": quote_id},
        {"$set": {"dismissed_at": now}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"success": True, "dismissed_at": now}


@api_router.post("/admin/quotes/dismiss-all-auto-approved")
async def dismiss_all_auto_approved():
    """Bulk-dismiss every currently-visible auto-approved quote. Equivalent
    to the "Clear all" button on the Auto-Approved modal."""
    now = datetime.now(timezone.utc).isoformat()
    result = await db.quotes.update_many(
        {
            "approval_status": "auto_approved",
            "$or": [
                {"dismissed_at": {"$exists": False}},
                {"dismissed_at": None},
            ],
        },
        {"$set": {"dismissed_at": now}},
    )
    return {"success": True, "dismissed": result.modified_count}


@api_router.get("/admin/recent-completed")
async def get_recent_completed(days: int = 7):
    """Completed bookings from the last N days (default 7).

    The main admin dashboard's Completed bin used to filter on today-only
    because it was sourced from the daily schedule — completions from
    yesterday silently disappeared from view. This endpoint gives the
    Completed bin a rolling window so recent jobs stay visible.
    """
    cap_days = max(1, min(days, 90))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=cap_days)).date().isoformat()
    cursor = db.bookings.find(
        {"status": "completed", "pickup_date": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("pickup_date", -1).limit(200)
    bookings = await cursor.to_list(length=200)
    quote_dict = await _fetch_quotes_for_bookings(bookings)
    result = []
    for b in bookings:
        parsed = parse_from_mongo(b)
        _attach_quote_details_inplace(parsed, quote_dict)
        result.append(parsed)
    return result

@api_router.post("/admin/quotes/{quote_id}/approve")
async def approve_quote(quote_id: str, approval_action: QuoteApprovalAction):
    """Approve or reject a quote.

    Refactored from a 240-line/complexity-24 monolith into focused helpers:
      - _validate_quote_for_approval         → fetches & checks state
      - _build_quote_update                  → status / notes / approved_price
      - _process_quote_price_increase        → SMS path when admin raises price
      - _send_quote_approval_decision_email  → approval / rejection email
    """
    try:
        quote = await _validate_quote_for_approval(quote_id)
        update_data = _build_quote_update(approval_action)
        original_price = quote.get("total_price", 0)

        if approval_action.approved_price is not None:
            update_data["approved_price"] = approval_action.approved_price
            if approval_action.approved_price > original_price:
                await _process_quote_price_increase(quote_id, approval_action, original_price, update_data)
            else:
                # Re-approval at same or lower price: clear any stale
                # customer-approval state from a previous price increase so
                # the booking flow doesn't keep waiting for an old SMS link.
                await _clear_stale_price_adjustment_fields(quote_id)

        await db.quotes.update_one({"id": quote_id}, {"$set": update_data})
        await _send_quote_approval_decision_email(quote_id, quote, approval_action)

        updated_quote = await db.quotes.find_one({"id": quote_id})
        if updated_quote and "_id" in updated_quote:
            del updated_quote["_id"]
        updated_quote = parse_from_mongo(updated_quote)

        return {"message": f"Quote {approval_action.action}d successfully", "quote": updated_quote}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving quote: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to process quote approval")


async def _validate_quote_for_approval(quote_id: str) -> dict:
    """Fetch the quote and ensure it is currently pending approval."""
    quote = await db.quotes.find_one({"id": quote_id})
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    if quote.get("approval_status") not in ["pending_approval"]:
        raise HTTPException(status_code=400, detail="Quote is not pending approval")
    return quote


def _build_quote_update(approval_action) -> dict:
    """Build the base $set payload (no price-adjustment logic)."""
    return {
        "approval_status": "approved" if approval_action.action == "approve" else "rejected",
        "admin_notes": approval_action.admin_notes,
        "approved_by": "admin",
        "approved_at": datetime.now(timezone.utc).isoformat()
    }


async def _process_quote_price_increase(quote_id: str, approval_action, original_price: float, update_data: dict):
    """Customer needs to re-confirm a higher price → mark booking pending and SMS them."""
    existing_booking = await db.bookings.find_one({"quote_id": quote_id})
    if not existing_booking:
        return

    approval_token = str(uuid.uuid4())
    booking_update = {
        "status": "pending_customer_approval",
        "original_price": original_price,
        "adjusted_price": approval_action.approved_price,
        "price_adjustment_reason": approval_action.admin_notes or "Price adjustment by admin",
        "customer_approval_token": approval_token,
        "requires_customer_approval": True
    }
    await db.bookings.update_one({"id": existing_booking["id"]}, {"$set": booking_update})

    try:
        price_increase = approval_action.approved_price - original_price
        backend_url = os.environ.get("BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
        approval_url = f"{backend_url}/customer-approval/{approval_token}"
        message = (
            "🔔 Text2toss Price Update\n\n"
            f"Your quote has been updated from ${original_price:.2f} to "
            f"${approval_action.approved_price:.2f} (+${price_increase:.2f}).\n\n"
            f"Reason: {approval_action.admin_notes or 'Price adjustment after review'}\n\n"
            f"Please review and approve: {approval_url}\n\n"
            "Your job is on hold until you approve the new price."
        )
        await send_sms(existing_booking["phone"], message)
        update_data["approval_status"] = "approved_pending_customer"
    except Exception as sms_error:
        logger.error(f"Failed to send price change notification: {sms_error}")


async def _clear_stale_price_adjustment_fields(quote_id: str):
    """Re-approval at same or lower price: drop leftover customer-approval state.
    Without this, a booking previously bumped to `pending_customer_approval`
    would keep its old approval token and adjusted_price after a re-approval."""
    booking = await db.bookings.find_one({"quote_id": quote_id})
    if not booking:
        return
    if not (booking.get("requires_customer_approval") or booking.get("customer_approval_token")):
        return
    await db.bookings.update_one(
        {"id": booking["id"]},
        {
            "$unset": {
                "customer_approval_token": "",
                "adjusted_price": "",
                "original_price": "",
                "price_adjustment_reason": "",
                "requires_customer_approval": ""
            },
            "$set": {"status": "pending_payment"}
        }
    )


async def _send_quote_approval_decision_email(quote_id: str, quote: dict, approval_action):
    """Send the customer the approve/reject email (best effort, never blocks)."""
    if not is_email_enabled():
        return
    booking = await db.bookings.find_one({"quote_id": quote_id})
    if not booking or not booking.get("email"):
        return

    customer_email = booking["email"]
    customer_name = booking.get("name", "Valued Customer")
    booking_id = booking.get("id")
    try:
        if approval_action.action == "approve":
            approved_price = approval_action.approved_price or quote.get("total_price")
            html = _build_quote_approval_email_html(
                quote, approval_action, customer_name, approved_price, booking_id
            )
            await send_email(customer_email, "✅ Your Quote Has Been Approved - Text2toss", html)
            logging.info(f"Approval email sent to {customer_email}")
        else:
            html = _build_quote_rejection_email_html(approval_action, customer_name)
            await send_email(customer_email, "Quote Decision - Text2toss", html)
            logging.info(f"Rejection email sent to {customer_email}")
    except Exception as email_error:
        logging.error(f"Failed to send approval/rejection email: {email_error}")
        # Don't fail the approval process if email fails


def _build_quote_approval_email_html(
    quote: dict,
    approval_action,
    customer_name: str,
    approved_price: float,
    booking_id: Optional[str] = None,
) -> str:
    """Thin wrapper — delegates to templates.email_templates."""
    return email_templates.quote_approval_email(
        quote, approval_action, customer_name, approved_price, booking_id,
    )


def _build_quote_rejection_email_html(approval_action, customer_name: str) -> str:
    """Thin wrapper — delegates to templates.email_templates."""
    return email_templates.quote_rejection_email(approval_action, customer_name)

@api_router.get("/admin/quote-approval-stats")
async def get_quote_approval_stats():
    """Get statistics for quote approval system.
    Note: ``auto_approved`` excludes dismissed quotes so the dashboard badge
    matches the visible list (otherwise Clear-All leaves the badge stale)."""
    try:
        # Count quotes by approval status
        pending_count = await db.quotes.count_documents({"approval_status": "pending_approval"})
        approved_count = await db.quotes.count_documents({"approval_status": "approved"})
        rejected_count = await db.quotes.count_documents({"approval_status": "rejected"})
        auto_approved_count = await db.quotes.count_documents({
            "approval_status": "auto_approved",
            "$or": [
                {"dismissed_at": {"$exists": False}},
                {"dismissed_at": None},
            ],
        })
        
        return {
            "pending_approval": pending_count,
            "approved": approved_count,
            "rejected": rejected_count,
            "auto_approved": auto_approved_count,
            "total_requiring_approval": pending_count + approved_count + rejected_count
        }
        
    except Exception as e:
        logger.error(f"Error fetching approval stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch approval statistics")


@api_router.post("/admin/quote-cache/clear")
async def clear_quote_cache():
    """One-shot admin tool: wipe the entire image-quote cache.
    Useful after upgrading the AI prompt/model so stale (inconsistent)
    cached quotes don't keep haunting customers who re-upload."""
    before = await db.image_cache.count_documents({})
    result = await db.image_cache.delete_many({})
    logger.info(f"Admin cleared quote cache: deleted {result.deleted_count} entries (was {before})")
    return {
        "success": True,
        "deleted": result.deleted_count,
        "previous_count": before,
    }


@api_router.post("/admin/login")
async def admin_login(login_data: AdminLogin):
    """Secure admin username/password authentication — sets httpOnly cookie"""
    try:
        admin_user = await db.admin_users.find_one({"username": login_data.username})
        if not admin_user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not pwd_context.verify(login_data.password, admin_user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        admin_token = jwt.encode(
            {
                "admin": True,
                "username": admin_user["username"],
                "display_name": admin_user["display_name"],
                "exp": datetime.now(timezone.utc) + timedelta(hours=8)
            },
            SECRET_KEY,
            algorithm=ALGORITHM
        )

        response = JSONResponse(content={
            "success": True,
            "message": "Login successful",
            "display_name": admin_user["display_name"]
        })
        response.set_cookie(
            key="admin_session",
            value=admin_token,
            httponly=True,
            secure=True,
            # `none` is REQUIRED for the admin cookie to be sent on cross-site
            # XHR. The deployed frontend (e.g. text2toss.com) calls a different
            # backend host (e.g. junkai-platform.emergent.host), so the cookie
            # must be cross-site-eligible. `Lax` would silently drop it on
            # every fetch/XHR and produce empty admin bins.
            # `secure=True` is mandatory whenever SameSite is `None`.
            samesite="none",
            max_age=8 * 3600,
            path="/api"
        )
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin login error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid credentials")

@api_router.post("/admin/logout")
async def admin_logout():
    """Clear the admin session cookie"""
    response = JSONResponse(content={"success": True, "message": "Logged out"})
    response.delete_cookie("admin_session", path="/api")
    return response

@api_router.post("/admin/init")
async def initialize_admin():
    """Initialize the admin user - run once to set up the admin account"""
    # Check if admin user already exists
    existing_admin = await db.admin_users.find_one({"username": "lrobe"})
    if existing_admin:
        return {"message": "Admin user already exists"}
    
    # Hash the password securely - get from environment variable
    admin_password = os.environ.get("ADMIN_PASSWORD", "L1964c10$")
    password_hash = pwd_context.hash(admin_password)
    
    # Create admin user
    admin_user = AdminUser(
        username="lrobe",
        password_hash=password_hash,
        display_name="Lee Robertson"
    )
    
    # Store in database
    admin_dict = prepare_for_mongo(admin_user.dict())
    await db.admin_users.insert_one(admin_dict)
    
    logger.info("Admin user 'lrobe' created successfully")
    return {"message": "Admin user created successfully", "username": "lrobe"}

@api_router.get("/admin/verify")
async def verify_admin_token(request: Request):
    """Verify admin session from httpOnly cookie and return admin info"""
    admin_session = request.cookies.get("admin_session")
    if not admin_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(admin_session, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("admin"):
            raise HTTPException(status_code=401, detail="Invalid admin token")
        return {
            "valid": True,
            "username": payload.get("username"),
            "display_name": payload.get("display_name")
        }
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

@api_router.post("/admin/send-bulk-email-reminder")
async def send_bulk_email_reminder():
    """Send payment reminder emails to all bookings with pending payments.

    Refactored: per-booking work moved into `_send_one_payment_reminder` to
    flatten nesting and make each step independently testable.
    """
    try:
        bookings = await db.bookings.find({"payment_status": "pending"}).to_list(1000)
        if not bookings:
            return {"success": True, "message": "No pending payments found", "sent_count": 0, "failed_count": 0}

        quote_ids = [b["quote_id"] for b in bookings if b.get("quote_id")]
        quotes = (
            await db.quotes.find({"id": {"$in": quote_ids}}).to_list(length=1000)
            if quote_ids else []
        )
        quote_dict = {q["id"]: q for q in quotes}

        sent_count = 0
        failed_count = 0
        errors: list[str] = []

        for booking_doc in bookings:
            ok, err = await _send_one_payment_reminder(booking_doc, quote_dict)
            if ok:
                sent_count += 1
            elif err:
                failed_count += 1
                errors.append(err)

        return {
            "success": True,
            "sent_count": sent_count,
            "failed_count": failed_count,
            "errors": errors if failed_count > 0 else None,
            "message": f"Sent {sent_count} email(s), {failed_count} failed",
        }

    except Exception as e:
        logger.error(f"Error sending bulk email reminders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send bulk emails: {str(e)}")


async def _send_one_payment_reminder(booking_doc: dict, quote_dict: dict) -> tuple[bool, Optional[str]]:
    """Send a payment reminder for a single booking.

    Returns (sent_ok, error_string_if_failed). When the booking lacks an
    email or quote, returns (False, None) — i.e. silently skipped, not failed.
    """
    try:
        booking = Booking(**parse_from_mongo(booking_doc))
        if not booking.email:
            return False, None

        quote_doc = quote_dict.get(booking.quote_id)
        if not quote_doc:
            return False, None

        if not is_email_enabled():
            return False, None

        amount = quote_doc.get("total_price", 0)
        venmo_qr_url = os.environ.get(
            "VENMO_QR_URL",
            "https://www.paypal.com/qrcodes/venmocs/9f1f97dd-23ed-4676-82b5-3fc2126def65?created=1762118921",
        )

        email_html = create_payment_reminder_email(booking.dict(), amount, booking.id, venmo_qr_url)
        await send_email(
            to_email=booking.email,
            subject=f"💳 Payment Reminder - Booking {booking.id[:8]}",
            html_content=email_html,
        )
        logging.info(f"Bulk payment reminder email sent to {booking.email}")
        return True, None

    except Exception as e:
        booking_id = booking_doc.get("id", "unknown")
        booking_email = booking_doc.get("email", "unknown")
        logging.error(f"Failed to send bulk email to {booking_email}: {str(e)}")
        return False, f"Booking {booking_id}: {str(e)}"

@api_router.post("/admin/send-booking-confirmation-email/{booking_id}")
async def send_booking_confirmation_email_admin(booking_id: str):
    """Send booking confirmation email to a specific booking (admin endpoint)"""
    try:
        # Get booking
        booking_doc = await db.bookings.find_one({"id": booking_id})
        if not booking_doc:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        booking = Booking(**parse_from_mongo(booking_doc))
        
        if not booking.email:
            raise HTTPException(status_code=400, detail="No email address for this booking")
        
        # Get quote details
        quote_doc = await db.quotes.find_one({"id": booking.quote_id})
        if not quote_doc:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # Create and send booking confirmation email
        if is_email_enabled():
            email_html = create_booking_confirmation_email(
                booking.dict(), 
                quote_doc
            )
            
            await send_email(
                to_email=booking.email,
                subject=f"✅ Booking Confirmed - {booking_id[:8]}",
                html_content=email_html
            )
            
            logging.info(f"Booking confirmation email sent for {booking_id} to {booking.email}")
            return {"success": True, "message": "Booking confirmation email sent"}
        else:
            raise HTTPException(status_code=500, detail="Email service not enabled")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error sending booking confirmation email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

@api_router.post("/admin/send-custom-email")
async def send_custom_email(
    to_email: str,
    subject: str,
    message: str
):
    """Send custom email to customer from admin"""
    try:
        if not is_email_enabled():
            raise HTTPException(status_code=500, detail="Email service not enabled")
        
        # Create simple HTML email
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
            <div style="max-width: 600px; margin: 20px auto; background-color: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 28px;">Text2toss Junk Removal</h1>
                </div>
                
                <div style="padding: 30px; color: #333;">
                    <div style="white-space: pre-wrap; line-height: 1.6;">{message}</div>
                </div>
                
                <div style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                    <p style="color: #666; font-size: 14px; margin: 5px 0;">
                        Text2toss Junk Removal Services
                    </p>
                    <p style="color: #999; font-size: 12px; margin: 5px 0;">
                        Professional junk removal you can trust
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        await send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content
        )
        
        logging.info(f"Custom email sent to {to_email}")
        return {"success": True, "message": "Email sent successfully"}
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error sending custom email: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

# Venmo-only payment system - Stripe endpoints removed

@api_router.post("/admin/optimize-route")
async def optimize_route():
    """Optimize pickup routes for scheduled bookings using Google Maps"""
    try:
        # Check if Google Maps API key is available
        google_maps_key = os.environ.get('GOOGLE_MAPS_API_KEY')
        if not google_maps_key:
            return {
                "message": "Google Maps API key not configured. Please add GOOGLE_MAPS_API_KEY to your environment.",
                "optimized": False,
                "setup_required": True
            }
        
        # Get today's scheduled bookings
        today = datetime.now(timezone.utc).date()
        bookings = await db.bookings.find({
            "pickup_date": today.isoformat(),
            "status": "scheduled"
        }).to_list(length=100)  # Reasonable limit for daily route optimization
        
        if len(bookings) < 2:
            return {"message": "Need at least 2 bookings to optimize route", "optimized": False}
        
        # Extract addresses for route optimization
        addresses = [booking["address"] for booking in bookings]
        
        # Call Google Maps Distance Matrix API for route optimization
        optimized_route = await calculate_optimized_route(addresses, google_maps_key)
        
        logger.info(f"Route optimized for {len(bookings)} bookings using Google Maps")
        
        return {
            "message": f"Route optimized for {len(bookings)} pickups using Google Maps",
            "optimized": True,
            "bookings_count": len(bookings),
            "route_data": optimized_route
        }
    except Exception as e:
        logger.error(f"Error optimizing route: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to optimize route: {str(e)}")

@api_router.get("/admin/all-bookings")
async def get_all_bookings():
    """Get all bookings (history + present) with quote details.

    Refactored: extracted `_attach_quote_details_inplace` helper to flatten
    the inner nesting and use early-continue on missing ids.
    """
    try:
        bookings = await db.bookings.find({}).sort("created_at", -1).to_list(10000)
        quote_dict = await _fetch_quotes_for_bookings(bookings)

        result = []
        for booking in bookings:
            booking.pop("_id", None)
            booking_data = parse_from_mongo(booking)
            _attach_quote_details_inplace(booking_data, quote_dict)
            result.append(booking_data)
        return result
    except Exception as e:
        logger.error(f"Error fetching all bookings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch bookings")


async def _fetch_quotes_for_bookings(bookings: list) -> dict:
    """Batch-fetch all quotes referenced by `bookings` to avoid N+1."""
    quote_ids = [b["quote_id"] for b in bookings if b.get("quote_id")]
    if not quote_ids:
        return {}
    quotes = await db.quotes.find({"id": {"$in": quote_ids}}).to_list(length=10000)
    return {q["id"]: q for q in quotes}


def _attach_quote_details_inplace(booking_data: dict, quote_dict: dict) -> None:
    """Mutate booking_data with parsed quote_details, if any. Early-returns on misses."""
    quote_id = booking_data.get("quote_id")
    if not quote_id:
        return
    quote = quote_dict.get(quote_id)
    if not quote:
        return
    quote.pop("_id", None)
    booking_data["quote_details"] = parse_from_mongo(quote)


async def calculate_optimized_route(addresses: list, api_key: str):
    """Calculate optimized route using Google Maps Distance Matrix API"""
    try:
        import httpx
        
        # For simplicity, we'll use the first address as origin and calculate distances
        if len(addresses) < 2:
            return {"route": addresses}
        
        origin = addresses[0]
        destinations = "|".join(addresses[1:])
        
        url = "https://maps.googleapis.com/maps/api/distancematrix/json"
        params = {
            "origins": origin,
            "destinations": destinations,
            "key": api_key,
            "units": "imperial"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") == "OK":
                # Simple optimization: sort by distance (in production, use proper TSP algorithm)
                distances = []
                elements = data.get("rows", [{}])[0].get("elements", [])
                
                for i, element in enumerate(elements):
                    if element.get("status") == "OK":
                        distance = element.get("distance", {}).get("value", float('inf'))
                        distances.append((i + 1, distance, addresses[i + 1]))
                
                # Sort by distance and create optimized route
                distances.sort(key=lambda x: x[1])
                optimized_addresses = [origin] + [addr for _, _, addr in distances]
                
                return {
                    "route": optimized_addresses,
                    "total_addresses": len(optimized_addresses),
                    "optimization_method": "distance_based"
                }
            else:
                return {
                    "route": addresses,
                    "error": f"Google Maps API error: {data.get('status', 'Unknown error')}"
                }
                
    except Exception as e:
        logger.error(f"Google Maps API call failed: {str(e)}")
        return {
            "route": addresses,
            "error": f"Route calculation failed: {str(e)}"
        }

# Photo Management Endpoints
@api_router.get("/admin/gallery-photos")
async def get_gallery_photos():
    """Get gallery photos (limited to most recent 500 for performance)"""
    try:
        photos = await db.gallery_photos.find({}).sort("created_at", -1).limit(500).to_list(500)
        # Ensure all URLs are full URLs for consistent display
        full_urls = []
        for photo in photos:
            url = photo["url"]
            backend_url = os.environ.get('BACKEND_URL') or os.environ.get('REACT_APP_BACKEND_URL')
            if url.startswith('/static/'):
                # Convert old /static/ URLs to new API endpoint URLs
                url = url.replace('/static/', '/api/images/')
                url = f"{backend_url}{url}"
            elif url.startswith('/files/'):
                # Convert /files/ URLs to API endpoint URLs
                url = url.replace('/files/', '/api/images/')
                url = f"{backend_url}{url}"
            elif url.startswith('/api/images/'):
                url = f"{backend_url}{url}"
            full_urls.append(url)
        return full_urls
    except Exception as e:
        logger.error(f"Failed to get gallery photos: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve gallery photos")

@api_router.get("/reel-photos")
async def get_reel_photos():
    """Get photo reel configuration"""
    try:
        reel = await db.photo_reel.find_one({"type": "main_reel"})
        if not reel:
            # Initialize with default photos if none exist
            default_reel = {
                "type": "main_reel",
                "photos": [
                    "https://customer-assets.emergentagent.com/job_clutterclear-1/artifacts/j1lldodm_20250618_102613.jpg",
                    "https://customer-assets.emergentagent.com/job_text2toss/artifacts/mjas9jtq_image000000%2819%29.jpg",
                    None, None, None, None, None, None, None, None
                ]
            }
            await db.photo_reel.insert_one(default_reel)
            return {"photos": default_reel["photos"]}
        
        # Ensure all URLs are full URLs for consistent display
        backend_url = os.environ.get('BACKEND_URL') or os.environ.get('REACT_APP_BACKEND_URL')
        photos_with_full_urls = []
        for photo in reel["photos"]:
            if photo:
                # Replace old domain names with current one
                if 'text2toss-junk.preview.emergentagent.com' in photo:
                    photo = photo.replace('text2toss-junk.preview.emergentagent.com', backend_url.replace('https://', '').replace('http://', ''))
                    # Ensure it starts with https://
                    if not photo.startswith('http'):
                        photo = f"https://{photo}"
                elif photo.startswith('/static/'):
                    # Convert old /static/ URLs to new API endpoint URLs
                    photo = photo.replace('/static/', '/api/images/')
                    photo = f"{backend_url}{photo}"
                elif photo.startswith('/files/'):
                    # Convert /files/ URLs to API endpoint URLs
                    photo = photo.replace('/files/', '/api/images/')
                    photo = f"{backend_url}{photo}"
                elif photo.startswith('/api/images/'):
                    photo = f"{backend_url}{photo}"
            photos_with_full_urls.append(photo)

        # Legacy reels stored only 6 slots — pad up to 10 so the customer
        # carousel and admin modal always see a consistent length.
        if len(photos_with_full_urls) < 10:
            photos_with_full_urls = photos_with_full_urls + [None] * (10 - len(photos_with_full_urls))
        elif len(photos_with_full_urls) > 10:
            photos_with_full_urls = photos_with_full_urls[:10]

        return {"photos": photos_with_full_urls}
    except Exception as e:
        logger.error(f"Failed to get reel photos: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve reel photos")

@api_router.get("/admin/reel-photos")
async def get_admin_reel_photos():
    """Get photo reel configuration for admin (same as public but with admin auth)"""
    return await get_reel_photos()

@api_router.post("/admin/upload-gallery-photo")
async def upload_gallery_photo(photo: UploadFile = File(...)):
    """Upload a photo to the gallery.

    Hardened to:
      - accept HEIC / HEIF (iPhone default) by registering pillow-heif
      - auto-convert any input format to a web-renderable JPEG
      - cap longest edge at 2000px (so phone photos stay under ~500KB)
      - reject non-image uploads with a clear 400 error
      - log the actual exception so we can debug failures from the client
    """
    try:
        contents = await photo.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty file")

        # Register HEIC/HEIF support (no-op if already registered)
        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
        except Exception:
            pass

        # Decode the image with Pillow — this also validates the file is an image
        from PIL import Image, ImageOps
        from io import BytesIO
        try:
            img = Image.open(BytesIO(contents))
            img = ImageOps.exif_transpose(img)  # respect phone rotation
            img = img.convert("RGB")
        except Exception as exc:
            logger.warning(f"Gallery upload: invalid image ({exc})")
            raise HTTPException(status_code=400, detail="Unsupported or corrupted image file")

        # Resize so longest edge <= 2000px (preserves aspect ratio)
        max_dim = 2000
        if max(img.size) > max_dim:
            img.thumbnail((max_dim, max_dim), Image.LANCZOS)

        # Always store as JPEG so the browser renders it everywhere
        filename = f"gallery_{uuid.uuid4()}.jpg"

        # Encode JPEG into memory; we'll send it to object storage and only
        # touch disk as a fallback. Object storage gives us redeploy-survival
        # for free (the previous on-disk-only approach lost gallery photos
        # on every container restart).
        out_buffer = BytesIO()
        img.save(out_buffer, "JPEG", quality=85, optimize=True)
        jpeg_bytes = out_buffer.getvalue()

        try:
            storage_key = object_storage.storage_path("gallery", filename)
            object_storage.put_bytes(storage_key, jpeg_bytes, "image/jpeg")
        except Exception as exc:
            logger.warning("[storage] gallery upload failed, using disk: %s", exc)
            file_path = f"/app/static/gallery/{filename}"
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "wb") as f:
                f.write(jpeg_bytes)

        backend_url = os.environ.get("BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL", "")
        photo_url = f"{backend_url}/api/images/gallery/{filename}"

        photo_doc = {
            "url": photo_url,
            "filename": filename,
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        await db.gallery_photos.insert_one(photo_doc)
        return {"message": "Photo uploaded successfully", "url": photo_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload gallery photo: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)[:120]}")

@api_router.post("/admin/update-reel-photo")
async def update_reel_photo(request: dict):
    """Update a photo in the reel"""
    try:
        slot_index = request.get("slot_index")
        photo_url = request.get("photo_url")
        
        if slot_index < 0 or slot_index >= 10:
            raise HTTPException(status_code=400, detail="Invalid slot index")
        
        # Get current reel
        reel = await db.photo_reel.find_one({"type": "main_reel"})
        if not reel:
            reel = {"type": "main_reel", "photos": [None] * 10}
        # Pad legacy 6-slot reels up to 10
        if len(reel["photos"]) < 10:
            reel["photos"] = reel["photos"] + [None] * (10 - len(reel["photos"]))
        
        # Update the specific slot
        reel["photos"][slot_index] = photo_url
        
        # Update in database
        await db.photo_reel.update_one(
            {"type": "main_reel"},
            {"$set": {"photos": reel["photos"]}},
            upsert=True
        )
        
        return {"message": f"Photo reel slot {slot_index + 1} updated successfully"}
        
    except Exception as e:
        logger.error(f"Failed to update reel photo: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update photo reel")


class ReelReorderPayload(BaseModel):
    photos: List[Optional[str]]


@api_router.post("/admin/reorder-reel")
async def reorder_reel(payload: ReelReorderPayload):
    """Persist a new order for the 10 reel slots."""
    photos = payload.photos
    if len(photos) != 10:
        raise HTTPException(status_code=400, detail="Reel must have exactly 10 slots")
    await db.photo_reel.update_one(
        {"type": "main_reel"},
        {"$set": {"photos": photos}},
        upsert=True
    )
    return {"message": "Reel order saved", "photos": photos}


class CropArea(BaseModel):
    """Pixel-space crop coordinates (relative to the source image)."""
    x: int
    y: int
    width: int
    height: int


class CropReelPayload(BaseModel):
    slot_index: int = Field(..., ge=0, le=9)
    photo_url: str
    crop: CropArea


@api_router.post("/admin/crop-reel-photo")
async def crop_reel_photo(payload: CropReelPayload):
    """Crop the source photo at `photo_url` according to `payload.crop`,
    save the result to /app/static/gallery/, and update the reel slot."""
    from PIL import Image

    src_url = payload.photo_url
    # Resolve to a local file path when the URL points at our own server
    backend_url = os.environ.get("BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL", "")
    local_path = None
    if backend_url and src_url.startswith(f"{backend_url}/api/images/gallery/"):
        filename = src_url.rsplit("/", 1)[-1]
        local_path = f"/app/static/gallery/{filename}"

    try:
        if local_path and os.path.exists(local_path):
            img = Image.open(local_path).convert("RGB")
        else:
            # Fallback: fetch the remote image
            import urllib.request
            with urllib.request.urlopen(src_url, timeout=15) as resp:
                img = Image.open(BytesIO(resp.read())).convert("RGB")
    except Exception as exc:
        logger.warning(f"crop-reel-photo: cannot read source: {exc}")
        raise HTTPException(status_code=400, detail="Source photo could not be loaded")

    c = payload.crop
    w, h = img.size
    left = max(0, min(c.x, w))
    top = max(0, min(c.y, h))
    right = max(left + 1, min(c.x + c.width, w))
    bottom = max(top + 1, min(c.y + c.height, h))
    cropped = img.crop((left, top, right, bottom))

    # Save the new cropped JPEG
    new_filename = f"gallery_crop_{uuid.uuid4()}.jpg"
    new_path = f"/app/static/gallery/{new_filename}"
    os.makedirs(os.path.dirname(new_path), exist_ok=True)
    cropped.save(new_path, "JPEG", quality=88, optimize=True)
    new_url = f"{backend_url}/api/images/gallery/{new_filename}"

    # Add to gallery DB so it appears in the gallery grid
    await db.gallery_photos.insert_one({
        "url": new_url,
        "filename": new_filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "kind": "crop"
    })

    # Replace the slot in the reel
    reel = await db.photo_reel.find_one({"type": "main_reel"})
    if not reel:
        reel = {"type": "main_reel", "photos": [None] * 10}
    if len(reel["photos"]) < 10:
        reel["photos"] = reel["photos"] + [None] * (10 - len(reel["photos"]))
    reel["photos"][payload.slot_index] = new_url
    await db.photo_reel.update_one(
        {"type": "main_reel"},
        {"$set": {"photos": reel["photos"]}},
        upsert=True
    )
    return {"message": "Cropped & saved", "url": new_url, "slot_index": payload.slot_index}

@api_router.delete("/admin/gallery-photo")
async def remove_gallery_photo(request: dict):
    """Remove a photo from the gallery (DB row + file on disk + reel slot).

    Hardened to remove *older* photos whose stored URL doesn't exactly
    match what the frontend sends back (legacy domains, protocol mismatch,
    path-format drift). Fallback strategy:
      1. Exact URL match (fast path for modern uploads)
      2. Filename-tail match  (last path segment, escapes regex)
      3. Also unpin from any photo_reel slot referencing the deleted URL
    """
    try:
        photo_url = (request.get("photo_url") or "").strip()
        if not photo_url:
            raise HTTPException(status_code=400, detail="photo_url is required")

        # 1) Exact match — fast path
        result = await db.gallery_photos.delete_many({"url": photo_url})
        deleted_urls = [photo_url] if result.deleted_count else []

        # 2) Fallback — match by filename tail (handles legacy domains,
        #    protocol drift, and duplicate rows stored under stale URLs).
        if result.deleted_count == 0:
            import re as _re
            filename = photo_url.rsplit("/", 1)[-1].split("?", 1)[0]
            if filename:
                pattern = f"/{_re.escape(filename)}(?:\\?|$)"
                cursor = db.gallery_photos.find({"url": {"$regex": pattern}})
                async for doc in cursor:
                    deleted_urls.append(doc.get("url"))
                if deleted_urls:
                    await db.gallery_photos.delete_many({"url": {"$in": deleted_urls}})

        if not deleted_urls:
            raise HTTPException(status_code=404, detail="Photo not found")

        # 3) Unpin from reel slots so the trash icon actually clears it
        #    from the customer-facing carousel too.
        reel = await db.photo_reel.find_one({"type": "main_reel"})
        if reel and reel.get("photos"):
            filename = photo_url.rsplit("/", 1)[-1].split("?", 1)[0]
            def _matches(slot: Optional[str]) -> bool:
                if not slot:
                    return False
                if slot in deleted_urls:
                    return True
                # filename-tail comparison for cross-domain drift
                return bool(filename) and slot.rsplit("/", 1)[-1].split("?", 1)[0] == filename
            new_photos = [None if _matches(p) else p for p in reel["photos"]]
            if new_photos != reel["photos"]:
                await db.photo_reel.update_one(
                    {"type": "main_reel"},
                    {"$set": {"photos": new_photos}}
                )

        # 4) Best-effort file cleanup on disk (only for local uploads)
        for url in deleted_urls:
            file_path = _resolve_gallery_file_path(url)
            if file_path:
                _delete_disk_file_silently(file_path, url)

        return {"message": "Photo removed successfully", "removed_count": len(deleted_urls)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove photo: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to remove photo")


def _resolve_gallery_file_path(photo_url: str) -> Optional[str]:
    """Map a photo URL (modern or legacy format) to an on-disk file path.

    Returns None when the URL doesn't match any known pattern.
    """
    if "/api/images/gallery/" in photo_url:
        return "/app/static/gallery/" + photo_url.rsplit("/", 1)[-1]
    if photo_url.startswith("/static/gallery/"):
        return f"/app{photo_url}"
    if photo_url.startswith("/files/gallery/"):
        return f"/app/static{photo_url.replace('/files', '')}"
    if "/files/gallery/" in photo_url:
        return "/app/static/gallery/" + photo_url.rsplit("/", 1)[-1]
    return None


def _delete_disk_file_silently(file_path: str, photo_url: str) -> None:
    """Best-effort unlink — never raises; only logs on failure."""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as file_error:
        logger.warning(f"Failed to remove file {photo_url}: {file_error}")

# Image serving endpoint (due to Kubernetes routing all non-/api requests to frontend)
@api_router.get("/images/{folder}/{filename}")
async def serve_image(folder: str, filename: str):
    """Serve images through API endpoint due to Kubernetes routing.

    Resolution order:
      1. Object storage at ``text2toss/{folder}/{filename}`` (current path
         for any upload made after May 2026).
      2. Local disk at ``/app/static/{folder}/{filename}`` (legacy uploads
         that pre-date the storage migration).

    If neither has the file we return 404.
    """
    import mimetypes

    storage_key = object_storage.storage_path(folder, filename)

    # Try object storage first.
    try:
        data, content_type = object_storage.get_bytes(storage_key)
        if not content_type or content_type == "application/octet-stream":
            content_type, _ = mimetypes.guess_type(filename)
            content_type = content_type or "application/octet-stream"
        return Response(
            content=data,
            media_type=content_type,
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "public, max-age=86400",
            },
        )
    except requests.HTTPError as exc:
        # 404 from storage is fine — fall through to disk. Anything else
        # we want to surface in the logs but still try disk so a transient
        # storage hiccup doesn't take down the gallery.
        if exc.response is not None and exc.response.status_code != 404:
            logger.warning("[storage] get %s failed: %s", storage_key, exc)
    except Exception as exc:
        logger.warning("[storage] get %s errored: %s", storage_key, exc)

    # Disk fallback — legacy files only.
    file_path = f"/app/static/{folder}/{filename}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Image not found")

    content_type, _ = mimetypes.guess_type(file_path)
    if not content_type:
        content_type = "application/octet-stream"
    return FileResponse(
        file_path,
        media_type=content_type,
        headers={"Content-Disposition": "inline"},
    )

# Customer Price Approval Endpoints
@api_router.get("/customer-approval/{token}")
async def get_customer_approval_details(token: str):
    """Get details for customer price approval"""
    try:
        booking = await db.bookings.find_one({"customer_approval_token": token})
        
        if not booking:
            raise HTTPException(status_code=404, detail="Approval request not found or expired")
        
        if not booking.get("requires_customer_approval"):
            raise HTTPException(status_code=400, detail="No approval required for this booking")
        
        # Get quote details and clean ObjectIds
        quote = await db.quotes.find_one({"id": booking["quote_id"]})
        if quote and "_id" in quote:
            del quote["_id"]
        
        # Clean booking ObjectId
        if "_id" in booking:
            del booking["_id"]
        
        return {
            "booking_id": booking["id"],
            "original_price": booking.get("original_price", 0),
            "adjusted_price": booking.get("adjusted_price", 0),
            "price_increase": booking.get("adjusted_price", 0) - booking.get("original_price", 0),
            "adjustment_reason": booking.get("price_adjustment_reason", ""),
            "pickup_date": booking["pickup_date"],
            "pickup_time": booking["pickup_time"],
            "address": booking["address"],
            "quote_details": quote,
            "business_name": "Text2toss Professional Junk Removal"
        }
    except Exception as e:
        logger.error(f"Error getting approval details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get approval details")

@api_router.post("/customer-approval/{token}")
async def submit_customer_approval(token: str, approval: CustomerPriceApproval):
    """Submit customer approval for price adjustment"""
    try:
        booking = await db.bookings.find_one({"customer_approval_token": token})
        
        if not booking:
            raise HTTPException(status_code=404, detail="Approval request not found or expired")
        
        if not booking.get("requires_customer_approval"):
            raise HTTPException(status_code=400, detail="No approval required for this booking")
        
        # Update booking based on customer decision
        update_data = {
            "customer_approved_at": datetime.now(timezone.utc),
            "requires_customer_approval": False,
            "customer_approval_token": None  # Clear token after use
        }
        
        if approval.approved:
            # Customer approved the price increase
            update_data["status"] = "scheduled"
            
            # Send confirmation SMS
            message = f"""✅ Text2toss: Price Approved
            
Thank you for approving the updated price of ${booking.get('adjusted_price', 0):.2f}.

Your junk removal is confirmed for {booking['pickup_date']} during {booking['pickup_time']}.

Payment instructions will be sent shortly. Job ID: {booking['id'][:8]}"""
            
        else:
            # Customer declined the price increase
            update_data["status"] = "cancelled"
            
            # Send cancellation SMS
            message = """❌ Text2toss: Booking Cancelled
            
Your booking has been cancelled due to price adjustment decline.

If you'd like to reschedule with the original pricing, please contact us at (928) 853-9619.

We appreciate your understanding."""
        
        # Update booking
        await db.bookings.update_one(
            {"customer_approval_token": token},
            {"$set": update_data}
        )
        
        # Send SMS notification
        try:
            await send_sms(booking["phone"], message)
        except Exception as sms_error:
            logger.error(f"Failed to send approval confirmation SMS: {str(sms_error)}")
        
        return {
            "success": True,
            "approved": approval.approved,
            "message": "Thank you for your response. You will receive an SMS confirmation shortly." if approval.approved 
                      else "Your booking has been cancelled. Thank you for your time."
        }
        
    except Exception as e:
        logger.error(f"Error processing customer approval: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to process approval")

@api_router.get("/admin/export-job-contacts")
async def export_job_contacts():
    """
    Export all job contacts to CSV file
    Includes customer name, email, phone, job details, booking and payment status
    """
    try:
        # Fetch all bookings (limit to 10000 for performance)
        bookings_cursor = db.bookings.find({})
        bookings = await bookings_cursor.to_list(length=10000)
        
        if not bookings:
            raise HTTPException(status_code=404, detail="No bookings found")
        
        # OPTIMIZATION: Batch fetch all quotes to avoid N+1 query problem
        quote_ids = [booking['quote_id'] for booking in bookings if booking.get('quote_id')]
        quotes = []
        if quote_ids:
            quotes = await db.price_quotes.find({"id": {"$in": quote_ids}}).to_list(length=10000)
        
        # Create quote lookup dictionary for O(1) access
        quote_dict = {quote['id']: quote for quote in quotes}
        
        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow([
            'Booking ID',
            'Customer Name',
            'Email',
            'Phone',
            'Pickup Date',
            'Pickup Time',
            'Address',
            'Job Description',
            'Total Price',
            'Payment Status',
            'Payment Method',
            'Booking Status',
            'Special Instructions',
            'Created At'
        ])
        
        # Write booking data
        for booking in bookings:
            # Get quote from pre-fetched dictionary (no database query)
            quote = quote_dict.get(booking.get('quote_id'))
            
            # Extract job description from quote
            job_description = ""
            if quote and quote.get('items'):
                items_list = [f"{item.get('name', 'Unknown')} ({item.get('size', 'N/A')})" 
                             for item in quote['items']]
                job_description = ", ".join(items_list)
            elif quote and quote.get('description'):
                job_description = quote['description']
            
            # Extract customer name from special_instructions or use 'Customer'
            customer_name = booking.get('special_instructions', 'Customer')
            if len(customer_name) > 50:  # If too long, it's probably not a name
                customer_name = "Customer"
            
            # Format pickup date
            pickup_date = booking.get('pickup_date')
            if isinstance(pickup_date, datetime):
                pickup_date_str = pickup_date.strftime('%Y-%m-%d')
            elif isinstance(pickup_date, str):
                pickup_date_str = pickup_date
            else:
                pickup_date_str = "N/A"
            
            # Format created_at
            created_at = booking.get('created_at')
            if isinstance(created_at, datetime):
                created_at_str = created_at.strftime('%Y-%m-%d %H:%M:%S')
            elif isinstance(created_at, str):
                created_at_str = created_at
            else:
                created_at_str = "N/A"
            
            # Get total price from quote
            total_price = quote.get('total_price', 0) if quote else 0
            
            writer.writerow([
                booking.get('id', ''),
                customer_name,
                booking.get('email', 'N/A'),
                booking.get('phone', 'N/A'),
                pickup_date_str,
                booking.get('pickup_time', 'N/A'),
                booking.get('address', 'N/A'),
                job_description,
                f"${total_price:.2f}",
                booking.get('payment_status', 'pending'),
                booking.get('payment_method', 'venmo'),
                booking.get('status', 'scheduled'),
                booking.get('special_instructions', 'N/A'),
                created_at_str
            ])
        
        # Prepare file response
        output.seek(0)
        
        # Generate filename with timestamp
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        filename = f"job_contacts_{timestamp}.csv"
        
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Error exporting job contacts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to export job contacts: {str(e)}")

# Health check endpoint on api_router (accessible via /api/health)
@api_router.get("/health")
@api_router.get("/healthz")
async def health_check():
    """Health check endpoint for Kubernetes liveness and readiness probes"""
    try:
        await db.command("ping")
        return {
            "status": "healthy",
            "database": "connected",
            "service": "text2toss-api"
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e)
            }
        )

# ===================== Marketing share tracking & settings =====================

class MarketingShareEvent(BaseModel):
    channel: str = Field(..., description="One of: native, facebook, copy, download")


class MarketingSettings(BaseModel):
    deal_text: str = Field("", max_length=140)
    deal_active: bool = False
    reminder_enabled: bool = False
    reminder_hour: int = Field(10, ge=0, le=23)
    timezone: str = Field("UTC", max_length=64)
    # Priority Pickup configuration (overrides hardcoded defaults)
    priority_fees: Optional[Dict[str, float]] = None
    priority_max_per_day: int = Field(MAX_PRIORITY_PER_DAY, ge=0, le=20)


@api_router.post("/admin/marketing/share-event")
async def log_marketing_share(event: MarketingShareEvent):
    """Record a single share/copy/download event from the QR modal."""
    allowed = {"native", "facebook", "copy", "download"}
    if event.channel not in allowed:
        raise HTTPException(status_code=400, detail="Invalid channel")
    await db.marketing_shares.insert_one({
        "id": str(uuid.uuid4()),
        "channel": event.channel,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"success": True}


@api_router.get("/admin/marketing/stats")
async def get_marketing_stats():
    """Return share-event totals: this week, all time, by channel."""
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=7)).isoformat()
    week_count = await db.marketing_shares.count_documents(
        {"created_at": {"$gte": week_start}}
    )
    total_count = await db.marketing_shares.count_documents({})

    pipeline = [
        {"$group": {"_id": "$channel", "count": {"$sum": 1}}}
    ]
    by_channel = {}
    async for row in db.marketing_shares.aggregate(pipeline):
        by_channel[row["_id"]] = row["count"]

    return {
        "this_week": week_count,
        "total": total_count,
        "by_channel": by_channel
    }


@api_router.get("/admin/marketing/settings")
async def get_marketing_settings():
    """Get the current marketing settings (deal text + reminder + priority config)."""
    doc = await db.marketing_settings.find_one(
        {"_id": "singleton"}, {"_id": 0}
    )
    if not doc:
        return MarketingSettings(priority_fees=dict(PRIORITY_FEES)).dict()
    # Strip any leftover Mongo fields and ensure defaults
    return {
        "deal_text": doc.get("deal_text", ""),
        "deal_active": bool(doc.get("deal_active", False)),
        "reminder_enabled": bool(doc.get("reminder_enabled", False)),
        "reminder_hour": int(doc.get("reminder_hour", 10)),
        "timezone": doc.get("timezone") or "UTC",
        "priority_fees": _coerce_priority_fees(doc.get("priority_fees")),
        "priority_max_per_day": int(doc.get("priority_max_per_day", MAX_PRIORITY_PER_DAY)),
    }


@api_router.post("/admin/marketing/settings")
async def save_marketing_settings(settings: MarketingSettings):
    """Save marketing settings (upsert singleton). Invalidates priority cache."""
    payload = settings.dict()
    # Normalize fees so saved doc reflects validated values
    payload["priority_fees"] = _coerce_priority_fees(payload.get("priority_fees"))
    await db.marketing_settings.update_one(
        {"_id": "singleton"},
        {"$set": payload},
        upsert=True
    )
    _invalidate_priority_cache()
    return {"success": True, **payload}


# ===================== Web Push (Service Worker) =====================
# True background reminders: the admin browser registers a Service Worker, the
# SW subscribes to the Push API using our VAPID public key, and we POST the
# subscription to /admin/push/subscribe. A 60-second background scheduler
# checks the saved reminder_hour and sends pushes once per day.

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:text2toss@gmail.com")


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionPayload(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys


@api_router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """Public endpoint — frontend needs this to subscribe."""
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="VAPID keys not configured")
    return {"publicKey": VAPID_PUBLIC_KEY}


@api_router.post("/admin/push/subscribe")
async def subscribe_push(sub: PushSubscriptionPayload):
    """Save (or replace) a push subscription for the admin browser."""
    doc = {
        "endpoint": sub.endpoint,
        "keys": sub.keys.dict(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.push_subscriptions.update_one(
        {"endpoint": sub.endpoint},
        {"$set": doc},
        upsert=True
    )
    return {"success": True}


@api_router.post("/admin/push/unsubscribe")
async def unsubscribe_push(sub: PushSubscriptionPayload):
    """Remove a push subscription."""
    result = await db.push_subscriptions.delete_one({"endpoint": sub.endpoint})
    return {"success": True, "deleted": result.deleted_count}


def _send_webpush(subscription_doc, title, body, url):
    """Synchronous helper used inside the scheduler thread."""
    from pywebpush import webpush, WebPushException
    try:
        payload = json.dumps({"title": title, "body": body, "url": url})
        webpush(
            subscription_info={
                "endpoint": subscription_doc["endpoint"],
                "keys": subscription_doc["keys"]
            },
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUBJECT}
        )
        return True, None
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        return False, status
    except Exception as exc:
        # Catches malformed subscription keys, network errors, etc.
        logger.warning(f"[push] send failed: {exc}")
        return False, None


@api_router.post("/admin/push/send-test")
async def send_test_push():
    """Send an immediate test push to all stored subscriptions."""
    if not VAPID_PRIVATE_KEY:
        raise HTTPException(status_code=503, detail="VAPID keys not configured")
    subs = await db.push_subscriptions.find({}, {"_id": 0}).to_list(50)
    sent = 0
    failed = 0
    expired_endpoints = []
    for sub in subs:
        ok, status = _send_webpush(
            sub,
            "Text2Toss test push 📲",
            "If you see this, background reminders are working.",
            "/admin"
        )
        if ok:
            sent += 1
        else:
            failed += 1
            if status in (404, 410):
                expired_endpoints.append(sub["endpoint"])
    if expired_endpoints:
        await db.push_subscriptions.delete_many(
            {"endpoint": {"$in": expired_endpoints}}
        )
    # Log test result for the health widget
    await db.push_reminder_log.insert_one({
        "kind": "test",
        "sent": sent,
        "failed": failed,
        "subscriptions": len(subs),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return {"sent": sent, "failed": failed, "subscriptions": len(subs)}


@api_router.get("/admin/push/health")
async def push_health():
    """Return delivery health info for the marketing/push widget."""
    sub_count = await db.push_subscriptions.count_documents({})
    last = await db.push_reminder_log.find_one(
        {}, {"_id": 0}, sort=[("created_at", -1)]
    )
    last_daily = await db.push_reminder_log.find_one(
        {"kind": {"$ne": "test"}}, {"_id": 0}, sort=[("created_at", -1)]
    )
    return {
        "subscriptions": sub_count,
        "last_event": last,        # most recent test or daily reminder
        "last_daily": last_daily   # most recent scheduled daily reminder only
    }


async def _send_daily_reminder():
    """Background job: every minute, check the saved reminder_hour and send
    a push if we haven't already sent one today (in the saved timezone)."""
    try:
        settings = await db.marketing_settings.find_one(
            {"_id": "singleton"}, {"_id": 0}
        )
        if not settings or not settings.get("reminder_enabled"):
            return

        # Resolve the user's timezone (falls back to UTC if invalid)
        tz_name = settings.get("timezone") or "UTC"
        try:
            from zoneinfo import ZoneInfo
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = timezone.utc
        now_local = datetime.now(tz)

        target_hour = int(settings.get("reminder_hour", 10))
        if now_local.hour != target_hour:
            return

        # Idempotency: only one push per day per admin (in local-time date)
        today_key = now_local.strftime("%Y-%m-%d")
        marker = await db.push_reminder_log.find_one({"date": today_key})
        if marker:
            return

        subs = await db.push_subscriptions.find({}, {"_id": 0}).to_list(50)
        if not subs:
            return

        deal_text = settings.get("deal_text") if settings.get("deal_active") else ""
        body = (deal_text + " — Tap to share today's QR.") if deal_text \
            else "Tap to open the QR & post to your socials."

        expired_endpoints = []
        sent = 0
        for sub in subs:
            ok, status = _send_webpush(
                sub, "Text2Toss daily reminder 📣", body, "/admin"
            )
            if ok:
                sent += 1
            elif status in (404, 410):
                expired_endpoints.append(sub["endpoint"])

        if expired_endpoints:
            await db.push_subscriptions.delete_many(
                {"endpoint": {"$in": expired_endpoints}}
            )
        await db.push_reminder_log.insert_one({
            "date": today_key,
            "sent": sent,
            "tz": tz_name,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"[push] daily reminder sent to {sent} device(s) at {target_hour}:00 {tz_name}")
    except Exception as exc:
        logger.error(f"[push] _send_daily_reminder error: {exc}")


@app.on_event("startup")
async def _start_push_scheduler():
    """Start the background scheduler that checks for the daily reminder."""
    if not VAPID_PRIVATE_KEY:
        logger.warning("[push] VAPID keys missing — scheduler disabled")
        return
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    sched = AsyncIOScheduler(timezone="UTC")
    sched.add_job(_send_daily_reminder, "interval", minutes=1,
                  id="t2t_daily_reminder", replace_existing=True)
    # Review-request drip: scans completed bookings every 30 min and emails
    # those finished ~24h ago. Idempotent (per-booking flag in DB).
    sched.add_job(_send_review_requests, "interval", minutes=30,
                  id="t2t_review_requests", replace_existing=True)
    sched.start()
    app.state.push_scheduler = sched
    logger.info("[push] daily-reminder scheduler started")
    logger.info("[review] review-request scheduler started (every 30m)")


async def _send_review_requests():
    """Background job: send a review-request email to customers ~24h after
    their booking was marked `completed`. Idempotent — marks each booking
    with `review_request_sent_at` so we never email twice.
    """
    try:
        now = datetime.now(timezone.utc)
        # 23h ≤ completed_at ≤ 25h ago — 2h window protects against missed runs.
        upper = (now - timedelta(hours=23)).isoformat()
        lower = (now - timedelta(hours=25)).isoformat()
        cursor = db.bookings.find({
            "status": "completed",
            "completed_at": {"$gte": lower, "$lte": upper},
            "review_request_sent_at": {"$exists": False},
            "email": {"$exists": True, "$nin": [None, ""]},
        })
        sent = 0
        async for b in cursor:
            email = (b.get("email") or "").strip()
            if not email:
                continue
            base = (
                os.environ.get("PUBLIC_SITE_URL")
                or os.environ.get("BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
                or "https://text2toss.com"
            ).rstrip("/")
            review_link = f"{base}/?leave_review={b['id']}"
            try:
                completed_at = b.get("completed_at")
                completed_str = None
                if completed_at:
                    try:
                        completed_str = datetime.fromisoformat(
                            completed_at.replace("Z", "+00:00") if isinstance(completed_at, str) else completed_at.isoformat()
                        ).strftime("%B %d, %Y")
                    except Exception:
                        completed_str = None
                html = email_templates.review_request_email(
                    customer_name=b.get("name") or "Friend",
                    booking_id=b["id"],
                    review_link=review_link,
                    completed_date=completed_str,
                )
                result = await send_email(
                    to_email=email,
                    subject="How did we do? Quick 30-second review",
                    html_content=html,
                )
                if result.get("status") in ("sent", "disabled"):
                    await db.bookings.update_one(
                        {"id": b["id"]},
                        {"$set": {"review_request_sent_at": now.isoformat()}},
                    )
                    sent += 1
            except Exception as ex:
                logger.warning(f"[review] failed to send for {b.get('id')}: {ex}")
        if sent:
            logger.info(f"[review] sent {sent} review-request email(s)")
    except Exception as exc:
        logger.error(f"[review] _send_review_requests error: {exc}")


@app.on_event("startup")
async def _init_object_storage():
    """Acquire the object-storage session key once at startup. Failures here
    are non-fatal — uploads will fall back to disk and log a warning, but the
    rest of the API stays online."""
    try:
        object_storage.init_storage()
    except Exception as exc:
        logger.warning("[storage] init failed at startup (%s) — uploads will fall back to disk", exc)


@app.on_event("shutdown")
async def _stop_push_scheduler():
    sched = getattr(app.state, "push_scheduler", None)
    if sched:
        sched.shutdown(wait=False)


# === Reviews / Social-Proof ============================================
# Admin-curated customer reviews shown on the landing page.

class Review(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_name: str
    location: Optional[str] = None  # e.g. "Flagstaff, AZ"
    rating: int = 5                  # 1..5
    body: str
    is_published: bool = True
    display_order: int = 0           # lower = shown first
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReviewCreate(BaseModel):
    customer_name: str
    location: Optional[str] = None
    rating: int = 5
    body: str
    is_published: bool = True
    display_order: int = 0


class ReviewSubmission(BaseModel):
    """Public-facing submission — auto-flagged as pending admin approval."""
    customer_name: str
    location: Optional[str] = None
    rating: int = 5
    body: str
    email: Optional[str] = None  # captured for admin follow-up; never shown publicly


class ReviewUpdate(BaseModel):
    customer_name: Optional[str] = None
    location: Optional[str] = None
    rating: Optional[int] = None
    body: Optional[str] = None
    is_published: Optional[bool] = None
    display_order: Optional[int] = None


def _serialize_review(doc: dict) -> dict:
    doc.pop("_id", None)
    if isinstance(doc.get("created_at"), datetime):
        doc["created_at"] = doc["created_at"].isoformat()
    return doc


def _serialize_review_public(doc: dict) -> dict:
    """Strips admin-only fields before exposing to public callers."""
    cleaned = _serialize_review(dict(doc))
    cleaned.pop("submitted_email", None)
    cleaned.pop("submitted_ip", None)
    cleaned.pop("spam_flags", None)
    return cleaned


# Profanity / spam filter wordlist — common English slurs and obscenities.
# Curated to catch obvious abuse without false-flagging normal language
# ("ass" deliberately omitted because of words like "class"/"pass"; we use
# whole-word matching below).
_PROFANITY_PATTERNS = [
    r"\bfuck\w*\b", r"\bshit\w*\b", r"\bbitch\w*\b", r"\bcunt\w*\b",
    r"\bdick\w*\b", r"\bpiss\w*\b", r"\bcock\w*\b", r"\bpussy\w*\b",
    r"\basshole\w*\b", r"\bbastard\w*\b", r"\bdamn\b", r"\bcrap\b",
    r"\bnigg\w*\b", r"\bfag\w*\b", r"\bretard\w*\b", r"\bwhore\w*\b",
    r"\bslut\w*\b", r"\btwat\b", r"\bwank\w*\b",
]
_PROFANITY_REGEX = re.compile("|".join(_PROFANITY_PATTERNS), re.IGNORECASE)

# Common spam tells: viagra/casino/loan promos + obvious link-stuffing.
_SPAM_KEYWORD_REGEX = re.compile(
    r"\b(viagra|cialis|casino|porn|crypto[\-\s]?(?:invest|bot|signal)|"
    r"forex|loan|payday|seo[\-\s]services|backlink|escort|onlyfans|"
    r"telegram[\-\s]?\@|whats?app[\-\s]?\+?\d)",
    re.IGNORECASE,
)
_URL_REGEX = re.compile(r"https?://|www\.|\.(com|net|org|io|biz|ru|xyz)\b", re.IGNORECASE)


def _classify_review_submission(name: str, body: str) -> tuple[bool, str, list[str]]:
    """Returns (is_blocked, customer_facing_reason, flags).

    Blocked submissions are rejected outright with a generic message (so we
    don't telegraph our filter rules to spammers). Flagged-but-not-blocked
    submissions go through with markers for admin review.
    """
    flags: list[str] = []
    combined = f"{name}\n{body}"

    # Hard block: obvious profanity in name OR body
    if _PROFANITY_REGEX.search(combined):
        return True, "Please keep your review respectful — language was flagged.", ["profanity"]

    # Hard block: spam keywords (promos / illegal-content tells)
    if _SPAM_KEYWORD_REGEX.search(combined):
        return True, "Your review couldn't be posted — please contact us directly.", ["spam_keyword"]

    # Hard block: more than 1 URL/link
    urls_found = _URL_REGEX.findall(body)
    if len(urls_found) >= 2:
        return True, "Reviews can't include links.", ["multi_links"]
    if urls_found:
        flags.append("contains_link")

    # Soft flag: > 60% uppercase (shouting / spam)
    letters = [c for c in body if c.isalpha()]
    if len(letters) >= 20:
        upper_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
        if upper_ratio > 0.6:
            flags.append("excessive_caps")

    # Soft flag: same char repeated 8+ times ("aaaaaaaa", "!!!!!!!!!")
    if re.search(r"(.)\1{7,}", body):
        flags.append("char_spam")

    # Soft flag: extremely short combined with all-caps name (typical bot)
    if len(body) < 25 and name.isupper():
        flags.append("low_quality")

    return False, "", flags


@api_router.post("/reviews/submit")
async def submit_review(body: ReviewSubmission, request: Request):
    """Public — customer submits a testimonial; queued for admin approval.

    Guards (in order):
      1. rating 1..5, name+body present, length 10..1000
      2. Profanity + spam keyword + multi-link block (rejects with generic msg)
      3. Per-IP rate limit: max 3 submissions / hour
      4. Insert with `is_published=False`; soft flags stored in `spam_flags`
    """
    if body.rating < 1 or body.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1–5")
    cleaned_name = (body.customer_name or "").strip()
    cleaned_body = (body.body or "").strip()
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="Please enter your name")
    if len(cleaned_body) < 10:
        raise HTTPException(status_code=400, detail="Please write at least 10 characters")
    if len(cleaned_body) > 1000:
        raise HTTPException(status_code=400, detail="Review is too long (max 1000 chars)")

    # Profanity / spam classification
    blocked, reason, flags = _classify_review_submission(cleaned_name, cleaned_body)
    if blocked:
        logger.info(f"Review submission blocked: flags={flags}, ip={request.client.host if request.client else None}")
        raise HTTPException(status_code=400, detail=reason)

    # Real client IP (we sit behind a K8s ingress — request.client.host is the proxy)
    fwd = request.headers.get("x-forwarded-for", "")
    submitter_ip = (
        fwd.split(",")[0].strip() if fwd
        else (request.client.host if request.client else None)
    )

    # Per-IP rate limit (max 3 submissions per hour) to slow flood attacks
    if submitter_ip:
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        recent_count = await db.reviews.count_documents({
            "submitted_ip": submitter_ip,
            "created_at": {"$gte": one_hour_ago},
        })
        if recent_count >= 3:
            raise HTTPException(
                status_code=429,
                detail="You've submitted a few reviews already — please try again later.",
            )

    review = Review(
        customer_name=cleaned_name[:80],
        location=(body.location or "").strip()[:80] or None,
        rating=body.rating,
        body=cleaned_body,
        is_published=False,  # admin must approve
        display_order=999,
    )
    doc = review.dict()
    # Stash submitter metadata for admin reference (not exposed publicly)
    doc["submitted_email"] = (body.email or "").strip()[:120] or None
    doc["submitted_ip"] = submitter_ip
    if flags:
        doc["spam_flags"] = flags
    await db.reviews.insert_one(doc)
    return {"success": True, "message": "Thanks! Your review is pending admin approval."}


@api_router.get("/reviews")
async def public_reviews():
    """Public — used by the landing page Reviews section."""
    cursor = db.reviews.find({"is_published": True}).sort([("display_order", 1), ("created_at", -1)])
    return [_serialize_review_public(r) async for r in cursor]


@api_router.get("/bookings/{booking_id}/review-prefill")
async def booking_review_prefill(booking_id: str):
    """Public — used by the 1-tap review email link to prefill the form
    with the customer's first name. Booking UUIDs are unguessable; we expose
    only the first name + city (no email, address, or price)."""
    doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "name": 1, "address": 1})
    if not doc:
        # 200 (not 404) so we don't telegraph which IDs are valid
        return {"first_name": "", "location": ""}
    full = (doc.get("name") or "").strip()
    first = full.split()[0] if full else ""
    addr = (doc.get("address") or "").strip()
    # Best-effort city extraction: take chunk after the first comma, trim ZIP
    location = ""
    if "," in addr:
        parts = [p.strip() for p in addr.split(",")][1:]
        if parts:
            # "Flagstaff, AZ 86001" → "Flagstaff, AZ"
            tail = parts[0]
            if len(parts) > 1:
                tail = f"{parts[0]}, {parts[1].split()[0] if parts[1].split() else parts[1]}"
            location = tail
    return {"first_name": first[:40], "location": location[:80]}


@api_router.get("/admin/reviews")
async def admin_list_reviews():
    """Admin — every review, published or not."""
    cursor = db.reviews.find({}).sort([("display_order", 1), ("created_at", -1)])
    return [_serialize_review(r) async for r in cursor]


@api_router.post("/admin/reviews", response_model=Review)
async def admin_create_review(body: ReviewCreate):
    if body.rating < 1 or body.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1–5")
    review = Review(**body.dict())
    await db.reviews.insert_one(review.dict())
    return review


@api_router.patch("/admin/reviews/{review_id}")
async def admin_update_review(review_id: str, body: ReviewUpdate):
    patch = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if "rating" in patch and (patch["rating"] < 1 or patch["rating"] > 5):
        raise HTTPException(status_code=400, detail="Rating must be 1–5")
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.reviews.update_one({"id": review_id}, {"$set": patch})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Review not found")
    doc = await db.reviews.find_one({"id": review_id})
    return _serialize_review(doc) if doc else {"success": True}


@api_router.delete("/admin/reviews/{review_id}")
async def admin_delete_review(review_id: str):
    result = await db.reviews.delete_one({"id": review_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Review not found")
    return {"success": True}


@app.on_event("startup")
async def seed_initial_reviews():
    """Seed 3 starter reviews if the collection is empty so the landing page
    isn't blank for new installs. Admin can edit/delete them later."""
    try:
        if await db.reviews.count_documents({}) > 0:
            return
        starter = [
            Review(
                customer_name="Sarah M.",
                location="Flagstaff, AZ",
                rating=5,
                body="Snapped a pic of my garage clutter, got a quote in seconds, and they showed up the next morning. Wildly easy.",
                display_order=1,
            ),
            Review(
                customer_name="Mike T.",
                location="Sedona, AZ",
                rating=5,
                body="Cleaned out my parents' old furniture in one trip. Friendly crew, fair price, no surprises. Will use again.",
                display_order=2,
            ),
            Review(
                customer_name="Jenna R.",
                location="Williams, AZ",
                rating=5,
                body="Booked Tuesday, picked up Wednesday. Paid in Venmo, done. This is how every service business should work.",
                display_order=3,
            ),
        ]
        await db.reviews.insert_many([r.dict() for r in starter])
        logger.info("✅ Seeded 3 starter reviews")
    except Exception as e:
        logger.warning(f"Review seed skipped: {e}")


# Include the router in the main app
app.include_router(api_router)

# Admin auth middleware — protects all /api/admin/* routes via httpOnly cookie
ADMIN_AUTH_EXEMPT = {"/api/admin/login", "/api/admin/init"}

@app.middleware("http")
async def admin_auth_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/admin/") and path not in ADMIN_AUTH_EXEMPT:
        admin_session = request.cookies.get("admin_session")
        if not admin_session:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
        try:
            payload = jwt.decode(admin_session, SECRET_KEY, algorithms=[ALGORITHM])
            if not payload.get("admin"):
                return JSONResponse(status_code=401, content={"detail": "Invalid admin token"})
            request.state.admin = payload
        except jwt.PyJWTError:
            return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})
    response = await call_next(request)
    return response

# Also register at root level for direct access
@app.get("/health")
@app.get("/healthz")
async def root_health_check():
    """Root health check for direct access"""
    try:
        await db.command("ping")
        return {"status": "healthy", "database": "connected", "service": "text2toss-api"}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "error": str(e)})

# CORS:
# Browsers REJECT `Access-Control-Allow-Origin: *` whenever the request
# carries credentials (cookies, Authorization). Admin auth uses an httpOnly
# cookie, so we MUST echo a specific origin back. We use `allow_origin_regex`
# (matches any origin) which makes Starlette echo the caller's Origin header
# instead of returning the literal "*". This keeps the API public while still
# being credential-safe for admin requests from custom domains
# (e.g. text2toss.com) and any preview/staging URLs.
_cors_env = os.environ.get('CORS_ORIGINS', '*').strip()
_cors_kwargs = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if _cors_env in ('', '*'):
    _cors_kwargs["allow_origin_regex"] = ".*"
    _cors_kwargs["allow_origins"] = []
else:
    _cors_kwargs["allow_origins"] = [o.strip() for o in _cors_env.split(',') if o.strip()]

app.add_middleware(CORSMiddleware, **_cors_kwargs)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()