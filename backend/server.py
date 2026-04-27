from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from dotenv import load_dotenv
import csv
import io
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, validator, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, date, time, timedelta
import hashlib
import jwt
from passlib.context import CryptContext
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType
import json
import secrets
import re
import base64
import aiofiles
import shutil
from twilio.rest import Client

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
    """Get Twilio client with fallback for missing credentials"""
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    
    if not account_sid or not auth_token or account_sid == 'your_twilio_account_sid':
        return None
    
    return Client(account_sid, auth_token)

async def send_sms(to_phone: str, message: str, image_url: str = None):
    """Send SMS with optional image attachment"""
    client = get_twilio_client()
    
    if not client:
        logging.warning("Twilio not configured - SMS simulation mode")
        print("\n--- SMS SIMULATION ---")
        print(f"To: {to_phone}")
        print(f"Message: {message}")
        if image_url:
            print(f"Photo URL: {image_url}")
            # Test if image URL is accessible
            try:
                import requests
                response = requests.head(image_url, timeout=5)
                if response.status_code == 200:
                    print(f"✅ Photo URL is accessible (Status: {response.status_code})")
                else:
                    print(f"❌ Photo URL returned status: {response.status_code}")
            except Exception as e:
                print(f"❌ Photo URL test failed: {str(e)}")
        print("--- END SIMULATION ---\n")
        
        return {
            "status": "simulated", 
            "message": "SMS simulated (Twilio not configured)",
            "to_phone": to_phone,
            "has_photo": bool(image_url),
            "photo_url": image_url if image_url else None
        }
    
    try:
        twilio_phone = os.environ.get('TWILIO_PHONE_NUMBER', '+1234567890')
        
        message_params = {
            'body': message,
            'from_': twilio_phone,
            'to': to_phone
        }
        
        # Add image if provided
        if image_url:
            message_params['media_url'] = [image_url]
        
        message_obj = client.messages.create(**message_params)
        
        return {
            "status": "sent",
            "message_sid": message_obj.sid,
            "message": "SMS sent successfully",
            "to_phone": to_phone,
            "has_photo": bool(image_url)
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
        )
        
        logging.info(f"Email sent successfully to {to_email}: {subject}")
        return {"status": "sent", "message": "Email sent successfully", "to_email": to_email}
        
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")
        return {"status": "error", "message": f"Email failed: {str(e)}"}

def create_booking_confirmation_email(booking_data: dict, quote_data: dict) -> str:
    """Create HTML email for booking confirmation"""
    pickup_date = booking_data.get('pickup_date', 'TBD')
    if isinstance(pickup_date, str):
        try:
            pickup_date = datetime.fromisoformat(pickup_date).strftime('%B %d, %Y')
        except (ValueError, TypeError):
            pass
    
    return f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .booking-details {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }}
            .detail-row {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }}
            .detail-label {{ font-weight: bold; color: #6b7280; }}
            .detail-value {{ color: #111827; }}
            .button {{ display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
            .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Booking Confirmed!</h1>
                <p>Your junk removal is scheduled</p>
            </div>
            <div class="content">
                <h2 style="color: #10b981;">Booking Details</h2>
                <div class="booking-details">
                    <div class="detail-row">
                        <span class="detail-label">Booking ID:</span>
                        <span class="detail-value">{booking_data.get('id', '')[:8]}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Pickup Date:</span>
                        <span class="detail-value">{pickup_date}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Time Window:</span>
                        <span class="detail-value">{booking_data.get('pickup_time', 'TBD')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Address:</span>
                        <span class="detail-value">{booking_data.get('address', 'Not provided')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Total Amount:</span>
                        <span class="detail-value" style="font-size: 20px; font-weight: bold; color: #10b981;">${quote_data.get('total_price', 0)}</span>
                    </div>
                </div>
                
                <h3 style="color: #10b981; margin-top: 30px;">📱 Payment Required</h3>
                <p>Please send payment via Venmo to complete your booking:</p>
                <ul style="background: #eff6ff; padding: 20px; border-radius: 8px;">
                    <li>Send <strong>${quote_data.get('total_price', 0)}</strong> to <strong>@Text2toss</strong></li>
                    <li>Include Booking ID: <strong>{booking_data.get('id', '')[:8]}</strong> in the note</li>
                </ul>
                
                <p style="margin-top: 20px;">We'll confirm your payment and send final details before pickup!</p>
                
                <div class="footer">
                    <p>Questions? Reply to this email or call us!</p>
                    <p>© 2025 Text2toss Junk Removal - Flagstaff, AZ</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

def create_payment_reminder_email(booking_data: dict, amount: float, booking_id: str, qr_code_url: str = None) -> str:
    """Create HTML email for payment reminder"""
    pickup_date = booking_data.get('pickup_date', 'TBD')
    if isinstance(pickup_date, str):
        try:
            pickup_date = datetime.fromisoformat(pickup_date).strftime('%B %d, %Y')
        except (ValueError, TypeError):
            pass
    
    qr_section = ""
    if qr_code_url:
        qr_section = f"""
        <div style="text-align: center; margin: 20px 0;">
            <img src="{qr_code_url}" alt="Venmo QR Code" style="width: 200px; height: 200px; border: 2px solid #e5e7eb; border-radius: 8px;">
            <p style="font-size: 12px; color: #6b7280;">Scan with Venmo app to pay</p>
        </div>
        """
    
    return f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .payment-box {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #3b82f6; }}
            .amount {{ font-size: 32px; font-weight: bold; color: #3b82f6; text-align: center; margin: 20px 0; }}
            .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>💳 Payment Reminder</h1>
                <p>Complete your booking payment</p>
            </div>
            <div class="content">
                <h2 style="color: #3b82f6;">Booking Summary</h2>
                <div class="payment-box">
                    <p><strong>Booking ID:</strong> {booking_id[:8]}</p>
                    <p><strong>Pickup Date:</strong> {pickup_date}</p>
                    <p><strong>Time:</strong> {booking_data.get('pickup_time', 'TBD')}</p>
                    <div class="amount">${amount}</div>
                </div>
                
                <h3 style="color: #3b82f6;">Payment Instructions:</h3>
                {qr_section}
                <ol style="background: #eff6ff; padding: 20px; border-radius: 8px;">
                    <li>Open <strong>Venmo app</strong> on your phone</li>
                    <li>Search for <strong>@Text2toss</strong></li>
                    <li>Send <strong>${amount}</strong></li>
                    <li>Include Booking ID: <strong>{booking_id[:8]}</strong> in the payment note</li>
                    <li>We'll confirm payment and send pickup details</li>
                </ol>
                
                <p style="margin-top: 20px; text-align: center;">
                    <a href="https://venmo.com/u/Text2toss" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Open Venmo Profile
                    </a>
                </p>
                <p style="text-align: center; font-size: 12px; color: #6b7280; margin-top: 10px;">
                    Click above to open @Text2toss on Venmo
                </p>
                
                <div class="footer">
                    <p>Questions? Reply to this email!</p>
                    <p>© 2025 Text2toss Junk Removal</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

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
    temp_image_path: Optional[str] = None  # Temporary image path (deleted if not booked)
    # Quote approval system for high-value jobs (Scale 9-20)
    approval_status: str = "auto_approved"  # auto_approved, pending_approval, approved, rejected
    requires_approval: bool = False  # True for Scale 9-20 quotes
    admin_notes: Optional[str] = None  # Admin notes for approval/rejection
    approved_price: Optional[float] = None  # Admin can adjust price
    approved_by: Optional[str] = None  # Admin who approved/rejected
    approved_at: Optional[datetime] = None  # When approved/rejected
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
    """Use AI to analyze junk description and provide intelligent pricing for ground level/curbside pickup only"""
    
    items_text = [f"- {item.quantity}x {item.name} ({item.size} size)"
                  + (f"\n  Description: {item.description}" if item.description else "")
                  for item in items]
    items_summary = "\n".join(items_text)
    ai_prompt = _build_text_pricing_prompt(items_summary, description)

    try:
        # Initialize AI chat
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=f"pricing_{datetime.now().timestamp()}",
            system_message="You are a professional junk removal pricing expert. Always respond with valid JSON only."
        ).with_model("openai", "gpt-4o-mini")
        
        # Send message to AI
        user_message = UserMessage(text=ai_prompt)
        response = await chat.send_message(user_message)
        
        total_price, explanation, scale_level, breakdown = _parse_ai_pricing_response(response)
        
        # CRITICAL: Validate AI pricing for accuracy and consistency
        validated_price, validated_scale = validate_pricing_logic(items, total_price, scale_level)
        
        # Additional safety checks for pricing accuracy
        price_per_item = validated_price / len(items) if items else 0
        if price_per_item < 25:  # Each item should cost at least $25 on average
            safety_price = len(items) * 30  # $30 minimum per item
            if safety_price > validated_price:
                validated_price = safety_price
                explanation += " (Safety adjustment applied - minimum $30 per item for business sustainability)"
        
        # Scale consistency check
        if validated_scale != scale_level and scale_level:
            explanation += f" (Scale adjusted from {scale_level} to {validated_scale} for pricing consistency)"
        elif validated_price != total_price:
            explanation += f" (Price adjusted from ${total_price:.2f} to ${validated_price:.2f} for business accuracy)"
        
        # Final safety check - never go below absolute minimum
        absolute_minimum = 45.0
        if validated_price < absolute_minimum:
            validated_price = absolute_minimum
            validated_scale = 3
            explanation += f" (Applied minimum service charge of ${absolute_minimum})"
        
        return validated_price, explanation, validated_scale, breakdown
        
    except Exception as e:
        print(f"AI pricing error: {str(e)}")
        # Fallback to basic pricing if AI fails
        fallback_price = calculate_basic_price(items)
        
        # Apply business logic validation to fallback pricing too
        validated_price, validated_scale = validate_pricing_logic(items, fallback_price, None)
        
        fallback_breakdown = {
            "base_price": f"{validated_price:.2f}",
            "volume_assessment": f"Estimated {len(items)} items",
            "items": [{"name": item.name, "size": item.size, "estimated_cost": validated_price / len(items)} for item in items],
            "factors": ["Ground level pickup included", "Business logic validated", "AI analysis unavailable"],
            "additional_charges": 0,
            "total": validated_price
        }
        return validated_price, "Basic pricing applied with business logic validation (AI temporarily unavailable)", validated_scale, fallback_breakdown

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
async def analyze_image_for_quote(image_path: str, description: str) -> tuple[List[JunkItem], float, str, Optional[int], Optional[dict]]:
    """Use AI vision to analyze uploaded image and identify junk items for pricing.

    Implementation is broken down into helpers:
      - _compress_image_for_ai     → speed up upload & hashing
      - _check_image_cache          → return cached analysis if seen before
      - _build_vision_prompt        → centralizes the pricing prompt
      - _parse_ai_quote_response    → JSON extraction & item construction
      - _enhanced_text_fallback     → description-based fallback when vision fails
    """
    import time as _time
    t0 = _time.monotonic()

    compressed_path = _compress_image_for_ai(image_path, t0)

    try:
        import hashlib
        with open(compressed_path, "rb") as f:
            image_hash = hashlib.sha256(f.read()).hexdigest()

        # Description is now part of the cache key so a customer hint like
        # "with stairs" or "extra heavy" causes a fresh AI pass instead of
        # silently returning a description-less quote.
        desc_norm = (description or "").strip().lower()
        cache_key = hashlib.sha256(f"{image_hash}|{desc_norm}".encode()).hexdigest()

        cached = await _check_image_cache(cache_key, image_hash, compressed_path, image_path, t0)
        if cached is not None:
            return cached

        logger.info(f"Cache MISS for image {image_hash[:8]} desc={desc_norm[:40]!r} - sending to AI")
        response_text = await _request_ai_vision_quote(compressed_path, description, image_hash, t0)

        # Clean up compressed file
        if compressed_path != image_path and Path(compressed_path).exists():
            Path(compressed_path).unlink()

        items, total_price, explanation, scale_level, breakdown = _parse_ai_quote_response(response_text)

        # Cache the result for consistency
        await _cache_quote_analysis(cache_key, image_hash, desc_norm, items, total_price, explanation, scale_level, breakdown)
        return items, total_price, explanation, scale_level, breakdown

    except Exception as e:
        logger.error(f"AI vision analysis error: {e}")
        return await _enhanced_text_fallback(description)


def _compress_image_for_ai(image_path: str, t0: float) -> str:
    """Resize/compress image to 768px JPEG for fast hashing + AI upload.
    Falls back to the original path if compression fails."""
    import time as _time
    try:
        from PIL import Image as PILImage
        img = PILImage.open(image_path)
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


def _build_vision_prompt(description: str) -> str:
    """Centralized pricing prompt for the vision call."""
    return (
        f"Junk removal pricing expert — Text2toss, Flagstaff AZ. GROUND LEVEL/CURBSIDE ONLY.\n\n"
        f"Customer note: {description or 'None'}\n\n"
        "SCALE (by total volume):\n"
        "1:$15|2:$20|3:$50|4:$63|5:$78|6:$95|7:$115|8:$138|9:$163|10:$190|11:$220|12:$253|13:$290|14:$333|15:$380|16:$433|17:$490|18:$553|19:$620|20:$703\n\n"
        "Rules: Identify all items. Estimate total cubic feet. Overestimate 15-20%. Heavy items +20%.\n\n"
        'JSON only:\n'
        '{"items":[{"name":"item","quantity":1,"size":"small/medium/large","description":"brief"}],'
        '"total_price":150.00,"scale_level":5,'
        '"breakdown":{"base_price":"140.00","volume_assessment":"Medium load",'
        '"items":[{"name":"Table","size":"large","estimated_cost":80.00}],'
        '"factors":["Ground level"],"additional_charges":10.00,"total":150.00},'
        '"explanation":"Scale 5 - table and chairs."}'
    )


async def _request_ai_vision_quote(compressed_path: str, description: str, image_hash: str, t0: float) -> str:
    """Send compressed image + prompt to Gemini and return the raw text response."""
    import time as _time
    image_file = FileContentWithMimeType(file_path=compressed_path, mime_type="image/jpeg")
    chat = LlmChat(
        api_key=os.environ.get("EMERGENT_LLM_KEY"),
        session_id=f"vision_{image_hash}",
        system_message="Junk removal pricing expert. Respond with valid JSON only."
    ).with_model("gemini", "gemini-2.0-flash")
    user_message = UserMessage(text=_build_vision_prompt(description), file_contents=[image_file])
    t_ai = _time.monotonic()
    response = await chat.send_message(user_message)
    logger.info(f"AI response in {_time.monotonic()-t_ai:.1f}s (total {_time.monotonic()-t0:.1f}s)")
    return response.strip()


def _parse_ai_quote_response(response_text: str):
    """Extract JSON, build JunkItems, return the 5-tuple."""
    json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
    if json_match:
        response_text = json_match.group(0)
    analysis_data = json.loads(response_text)

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
    breakdown = analysis_data.get("breakdown")
    return items, total_price, explanation, scale_level, breakdown


async def _cache_quote_analysis(cache_key, image_hash, desc_norm, items, total_price, explanation, scale_level, breakdown):
    cache_data = {
        "cache_key": cache_key,
        "image_hash": image_hash,
        "description_norm": desc_norm,
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
    file: UploadFile = File(...),
    description: str = Form(default="")
):
    """Create quote by analyzing uploaded image with AI vision"""
    
    print(f"Image quote endpoint received description: '{description}'")
    
    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # Save uploaded file directly to permanent quote_images directory
    quote_images_dir = Path("/app/static/quote_images")
    quote_images_dir.mkdir(parents=True, exist_ok=True)
    
    file_extension = Path(file.filename).suffix or '.jpg'
    permanent_filename = f"quote_{uuid.uuid4()}{file_extension}"
    file_path = quote_images_dir / permanent_filename
    
    try:
        # Save uploaded file permanently
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Analyze image with AI
        items, total_price, ai_explanation, scale_level, breakdown = await analyze_image_for_quote(str(file_path), description)
        
        # Determine if quote requires approval (Scale 9-20)
        requires_approval = scale_level is not None and scale_level >= 9
        approval_status = "pending_approval" if requires_approval else "auto_approved"
        
        # Create quote with permanent image path
        quote = PriceQuote(
            user_id="anonymous",
            items=items,
            total_price=total_price,
            scale_level=scale_level,
            breakdown=breakdown,
            description=f"Image analysis: {description}" if description else "Image-based quote",
            ai_explanation=ai_explanation,
            temp_image_path=str(file_path),
            requires_approval=requires_approval,
            approval_status=approval_status
        )
        
        quote_mongo = prepare_for_mongo(quote.dict())
        await db.quotes.insert_one(quote_mongo)
        
        logger.info(f"Quote created: id={quote.id}, scale={scale_level}, requires_approval={requires_approval}, approval_status={approval_status}, image={permanent_filename}")
        
        # Cleanup old images in background (don't block the response)
        background_tasks.add_task(cleanup_old_quote_images, 30)
        
        return quote
        
    except Exception as e:
        # Clean up file on error
        if file_path.exists():
            file_path.unlink()
        raise e

@api_router.get("/quotes/{quote_id}", response_model=PriceQuote)
async def get_quote(quote_id: str):
    quote_doc = await db.quotes.find_one({"id": quote_id})
    if not quote_doc:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    quote_doc = parse_from_mongo(quote_doc)
    return PriceQuote(**quote_doc)

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
    """Build the 'quote under review' HTML email sent to the customer."""
    return f"""<!DOCTYPE html><html><head><style>
body{{font-family:'Segoe UI',Arial,sans-serif;line-height:1.7;color:#333;background:#f5f5f5}}
.container{{max-width:600px;margin:0 auto;padding:20px;background:#fff}}
.header{{background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}}
.content{{background:#fff;padding:40px 30px}}
.highlight{{background:#dbeafe;border-left:4px solid #3b82f6;padding:20px;margin:25px 0;border-radius:5px}}
.details{{background:#f9fafb;padding:20px;margin:20px 0;border-radius:8px;border:1px solid #e5e7eb}}
.steps{{background:#fef3c7;border-left:4px solid #f59e0b;padding:20px;margin:25px 0;border-radius:5px}}
.info-box{{background:#f0fdf4;border:1px solid #bbf7d0;padding:20px;margin:20px 0;border-radius:8px}}
.footer{{text-align:center;color:#6b7280;font-size:14px;margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb}}
.status{{display:inline-block;background:#3b82f6;color:#fff;padding:6px 16px;border-radius:20px;font-size:14px;font-weight:600}}
</style></head><body><div class="container">
<div class="header">
<h1 style="margin:0;font-size:28px">Quote Successfully Submitted</h1>
<p style="margin:15px 0 0;opacity:0.95;font-size:16px">Thank you for choosing Text2toss Junk Removal</p>
</div>
<div class="content">
<p style="font-size:16px;margin-bottom:20px">Dear Valued Customer,</p>
<p>Thank you for submitting your junk removal quote request. Your quote is currently <span class="status">Under Review</span> by our professional team.</p>
<div class="highlight">
<h3 style="margin-top:0;color:#1e40af">Response Timeline</h3>
<p style="margin:0;font-size:15px">You will receive an email response with your <strong>approved quote within 24 hours</strong>.</p>
</div>
<div class="details">
<h3>Your Quote Request Details:</h3>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Quote ID:</td>
<td style="padding:8px 0;font-family:monospace;background:#f3f4f6;padding:4px 8px;border-radius:4px">{booking.quote_id}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Pickup Date:</td>
<td style="padding:8px 0">{booking.pickup_date.strftime('%B %d, %Y')}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Pickup Time:</td>
<td style="padding:8px 0">{booking.pickup_time}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Service Address:</td>
<td style="padding:8px 0">{booking.address}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Estimated Price:</td>
<td style="padding:8px 0;font-weight:600">${quote_doc.get('total_price',0):.2f} <span style="font-size:13px;color:#6b7280;font-weight:normal">(subject to review)</span></td></tr>
</table>
</div>
<div class="steps">
<h3 style="margin-top:0;color:#92400e">Next Steps</h3>
<ol style="margin:10px 0 0;padding-left:20px">
<li style="margin-bottom:12px"><strong>Quote Review:</strong> Our team will assess your requirements and finalize pricing.</li>
<li style="margin-bottom:12px"><strong>Email Notification:</strong> You will receive your approved quote via email within 24 hours.</li>
<li style="margin-bottom:12px"><strong>Payment:</strong> Once you receive and approve the quote, complete the payment step.</li>
<li style="margin-bottom:0"><strong>Booking Confirmed:</strong> After payment, your service is officially scheduled.</li>
</ol>
</div>
<div class="info-box">
<p style="margin:0;font-size:15px"><strong>Important:</strong> No payment is required at this time. You will only be charged <strong>after</strong> you review and approve the final quote.</p>
</div>
<p style="margin-top:30px">If you have any questions, please feel free to contact us!</p>
<p style="margin-top:25px;color:#4b5563">Best regards,<br><strong style="color:#1f2937">The Text2toss Team</strong></p>
<div class="footer">
<p style="margin-bottom:10px"><strong>Text2toss Junk Removal</strong></p>
<p style="margin:5px 0;color:#9ca3af">Professional &bull; Reliable &bull; Eco-Friendly</p>
</div>
</div></div></body></html>"""


@api_router.post("/bookings", response_model=Booking)
async def create_booking(booking_data: BookingCreate, token: str = None):
    """Create a booking from an existing quote.

    Implementation broken down into focused helpers:
      - _resolve_user_id            → optionally look up authenticated user
      - _validate_pickup_request    → ensures Mon-Thu + slot availability
      - _build_booking              → constructs the Booking object
      - _send_post_booking_emails   → admin + customer notifications
      - _send_post_booking_sms      → optional confirmation SMS
    """
    user_id = await _resolve_user_id(token)

    quote_doc = await db.quotes.find_one({"id": booking_data.quote_id})
    if not quote_doc:
        raise HTTPException(status_code=404, detail="Quote not found")

    pickup_datetime = await _validate_pickup_request(booking_data)

    booking = _build_booking(booking_data, pickup_datetime, quote_doc, user_id)
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
    return pickup_datetime


def _build_booking(booking_data: BookingCreate, pickup_datetime: datetime, quote_doc: dict, user_id: str) -> "Booking":
    """Assemble the Booking object, including initial status based on approval rules."""
    booking_status = (
        "pending_customer_approval"
        if quote_doc.get("requires_approval", False)
        else "pending_payment"
    )
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
        status=booking_status
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
            
        # Validate Booking data structure
        clean_booking_data = {k: v for k, v in booking_data.items() if k != "quote_details"}
        Booking(**clean_booking_data)  # Validate only
        
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
    """Get calendar data for a month range showing all PAID scheduled jobs (excludes pending_payment bookings)"""
    try:
        # Query bookings within the date range - ONLY paid bookings
        pipeline = [
            {
                "$match": {
                    "status": {"$in": ["scheduled", "in_progress", "completed"]}  # Exclude pending_payment
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
                    "pickup_date_only": {
                        "$gte": start_date,
                        "$lte": end_date
                    }
                }
            },
            {
                "$lookup": {
                    "from": "quotes",
                    "localField": "quote_id",
                    "foreignField": "id",
                    "as": "quote_details"
                }
            },
            {
                "$unwind": {
                    "path": "$quote_details",
                    "preserveNullAndEmptyArrays": True
                }
            },
            {"$sort": {"pickup_date": 1, "pickup_time": 1}}
        ]
        
        bookings_cursor = db.bookings.aggregate(pipeline)
        bookings = await bookings_cursor.to_list(length=2000)  # Reasonable limit for calendar month
        
        # Group bookings by date
        calendar_data = {}
        for booking in bookings:
            # Remove MongoDB _id fields to avoid serialization issues
            if "_id" in booking:
                del booking["_id"]
            if "quote_details" in booking and "_id" in booking["quote_details"]:
                del booking["quote_details"]["_id"]
            
            booking = parse_from_mongo(booking)
            date_key = booking['pickup_date_only']
            if date_key not in calendar_data:
                calendar_data[date_key] = []
            calendar_data[date_key].append(booking)
        
        return calendar_data
        
    except Exception as e:
        logger.error(f"Error fetching calendar data: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch calendar data")

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
    """Check availability for a date range - used for calendar view"""
    try:
        start = datetime.fromisoformat(start_date).date()
        end = datetime.fromisoformat(end_date).date()
        
        availability_data = {}
        current_date = start
        
        while current_date <= end:
            date_str = current_date.isoformat()
            
            # Check if date is restricted (Friday, Saturday, Sunday)
            if current_date.weekday() >= 4:
                availability_data[date_str] = {
                    "available_count": 0,
                    "total_slots": 5,
                    "is_restricted": True,
                    "status": "restricted"
                }
            else:
                # Get PAID bookings for this date (only count scheduled/in_progress/completed)
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
                            "pickup_date_only": date_str
                        }
                    }
                ]
                
                bookings_cursor = db.bookings.aggregate(pipeline)
                bookings = await bookings_cursor.to_list(length=2000)  # Reasonable limit for calendar month
                
                booked_count = len(bookings)
                available_count = 5 - booked_count  # 5 total time slots
                
                if available_count == 0:
                    status = "fully_booked"
                elif available_count <= 2:
                    status = "limited"
                else:
                    status = "available"
                
                availability_data[date_str] = {
                    "available_count": available_count,
                    "total_slots": 5,
                    "is_restricted": False,
                    "status": status
                }
            
            current_date += timedelta(days=1)
        
        return availability_data
        
    except Exception as e:
        logging.error(f"Error checking availability range: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to check availability range")

@api_router.patch("/admin/bookings/{booking_id}")
async def update_booking_status(booking_id: str, status_update: dict):
    """Update booking status and send SMS notification"""
    allowed_statuses = ["scheduled", "in_progress", "completed", "cancelled"]
    new_status = status_update.get("status")
    
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # Get booking details first
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    update_data = {"status": new_status}
    
    # If cancelling, also update payment_status so it's removed from pending payments
    if new_status == "cancelled":
        update_data["payment_status"] = "cancelled"
    
    # If marking as completed, add completion timestamp
    if new_status == "completed":
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": update_data}
    )
    
    # Send SMS notification based on status
    sms_messages = {
        "in_progress": f"🚛 Text2toss Update: Your junk removal team has started working at {booking['address']}. We'll notify you when complete!",
        "completed": f"✅ Text2toss Complete: Your junk removal is finished at {booking['address']}. Thank you for choosing our service!",
        "cancelled": f"❌ Text2toss Notice: Your junk removal appointment for {booking['address']} has been cancelled. Contact us for rescheduling."
    }
    
    if new_status in sms_messages:
        phone = booking.get('phone', '').replace('(', '').replace(')', '').replace(' ', '').replace('-', '')
        if phone and not phone.startswith('+'):
            phone = '+1' + phone  # Assume US number if no country code
        
        # Only send SMS if customer opted in for notifications
        if phone and booking.get('sms_notifications', False):
            sms_result = await send_sms(phone, sms_messages[new_status])
            logging.info(f"SMS sent for booking {booking_id}: {sms_result}")
        elif phone and not booking.get('sms_notifications', False):
            logging.info(f"SMS not sent for booking {booking_id}: Customer opted out of notifications")
    
    return {"message": "Booking status updated and customer notified"}

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


async def _save_completion_photo(booking_id: str, file: UploadFile) -> Path:
    """Persist the uploaded file under /completion_photos and return its path."""
    completion_dir = Path("/app/backend/static/completion_photos")
    completion_dir.mkdir(parents=True, exist_ok=True)
    file_extension = Path(file.filename).suffix or ".jpg"
    photo_filename = f"completion_{booking_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}{file_extension}"
    photo_path = completion_dir / photo_filename
    async with aiofiles.open(photo_path, "wb") as f:
        await f.write(await file.read())
    return photo_path


async def _persist_completion_metadata(booking_id: str, photo_path: Path, completion_note: str):
    result = await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"completion_photo_path": str(photo_path), "completion_note": completion_note}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")


async def _notify_customer_completion(booking: dict, booking_id: str, completion_note: str):
    """SMS the customer the completion photo if they opted in."""
    raw_phone = (booking.get("phone") or "").replace("(", "").replace(")", "").replace(" ", "").replace("-", "")
    if not raw_phone:
        return
    phone = raw_phone if raw_phone.startswith("+") else "+1" + raw_phone

    backend_url = os.environ.get("REACT_APP_BACKEND_URL")
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
        backend_url = os.environ.get('REACT_APP_BACKEND_URL')
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
    backend_url = os.environ.get('REACT_APP_BACKEND_URL')
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
        backend_url = os.environ.get("REACT_APP_BACKEND_URL")
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
    try:
        if approval_action.action == "approve":
            approved_price = approval_action.approved_price or quote.get("total_price")
            html = _build_quote_approval_email_html(quote, approval_action, customer_name, approved_price)
            await send_email(customer_email, "✅ Your Quote Has Been Approved - Text2toss", html)
            logging.info(f"Approval email sent to {customer_email}")
        else:
            html = _build_quote_rejection_email_html(approval_action, customer_name)
            await send_email(customer_email, "Quote Decision - Text2toss", html)
            logging.info(f"Rejection email sent to {customer_email}")
    except Exception as email_error:
        logging.error(f"Failed to send approval/rejection email: {email_error}")
        # Don't fail the approval process if email fails


def _build_quote_approval_email_html(quote: dict, approval_action, customer_name: str, approved_price: float) -> str:
    """HTML for the customer 'Quote Approved' email."""
    is_adjusted = (
        approval_action.approved_price is not None
        and approval_action.approved_price != quote.get("total_price")
    )
    badge = "Updated Price (Admin Adjusted)" if is_adjusted else "Approved Quote"
    original_strike = (
        f'<div style="font-size: 14px; color: #6b7280; margin-top: 10px;">'
        f'<s>Original: ${quote.get("total_price"):.2f}</s></div>'
        if is_adjusted else ""
    )
    notes_block = (
        f'<div class="info-box"><strong>Admin Notes:</strong><br>{approval_action.admin_notes}</div>'
        if approval_action.admin_notes else ""
    )
    backend_url = os.environ.get("REACT_APP_BACKEND_URL", "https://junkai-platform.emergent.host")
    return f"""<!DOCTYPE html>
<html>
<head>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #333; background-color: #f5f5f5; }}
  .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }}
  .header {{ background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0; }}
  .content {{ background: #ffffff; padding: 40px 30px; }}
  .price-box {{ background: #d1fae5; border: 2px solid #10b981; padding: 20px; margin: 25px 0; border-radius: 8px; text-align: center; }}
  .price {{ font-size: 36px; font-weight: bold; color: #059669; margin: 10px 0; }}
  .info-box {{ background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; margin: 20px 0; border-radius: 8px; }}
  .cta-button {{ display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }}
  .footer {{ text-align: center; color: #6b7280; font-size: 14px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }}
  h1 {{ margin: 0; font-size: 28px; }}
</style></head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
      <h1>Quote Approved!</h1>
      <p style="margin: 15px 0 0 0; opacity: 0.95; font-size: 16px;">Great news! Your junk removal quote has been approved.</p>
    </div>
    <div class="content">
      <p>Hi {customer_name},</p>
      <p>We're excited to let you know that your junk removal quote has been <strong>approved</strong> and is ready to proceed!</p>
      <div class="price-box">
        <div style="font-size: 16px; color: #059669; font-weight: 600;">{badge}</div>
        <div class="price">${approved_price:.2f}</div>
        {original_strike}
      </div>
      {notes_block}
      <div class="info-box">
        <h3 style="margin-top: 0; color: #059669;">✅ Ready to Complete Your Booking!</h3>
        <p style="margin: 10px 0;">Your quote is approved and ready for payment. Click the button below to complete your booking and confirm your pickup date.</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="{backend_url}" class="cta-button" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 16px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 18px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
          💳 Complete Payment Now
        </a>
        <p style="font-size: 12px; color: #6b7280; margin-top: 15px;">Click to return to Text2toss and complete your booking</p>
      </div>
      <div class="info-box">
        <h3 style="margin-top: 0; color: #059669;">What Happens Next:</h3>
        <ol style="margin: 10px 0; padding-left: 20px;">
          <li><strong>Complete Payment:</strong> Click the button above and pay via Venmo to confirm</li>
          <li><strong>Booking Confirmed:</strong> You'll receive immediate confirmation</li>
          <li><strong>Pickup Scheduled:</strong> Your job is added to our schedule</li>
          <li><strong>We Arrive:</strong> Our team will be there at your scheduled time!</li>
        </ol>
      </div>
      <p style="margin-top: 30px; font-size: 14px; color: #6b7280; text-align: center;">Questions? Reply to this email or call us at 928-853-9619</p>
    </div>
    <div class="footer">
      <p>Text2toss Junk Removal<br>Professional Junk Removal Services</p>
      <p style="margin-top: 10px; font-size: 12px; color: #9ca3af;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>"""


def _build_quote_rejection_email_html(approval_action, customer_name: str) -> str:
    """HTML for the customer 'Quote Decision' (rejection) email."""
    notes_block = (
        f'<div class="info-box"><strong>Reason:</strong><br>{approval_action.admin_notes}</div>'
        if approval_action.admin_notes else ""
    )
    return f"""<!DOCTYPE html>
<html>
<head>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #333; background-color: #f5f5f5; }}
  .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }}
  .header {{ background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0; }}
  .content {{ background: #ffffff; padding: 40px 30px; }}
  .info-box {{ background: #fef3c7; border: 1px solid #fbbf24; padding: 20px; margin: 20px 0; border-radius: 8px; }}
  .footer {{ text-align: center; color: #6b7280; font-size: 14px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }}
  h1 {{ margin: 0; font-size: 28px; }}
</style></head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 48px; margin-bottom: 10px;">📋</div>
      <h1>Quote Update</h1>
      <p style="margin: 15px 0 0 0; opacity: 0.95; font-size: 16px;">Regarding your junk removal request</p>
    </div>
    <div class="content">
      <p>Hi {customer_name},</p>
      <p>Thank you for considering Text2toss for your junk removal needs. After reviewing your request, we're unable to proceed with this particular job at this time.</p>
      {notes_block}
      <div class="info-box">
        <p style="margin: 0;"><strong>We're here to help!</strong></p>
        <p style="margin: 10px 0 0 0;">If you have questions or would like to discuss alternative options, please feel free to contact us. We may be able to assist with a modified request.</p>
      </div>
      <p style="margin-top: 30px;">We appreciate your understanding and hope to serve you in the future.</p>
      <p style="margin-top: 20px;">Best regards,<br>Text2toss Team</p>
    </div>
    <div class="footer">
      <p>Text2toss Junk Removal<br>Professional Junk Removal Services</p>
      <p style="margin-top: 10px; font-size: 12px; color: #9ca3af;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>"""

@api_router.get("/admin/quote-approval-stats")
async def get_quote_approval_stats():
    """Get statistics for quote approval system"""
    try:
        # Count quotes by approval status
        pending_count = await db.quotes.count_documents({"approval_status": "pending_approval"})
        approved_count = await db.quotes.count_documents({"approval_status": "approved"})
        rejected_count = await db.quotes.count_documents({"approval_status": "rejected"})
        auto_approved_count = await db.quotes.count_documents({"approval_status": "auto_approved"})
        
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
            samesite="lax",
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
    """Send payment reminder emails to all bookings with pending payments"""
    try:
        # Get all pending payment bookings
        bookings = await db.bookings.find({
            "payment_status": "pending"
        }).to_list(1000)
        
        if not bookings:
            return {"success": True, "message": "No pending payments found", "sent_count": 0, "failed_count": 0}
        
        # OPTIMIZATION: Batch fetch all quotes to avoid N+1 query problem
        quote_ids = [booking['quote_id'] for booking in bookings if booking.get('quote_id')]
        quotes = []
        if quote_ids:
            quotes = await db.quotes.find({"id": {"$in": quote_ids}}).to_list(length=1000)
        
        # Create quote lookup dictionary for O(1) access
        quote_dict = {quote['id']: quote for quote in quotes}
        
        sent_count = 0
        failed_count = 0
        errors = []
        
        for booking_doc in bookings:
            try:
                booking = Booking(**parse_from_mongo(booking_doc))
                
                # Skip if no email
                if not booking.email:
                    continue
                
                # Get quote details from pre-fetched dictionary (no database query)
                quote_doc = quote_dict.get(booking.quote_id)
                if not quote_doc:
                    continue
                
                amount = quote_doc.get("total_price", 0)
                venmo_qr_url = "https://www.paypal.com/qrcodes/venmocs/9f1f97dd-23ed-4676-82b5-3fc2126def65?created=1762118921"
                
                # Create and send email
                if is_email_enabled():
                    email_html = create_payment_reminder_email(
                        booking.dict(), 
                        amount, 
                        booking.id,
                        venmo_qr_url
                    )
                    
                    await send_email(
                        to_email=booking.email,
                        subject=f"💳 Payment Reminder - Booking {booking.id[:8]}",
                        html_content=email_html
                    )
                    sent_count += 1
                    logging.info(f"Bulk payment reminder email sent to {booking.email}")
            except Exception as e:
                failed_count += 1
                errors.append(f"Booking {booking_doc.get('id', 'unknown')}: {str(e)}")
                logging.error(f"Failed to send bulk email to {booking_doc.get('email', 'unknown')}: {str(e)}")
        
        return {
            "success": True, 
            "sent_count": sent_count,
            "failed_count": failed_count,
            "errors": errors if failed_count > 0 else None,
            "message": f"Sent {sent_count} email(s), {failed_count} failed"
        }
        
    except Exception as e:
        logger.error(f"Error sending bulk email reminders: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send bulk emails: {str(e)}")

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
    """Get all bookings (history and present) with quote details"""
    try:
        # Fetch all bookings sorted by created_at descending (newest first)
        bookings = await db.bookings.find({}).sort("created_at", -1).to_list(10000)
        
        # OPTIMIZATION: Batch fetch all quotes to avoid N+1 query problem
        quote_ids = [booking['quote_id'] for booking in bookings if booking.get('quote_id')]
        quotes = []
        if quote_ids:
            quotes = await db.quotes.find({"id": {"$in": quote_ids}}).to_list(length=10000)
        
        # Create quote lookup dictionary for O(1) access
        quote_dict = {quote['id']: quote for quote in quotes}
        
        result = []
        for booking in bookings:
            if "_id" in booking:
                del booking["_id"]
            booking_data = parse_from_mongo(booking)
            
            # Add quote details from pre-fetched dictionary (no database query)
            if booking_data.get("quote_id"):
                quote = quote_dict.get(booking_data["quote_id"])
                if quote:
                    if "_id" in quote:
                        del quote["_id"]
                    booking_data["quote_details"] = parse_from_mongo(quote)
            
            result.append(booking_data)
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching all bookings: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch bookings")
        
    except Exception as e:
        logger.error(f"Route optimization failed: {str(e)}")
        return {
            "message": f"Route optimization failed: {str(e)}",
            "optimized": False,
            "error": str(e)
        }

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
            backend_url = os.environ.get('REACT_APP_BACKEND_URL')
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
                    None, None, None, None
                ]
            }
            await db.photo_reel.insert_one(default_reel)
            return {"photos": default_reel["photos"]}
        
        # Ensure all URLs are full URLs for consistent display
        backend_url = os.environ.get('REACT_APP_BACKEND_URL')
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
        file_path = f"/app/static/gallery/{filename}"
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        img.save(file_path, "JPEG", quality=85, optimize=True)

        backend_url = os.environ.get("REACT_APP_BACKEND_URL", "")
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
        
        if slot_index < 0 or slot_index >= 6:
            raise HTTPException(status_code=400, detail="Invalid slot index")
        
        # Get current reel
        reel = await db.photo_reel.find_one({"type": "main_reel"})
        if not reel:
            reel = {"type": "main_reel", "photos": [None] * 6}
        
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
    """Persist a new order for the 6 reel slots."""
    photos = payload.photos
    if len(photos) != 6:
        raise HTTPException(status_code=400, detail="Reel must have exactly 6 slots")
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
    slot_index: int = Field(..., ge=0, le=5)
    photo_url: str
    crop: CropArea


@api_router.post("/admin/crop-reel-photo")
async def crop_reel_photo(payload: CropReelPayload):
    """Crop the source photo at `photo_url` according to `payload.crop`,
    save the result to /app/static/gallery/, and update the reel slot."""
    from PIL import Image
    from io import BytesIO

    src_url = payload.photo_url
    # Resolve to a local file path when the URL points at our own server
    backend_url = os.environ.get("REACT_APP_BACKEND_URL", "")
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
        reel = {"type": "main_reel", "photos": [None] * 6}
    reel["photos"][payload.slot_index] = new_url
    await db.photo_reel.update_one(
        {"type": "main_reel"},
        {"$set": {"photos": reel["photos"]}},
        upsert=True
    )
    return {"message": "Cropped & saved", "url": new_url, "slot_index": payload.slot_index}

@api_router.delete("/admin/gallery-photo")
async def remove_gallery_photo(request: dict):
    """Remove a photo from the gallery (DB row + file on disk)."""
    try:
        photo_url = request.get("photo_url") or ""

        # Remove from database
        result = await db.gallery_photos.delete_one({"url": photo_url})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Photo not found")

        # Resolve the on-disk path. Modern uploads use:
        #   {BACKEND_URL}/api/images/gallery/<filename>
        # Legacy uploads used "/static/gallery/<filename>" or "/files/gallery/<filename>".
        try:
            file_path = None
            if "/api/images/gallery/" in photo_url:
                file_path = "/app/static/gallery/" + photo_url.rsplit("/", 1)[-1]
            elif photo_url.startswith("/static/gallery/"):
                file_path = f"/app{photo_url}"
            elif photo_url.startswith("/files/gallery/"):
                file_path = f"/app/static{photo_url.replace('/files', '')}"
            elif "/files/gallery/" in photo_url:
                file_path = "/app/static/gallery/" + photo_url.rsplit("/", 1)[-1]

            if file_path and os.path.exists(file_path):
                os.remove(file_path)
        except Exception as file_error:
            logger.warning(f"Failed to remove file {photo_url}: {file_error}")

        return {"message": "Photo removed successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove photo: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to remove photo")

# Image serving endpoint (due to Kubernetes routing all non-/api requests to frontend)
@api_router.get("/images/{folder}/{filename}")
async def serve_image(folder: str, filename: str):
    """Serve images through API endpoint due to Kubernetes routing"""
    import mimetypes
    
    file_path = f"/app/static/{folder}/{filename}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Determine content type
    content_type, _ = mimetypes.guess_type(file_path)
    if not content_type:
        content_type = "application/octet-stream"
    
    # Return with inline disposition so images display in browser instead of downloading
    headers = {"Content-Disposition": "inline"}
    return FileResponse(file_path, media_type=content_type, headers=headers)

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
    """Get the current marketing settings (deal text + reminder)."""
    doc = await db.marketing_settings.find_one(
        {"_id": "singleton"}, {"_id": 0}
    )
    if not doc:
        return MarketingSettings().dict()
    # Strip any leftover Mongo fields and ensure defaults
    return {
        "deal_text": doc.get("deal_text", ""),
        "deal_active": bool(doc.get("deal_active", False)),
        "reminder_enabled": bool(doc.get("reminder_enabled", False)),
        "reminder_hour": int(doc.get("reminder_hour", 10)),
        "timezone": doc.get("timezone") or "UTC"
    }


@api_router.post("/admin/marketing/settings")
async def save_marketing_settings(settings: MarketingSettings):
    """Save marketing settings (upsert singleton)."""
    await db.marketing_settings.update_one(
        {"_id": "singleton"},
        {"$set": settings.dict()},
        upsert=True
    )
    return {"success": True, **settings.dict()}


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
    sched.start()
    app.state.push_scheduler = sched
    logger.info("[push] daily-reminder scheduler started")


@app.on_event("shutdown")
async def _stop_push_scheduler():
    sched = getattr(app.state, "push_scheduler", None)
    if sched:
        sched.shutdown(wait=False)


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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()