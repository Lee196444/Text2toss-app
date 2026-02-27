from fastapi import FastAPI, APIRouter, HTTPException, Depends
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
from fastapi import UploadFile, File, Form
import aiofiles
import os
from pathlib import Path
from twilio.rest import Client
import logging
from fastapi import Request

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
        print(f"\n--- SMS SIMULATION ---")
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
        print(f"--- END SIMULATION ---\n")
        
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
        except:
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
        except:
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
def validate_pricing_logic(items: List[JunkItem], ai_price: float, ai_scale: Optional[int]) -> tuple[float, Optional[int]]:
    """
    ENHANCED validation for 100% pricing accuracy:
    1. Strict minimum pricing based on item count and size
    2. Conservative ceiling validation  
    3. Volume-based validation rules
    4. Safety margins to prevent undercharging
    """
    item_count = len(items)
    
    # Calculate estimated minimum volume based on items
    estimated_volume = 0
    for item in items:
        # Conservative volume estimates by size and type
        base_volume = {"small": 8, "medium": 25, "large": 60}
        item_volume = base_volume.get(item.size.lower(), 25) * item.quantity
        estimated_volume += item_volume
    
    # Business Rule 1: Stricter minimum pricing with volume consideration
    min_price_by_count = {
        1: 50.0,  # Single item minimum (Scale 3+) - increased for safety
        2: 65.0,  # Two items minimum (Scale 4+) 
        3: 80.0,  # Three items minimum (Scale 5+)
        4: 95.0,  # Four items minimum (Scale 6+)
        5: 115.0  # Five+ items minimum (Scale 7+)
    }
    
    # Volume-based minimum pricing (more conservative)
    volume_min_price = max(45.0, estimated_volume * 2.5)  # $2.50 per cubic foot minimum
    
    min_price = max(
        min_price_by_count.get(item_count, min_price_by_count[5]),
        volume_min_price
    )
    
    # Business Rule 2: Maximum pricing caps to prevent AI pricing inconsistencies
    max_price_by_count = {
        1: 175.0,  # Single item maximum (Scale 9)
        2: 205.0,  # Two items maximum (Scale 10)
        3: 235.0,  # Three items maximum (Scale 11)
        4: 270.0,  # Four items maximum (Scale 12)
        5: 310.0   # Five+ items maximum (Scale 13+)
    }
    
    max_price = max_price_by_count.get(item_count, 750.0)  # Scale 20 maximum
    
    # Business Rule 3: Scale level should correlate with item count
    min_scale_by_count = {
        1: 3,   # Single item: minimum Scale 3
        2: 4,   # Two items: minimum Scale 4  
        3: 5,   # Three items: minimum Scale 5
        4: 6,   # Four items: minimum Scale 6
        5: 7    # Five+ items: minimum Scale 7+
    }
    
    max_scale_by_count = {
        1: 9,   # Single item: maximum Scale 9
        2: 10,  # Two items: maximum Scale 10
        3: 11,  # Three items: maximum Scale 11
        4: 12,  # Four items: maximum Scale 12
        5: 20   # Five+ items: maximum Scale 20
    }
    
    # Validate and adjust price
    validated_price = max(min_price, min(ai_price, max_price))
    
    # Validate and adjust scale level
    min_scale = min_scale_by_count.get(item_count, min_scale_by_count[5])
    max_scale = max_scale_by_count.get(item_count, max_scale_by_count[5])
    
    if ai_scale is not None:
        validated_scale = max(min_scale, min(ai_scale, max_scale))
    else:
        # Estimate scale based on validated price
        if validated_price <= 20:
            validated_scale = 1
        elif validated_price <= 45:
            validated_scale = 2
        elif validated_price <= 70:
            validated_scale = 3
        elif validated_price <= 85:
            validated_scale = 4
        elif validated_price <= 105:
            validated_scale = 5
        elif validated_price <= 125:
            validated_scale = 6
        elif validated_price <= 150:
            validated_scale = 7
        elif validated_price <= 175:
            validated_scale = 8
        elif validated_price <= 205:
            validated_scale = 9
        elif validated_price <= 235:
            validated_scale = 10
        elif validated_price <= 270:
            validated_scale = 11
        elif validated_price <= 310:
            validated_scale = 12
        else:
            validated_scale = min(20, max(13, int(validated_price / 40)))
    
    return validated_price, validated_scale

async def calculate_ai_price(items: List[JunkItem], description: str) -> tuple[float, str, Optional[int], Optional[dict]]:
    """Use AI to analyze junk description and provide intelligent pricing for ground level/curbside pickup only"""
    
    # Prepare item descriptions for AI
    items_text = []
    for item in items:
        items_text.append(f"- {item.quantity}x {item.name} ({item.size} size)")
        if item.description:
            items_text.append(f"  Description: {item.description}")
    
    items_summary = "\n".join(items_text)
    
    # Create AI prompt for pricing analysis
    ai_prompt = f"""You are a professional junk removal pricing expert for Text2toss - a GROUND LEVEL and CURBSIDE PICKUP ONLY service in Flagstaff, AZ. 

CRITICAL ACCURACY REQUIREMENTS:
- You MUST provide consistent, accurate pricing
- NEVER underestimate - better to slightly overestimate than undercharge
- Consider ALL items in the list when calculating volume
- Use conservative volume estimates to avoid disputes

SERVICE LIMITATIONS (IMPORTANT):
- We ONLY provide ground level pickup (no stairs, no upper floors)
- Items must be accessible at ground level or placed curbside
- No basement, attic, or upper floor removals
- No carrying items up or down stairs
- If customer mentions stairs/upper floors, note they must move items first

JUNK ITEMS TO REMOVE:
{items_summary}

ADDITIONAL DETAILS:
{description}

PRICING FACTORS TO CONSIDER:
- Total volume calculation (most important factor)
- Item weight and bulkiness for ground level handling
- Material type (furniture, appliances, electronics, metal, etc.)
- Disposal costs (landfill vs recycling vs hazardous)
- Loading difficulty and time requirements
- Transportation space needed

VOLUME-BASED PRICING SCALE (Ground Level Only):
**CRITICAL**: Base pricing on TOTAL ESTIMATED CUBIC FEET, not just item count

SCALE 1: $15 - 15-gallon trash bag or smaller
SCALE 2: $20 - Small box, single small item
SCALE 3: $45-55 - Large trash bag, small electronics
SCALE 4: $55-70 - Multiple bags, small appliances
SCALE 5: $70-85 - Microwave, toaster oven sized items
SCALE 6: $85-105 - Small chair, end table
SCALE 7: $105-125 - Multiple small furniture pieces
SCALE 8: $125-150 - Office chair, small dresser
SCALE 9: $150-175 - Large chair, coffee table
SCALE 10: $175-205 - Love seat, medium dresser
SCALE 11: $205-235 - Dining table, bookshelf
SCALE 12: $235-270 - Sofa, large dresser
SCALE 13: $270-310 - Sectional sofa, wardrobe
SCALE 14: $310-355 - Bedroom set, multiple large items
SCALE 15: $355-405 - Living room set
SCALE 16: $405-460 - Multiple room furniture
SCALE 17: $460-520 - Small apartment cleanout
SCALE 18: $520-585 - Large apartment cleanout
SCALE 19: $585-655 - Small house cleanout
SCALE 20: $655-750 - Large house cleanout, estate sale items

**CRITICAL VOLUME ESTIMATION RULES:**
- Always calculate TOTAL COMBINED VOLUME of all items
- Use actual dimensions: Length × Width × Height in feet
- Common item volume references:
  * Sofa: ~8ft × 3ft × 3ft = 72 cubic feet (Scale 12-13)  
  * Dining table: ~6ft × 3ft × 3ft = 54 cubic feet (Scale 10-11)
  * Mattress: ~6ft × 4ft × 1ft = 24 cubic feet (Scale 8-9)
  * Refrigerator: ~3ft × 3ft × 6ft = 54 cubic feet (Scale 11-12)
  * Office chair: ~2ft × 2ft × 4ft = 16 cubic feet (Scale 6-7)
- For multiple similar items: multiply volume by quantity
- Add 20% buffer for irregular shapes and packing space
- NEVER underestimate - round UP to next scale level if uncertain

Additional charges may apply for:
- Hazardous materials disposal: +$25-50
- Electronic waste recycling: +$15-35 per item  
- Extra heavy items requiring special handling: +$20-40

NO service fee - price includes all ground level pickup and loading

Since this is ground level/curbside service only, there are NO charges for stairs, upper floors, or difficult access.

If the description mentions stairs, upper floors, basements, or difficult access, note in explanation that customer needs to move items to ground level/curbside first.

MANDATORY PRICING PROCESS:
1. Calculate EXACT total volume in cubic feet for ALL items combined
2. Match volume to appropriate scale level (use higher scale if between levels)
3. Start with MID-RANGE price for that scale level
4. Adjust UP (never down) based on:
   - Heavy items (+10-20%)
   - Difficult disposal materials (+15-25%)
   - Multiple trip requirements (+20-30%)
   - Electronic waste (+$15-35 per item)
5. Add mandatory additional charges when applicable
6. FINAL RULE: If total seems low, move up one scale level

CONSISTENCY REQUIREMENTS:
- Same items should always get similar pricing (±$10)
- Similar volumes should always use same scale level
- Never price below minimum for calculated volume

Respond ONLY with a JSON object in this exact format:
{{
  "total_price": 150.00,
  "scale_level": 5,
  "breakdown": {{
    "base_price": "140.00",
    "volume_assessment": "Medium load - dining room furniture",
    "items": [
      {{"name": "Dining table", "size": "large", "estimated_cost": 80.00}},
      {{"name": "4 chairs", "size": "medium", "estimated_cost": 60.00}}
    ],
    "factors": [
      "Ground level pickup only",
      "Standard disposal fees included",
      "No hazardous materials"
    ],
    "additional_charges": 10.00,
    "total": 150.00
  }},
  "explanation": "Scale 5 load (9x9x9 cubic feet) - dining table and chairs. Pricing includes ground level pickup, loading, and responsible disposal."
}}"""

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
        
        # Parse AI response
        response_text = response.strip()
        
        # Extract JSON from response (in case there's extra text)
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            response_text = json_match.group(0)
        
        pricing_data = json.loads(response_text)
        
        total_price = float(pricing_data.get("total_price", 0))
        explanation = pricing_data.get("explanation", "AI-generated pricing estimate")
        scale_level = pricing_data.get("scale_level")
        breakdown = pricing_data.get("breakdown")
        
        # CRITICAL: Validate AI pricing for accuracy and consistency
        validated_price, validated_scale = validate_pricing_logic(items, total_price, scale_level)
        
        # Additional safety checks for pricing accuracy
        price_per_item = validated_price / len(items) if items else 0
        if price_per_item < 25:  # Each item should cost at least $25 on average
            safety_price = len(items) * 30  # $30 minimum per item
            if safety_price > validated_price:
                validated_price = safety_price
                explanation += f" (Safety adjustment applied - minimum $30 per item for business sustainability)"
        
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

# Fallback basic pricing function using new 1-20 scale
def calculate_basic_price(items: List[JunkItem]) -> float:
    # Estimate scale based on items using new pricing system
    total_volume_estimate = 0
    
    # Volume estimation factors
    volume_factors = {
        "small": 1,    # Scale 1-3 equivalent
        "medium": 5,   # Scale 5-8 equivalent  
        "large": 12    # Scale 12-15 equivalent
    }
    
    for item in items:
        factor = volume_factors.get(item.size, 5)
        total_volume_estimate += factor * item.quantity
    
    # Determine scale level (1-20) using PRICING_SCALE
    if total_volume_estimate <= 1:
        scale = 1
    elif total_volume_estimate <= 2:
        scale = 2
    elif total_volume_estimate <= 3:
        scale = 3
    elif total_volume_estimate <= 4:
        scale = 4
    elif total_volume_estimate <= 5:
        scale = 5
    elif total_volume_estimate <= 7:
        scale = 7
    elif total_volume_estimate <= 10:
        scale = 10
    elif total_volume_estimate <= 15:
        scale = 12
    elif total_volume_estimate <= 20:
        scale = 15
    elif total_volume_estimate <= 30:
        scale = 17
    else:
        scale = 20
    
    # Get price range from PRICING_SCALE
    price_range = PRICING_SCALE[scale]["range"]
    
    # Use middle of price range for fallback
    return round((price_range[0] + price_range[1]) / 2, 2)

# AI Vision Analysis for Image-based Quotes
async def analyze_image_for_quote(image_path: str, description: str) -> tuple[List[JunkItem], float, str, Optional[int], Optional[dict]]:
    """Use AI vision to analyze uploaded image and identify junk items for pricing"""
    
    ai_prompt = f"""You are a professional junk removal expert with 10+ years experience analyzing customer photos for accurate pricing. This is for Text2toss - a GROUND LEVEL and CURBSIDE PICKUP ONLY service in Flagstaff, AZ.

CRITICAL ACCURACY REQUIREMENTS FOR 100% PRICING ACCURACY:
- Examine the image with extreme care and identify ALL visible items
- Count every single item you can see, including partially visible ones
- Use reference objects for scale (doors=7ft, people=6ft, cars=12-15ft long)
- Be CONSERVATIVE with pricing - overestimate rather than underestimate by 15-20%
- If unsure between two scale levels, always choose the HIGHER scale
- Look for items hidden behind others or in shadows
- Consider that piles are often deeper than they appear

BUSINESS PROTECTION RULES:
- NEVER underestimate volume - this causes customer disputes
- Add safety margin to all estimates
- If items look heavy (metal, stone, appliances), increase pricing by 20%
- Multiple trips = higher pricing (anything over truck capacity)

SERVICE LIMITATIONS (CRITICAL):
- Ground level pickup only (no stairs, no upper floors) 
- Items must be accessible at ground level or placed curbside
- Customer must move items from upper floors/basements themselves

CUSTOMER DESCRIPTION (use to identify additional items not clearly visible):
{description}

**CRITICAL**: Base pricing on TOTAL ESTIMATED CUBIC FEET, not item count
**CONSISTENCY REQUIREMENT**: Always provide the exact same analysis and pricing for identical images

SCALE 1: $15 - 15-gallon trash bag or smaller
SCALE 2: $20 - Small box, single small item
SCALE 3: $45-55 - Large trash bag, small electronics
SCALE 4: $55-70 - Multiple bags, small appliances
SCALE 5: $70-85 - Microwave, toaster oven sized items
SCALE 6: $85-105 - Small chair, end table
SCALE 7: $105-125 - Multiple small furniture pieces
SCALE 8: $125-150 - Office chair, small dresser
SCALE 9: $150-175 - Large chair, coffee table
SCALE 10: $175-205 - Love seat, medium dresser
SCALE 11: $205-235 - Dining table, bookshelf
SCALE 12: $235-270 - Sofa, large dresser
SCALE 13: $270-310 - Sectional sofa, wardrobe
SCALE 14: $310-355 - Bedroom set, multiple large items
SCALE 15: $355-405 - Living room set
SCALE 16: $405-460 - Multiple room furniture
SCALE 17: $460-520 - Small apartment cleanout
SCALE 18: $520-585 - Large apartment cleanout
SCALE 19: $585-655 - Small house cleanout
SCALE 20: $655-750 - Large house cleanout, estate sale items

**SPECIAL CONSIDERATIONS FOR OUTDOOR MATERIALS:**
- Large log piles, construction debris, landscaping waste typically Scale 15-20
- Stack height is critical - tall piles have exponentially more volume
- Use objects in photo for scale reference (people = ~6ft, cars = ~12ft long)
- When in doubt about pile size, err on the higher scale estimate

Additional charges may apply for:
- Hazardous materials disposal: +$25-50
- Electronic waste recycling: +$15-35 per item  
- Extra heavy items requiring special handling: +$20-40

PRICING PROCESS:
1. Identify all items in the image
2. Estimate combined volume using the 1-20 scale above  
3. Select appropriate price range for that scale
4. Adjust within range based on item condition, weight, disposal complexity
5. Add any applicable additional charges
6. BE CONSISTENT - same image should always get same analysis

Respond ONLY with a JSON object in this exact format:
{{
  "items": [
    {{
      "name": "item name",
      "quantity": 1,
      "size": "small/medium/large",
      "description": "brief description from image"
    }}
  ],
  "total_price": 150.00,
  "scale_level": 5,
  "breakdown": {{
    "base_price": "140.00",
    "volume_assessment": "Medium load - dining room furniture",
    "items": [
      {{"name": "Dining table", "size": "large", "estimated_cost": 80.00}},
      {{"name": "4 chairs", "size": "medium", "estimated_cost": 60.00}}
    ],
    "factors": [
      "Ground level pickup only",
      "Standard disposal fees included",
      "No hazardous materials"
    ],
    "additional_charges": 10.00,
    "total": 150.00
  }},
  "explanation": "Scale 5 load (9x9x9 cubic feet) - identified dining table and 4 chairs in image. Pricing includes ground level pickup, loading, and responsible disposal."
}}"""

    try:
        # Calculate image hash for caching consistency
        import hashlib
        with open(image_path, 'rb') as f:
            image_hash = hashlib.md5(f.read()).hexdigest()
        
        # Check cache for this image (stored in database)
        cached_quote = await db.image_cache.find_one({"image_hash": image_hash})
        if cached_quote:
            print(f"🎯 Cache HIT for image {image_hash[:8]} - returning consistent pricing")
            return (
                [JunkItem(**item) for item in cached_quote["items"]],
                cached_quote["total_price"],
                cached_quote["explanation"],
                cached_quote.get("scale_level"),
                cached_quote.get("breakdown")
            )
        
        print(f"📸 Cache MISS for image {image_hash[:8]} - generating new analysis")
        
        # Create image file content
        image_file = FileContentWithMimeType(
            file_path=image_path,
            mime_type="image/jpeg"
        )
        
        # Initialize AI chat with vision capabilities - Use latest Gemini 2.5 Flash for image analysis
        # CRITICAL: Use image hash in session_id for consistency
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=f"vision_analysis_{image_hash}",  # Use image hash for session consistency
            system_message="You are a professional junk removal expert with visual analysis capabilities. Always respond with valid JSON only. BE CONSISTENT - same image should always produce the same analysis and pricing."
        ).with_model("gemini", "gemini-2.5-flash")  # Use latest Gemini 2.5 Flash for enhanced image analysis
        
        # Send message with image
        user_message = UserMessage(
            text=ai_prompt,
            file_contents=[image_file]
        )
        
        response = await chat.send_message(user_message)
        
        # Parse AI response
        response_text = response.strip()
        
        # Extract JSON from response
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            response_text = json_match.group(0)
        
        analysis_data = json.loads(response_text)
        
        # Extract items
        items = []
        for item_data in analysis_data.get("items", []):
            items.append(JunkItem(
                name=item_data.get("name", "Unknown item"),
                quantity=item_data.get("quantity", 1),
                size=item_data.get("size", "medium"),
                description=item_data.get("description", "")
            ))
        
        total_price = float(analysis_data.get("total_price", 0))
        explanation = analysis_data.get("explanation", "AI vision analysis of uploaded image")
        scale_level = analysis_data.get("scale_level")
        breakdown = analysis_data.get("breakdown")
        
        # Cache the result for consistency
        cache_data = {
            "image_hash": image_hash,
            "items": [item.dict() for item in items],
            "total_price": total_price,
            "explanation": explanation,
            "scale_level": scale_level,
            "breakdown": breakdown,
            "cached_at": datetime.now(timezone.utc).isoformat()
        }
        
        try:
            await db.image_cache.insert_one(cache_data)
            print(f"✅ Cached analysis for image {image_hash[:8]}")
        except Exception as cache_error:
            print(f"⚠️ Failed to cache analysis: {cache_error}")
        
        return items, total_price, explanation, scale_level, breakdown
        
    except Exception as e:
        print(f"AI vision analysis error: {str(e)}")
        # Enhanced fallback - use text-based AI pricing with description if available
        if description and description.strip():
            print(f"Attempting enhanced fallback with description: {description}")
            try:
                # Create items based on description for enhanced fallback
                fallback_items = [JunkItem(name="Items from image description", quantity=1, size="large", description=description)]
                
                # Use text-based AI pricing with the description
                fallback_price, fallback_explanation, scale_level, breakdown = await calculate_ai_price(fallback_items, f"Image analysis unavailable. Based on description: {description}")
                
                print(f"Enhanced fallback successful: ${fallback_price}, scale: {scale_level}")
                return fallback_items, fallback_price, f"Image analysis temporarily unavailable. Pricing based on description: {fallback_explanation}", scale_level, breakdown
                
            except Exception as text_ai_error:
                print(f"Text-based fallback also failed: {str(text_ai_error)}")
        else:
            print(f"No description provided for enhanced fallback: '{description}'")
        
        # Basic fallback if description-based pricing also fails
        print("Using basic fallback pricing")
        fallback_items = [JunkItem(name="Unidentified items from image", quantity=1, size="medium")]
        fallback_price = 75.0
        fallback_explanation = "Image analysis temporarily unavailable. Basic estimate provided - please describe items for accurate pricing."
        return fallback_items, fallback_price, fallback_explanation, None, None

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

@api_router.post("/quotes/image", response_model=PriceQuote)
async def create_quote_from_image(
    file: UploadFile = File(...),
    description: str = Form(default="")
):
    """Create quote by analyzing uploaded image with AI vision"""
    
    print(f"Image quote endpoint received description: '{description}'")
    
    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # Create uploads directory in static folder for persistent storage
    temp_uploads_dir = Path("/app/static/temp_uploads")
    temp_uploads_dir.mkdir(parents=True, exist_ok=True)
    
    # Save uploaded file to accessible location
    file_extension = Path(file.filename).suffix or '.jpg'
    temp_filename = f"temp_{uuid.uuid4()}{file_extension}"
    file_path = temp_uploads_dir / temp_filename
    
    try:
        # Save uploaded file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Analyze image with AI
        items, total_price, ai_explanation, scale_level, breakdown = await analyze_image_for_quote(str(file_path), description)
        
        # Determine if quote requires approval (Scale 9-20)
        requires_approval = scale_level is not None and scale_level >= 9
        approval_status = "pending_approval" if requires_approval else "auto_approved"
        
        # If quote requires approval, copy image to permanent location
        image_path_to_store = str(file_path)
        if requires_approval:
            try:
                # Create permanent approval quotes directory
                approval_dir = Path("/app/static/approval_quotes")
                approval_dir.mkdir(parents=True, exist_ok=True)
                
                # Verify source file exists
                if not file_path.exists():
                    logger.error(f"Source temp file does not exist: {file_path}")
                    raise Exception(f"Source file not found: {file_path}")
                
                # Copy to permanent location
                permanent_filename = f"approval_{uuid.uuid4()}{file_extension}"
                permanent_path = approval_dir / permanent_filename
                
                import shutil
                shutil.copy2(str(file_path), str(permanent_path))
                
                # Verify copy was successful
                if not permanent_path.exists():
                    logger.error(f"Failed to copy file to: {permanent_path}")
                    raise Exception(f"File copy failed: {permanent_path}")
                
                image_path_to_store = str(permanent_path)
                logger.info(f"✅ Successfully copied approval image: {file_path.name} -> {permanent_path.name}")
                
            except Exception as copy_error:
                logger.error(f"❌ Failed to copy approval image: {str(copy_error)}")
                # Fall back to temp path if copy fails
                logger.warning(f"Using temp path as fallback: {file_path}")
                image_path_to_store = str(file_path)
        
        # Create quote with image path
        quote = PriceQuote(
            user_id="anonymous",
            items=items,
            total_price=total_price,
            scale_level=scale_level,
            breakdown=breakdown,
            description=f"Image analysis: {description}" if description else "Image-based quote",
            ai_explanation=ai_explanation,
            temp_image_path=image_path_to_store,  # Store permanent path for approval quotes
            requires_approval=requires_approval,
            approval_status=approval_status
        )
        
        quote_mongo = prepare_for_mongo(quote.dict())
        await db.quotes.insert_one(quote_mongo)
        
        return quote
        
    except Exception as e:
        # Clean up temporary file on error
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

@api_router.post("/bookings", response_model=Booking)
async def create_booking(booking_data: BookingCreate, token: str = None):
    user_id = "anonymous"
    if token:
        try:
            user_id = await get_current_user(token)
        except:
            pass
    
    # Verify quote exists
    quote_doc = await db.quotes.find_one({"id": booking_data.quote_id})
    if not quote_doc:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    # Parse pickup datetime
    pickup_datetime = datetime.fromisoformat(booking_data.pickup_date)
    
    # Validate pickup date (Monday-Thursday only)
    day_of_week = pickup_datetime.weekday()  # 0=Monday, 6=Sunday
    if day_of_week > 3:  # Thursday is 3
        raise HTTPException(
            status_code=400, 
            detail="Pickup not available on Fridays or weekends. Please select Monday-Thursday."
        )
    
    # Check if time slot is already booked
    existing_booking = await db.bookings.find_one({
        "pickup_date": {
            "$regex": f"^{booking_data.pickup_date}"
        },
        "pickup_time": booking_data.pickup_time,
        "status": {"$in": ["scheduled", "in_progress"]}
    })
    
    if existing_booking:
        raise HTTPException(
            status_code=409, 
            detail=f"Time slot {booking_data.pickup_time} is already booked for {booking_data.pickup_date}"
        )
    
    # Handle image preservation if quote had an image
    permanent_image_path = None
    if quote_doc.get("temp_image_path"):
        try:
            # Create permanent storage directory
            permanent_dir = Path("/app/backend/static/booking_images")
            permanent_dir.mkdir(parents=True, exist_ok=True)
            
            temp_path = Path(quote_doc["temp_image_path"])
            if temp_path.exists():
                # Move image to permanent storage
                permanent_filename = f"booking_{booking_data.quote_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}{temp_path.suffix}"
                permanent_path = permanent_dir / permanent_filename
                
                # Copy file to permanent location
                import shutil
                shutil.move(str(temp_path), str(permanent_path))
                permanent_image_path = str(permanent_path)
                
        except Exception as e:
            print(f"Error preserving image: {str(e)}")
            # Don't fail booking if image handling fails
    
    # Set status based on whether quote requires approval
    booking_status = "pending_customer_approval" if quote_doc.get("requires_approval", False) else "pending_payment"
    
    booking = Booking(
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
        image_path=permanent_image_path,
        status=booking_status
    )
    
    booking_mongo = prepare_for_mongo(booking.dict())
    await db.bookings.insert_one(booking_mongo)
    
    # Check if quote requires approval
    quote_requires_approval = quote_doc.get("requires_approval", False)
    logging.info(f"Booking created: {booking.id}, Quote ID: {booking.quote_id}, Requires Approval: {quote_requires_approval}, Email: {booking.email}")
    
    # Send admin notification email for new booking
    if is_email_enabled():
        try:
            admin_email = os.environ.get('EMAIL_FROM', 'text2toss@gmail.com')
            admin_email_subject = f"🔔 New Booking Received - ${quote_doc.get('total_price', 0):.2f}"
            admin_email_html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }}
                    .header {{ background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                    .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
                    .booking-details {{ background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border: 2px solid #10b981; }}
                    .detail-row {{ padding: 10px 0; border-bottom: 1px solid #e5e7eb; }}
                    .detail-label {{ font-weight: bold; color: #374151; }}
                    .detail-value {{ color: #1f2937; }}
                    .status-badge {{ display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: 600; }}
                    .approval-required {{ background: #fef3c7; color: #92400e; border: 2px solid #f59e0b; }}
                    .ready-to-pay {{ background: #d1fae5; color: #065f46; border: 2px solid #10b981; }}
                    .action-button {{ display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div style="font-size: 48px; margin-bottom: 10px;">🔔</div>
                        <h1 style="margin: 0;">New Booking Received!</h1>
                        <p style="margin: 10px 0 0 0; opacity: 0.95;">Action may be required</p>
                    </div>
                    <div class="content">
                        <div class="booking-details">
                            <h2 style="margin-top: 0; color: #10b981;">Booking Information</h2>
                            
                            <div class="detail-row">
                                <span class="detail-label">Status:</span>
                                <span class="status-badge {'approval-required' if quote_requires_approval else 'ready-to-pay'}">
                                    {'⏳ PENDING APPROVAL' if quote_requires_approval else '💳 READY FOR PAYMENT'}
                                </span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">Customer Email:</span>
                                <span class="detail-value">{booking.email}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">Phone:</span>
                                <span class="detail-value">{booking.phone}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">Address:</span>
                                <span class="detail-value">{booking.address}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">Pickup Date:</span>
                                <span class="detail-value">{booking.pickup_date.strftime('%B %d, %Y')}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">Pickup Time:</span>
                                <span class="detail-value">{booking.pickup_time}</span>
                            </div>
                            
                            <div class="detail-row">
                                <span class="detail-label">Quote Amount:</span>
                                <span class="detail-value" style="font-size: 24px; font-weight: bold; color: #10b981;">${quote_doc.get('total_price', 0):.2f}</span>
                            </div>
                            
                            {f'<div class="detail-row"><span class="detail-label">Special Instructions:</span><span class="detail-value">{booking.special_instructions}</span></div>' if booking.special_instructions else ''}
                            
                            <div class="detail-row" style="border-bottom: none;">
                                <span class="detail-label">Curbside Confirmed:</span>
                                <span class="detail-value">{'✅ Yes' if booking.curbside_confirmed else '❌ No'}</span>
                            </div>
                        </div>
                        
                        {'<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px;"><strong>⚠️ Action Required:</strong> This quote requires your approval before the customer can proceed with payment. Review and approve/reject in the admin dashboard.</div>' if quote_requires_approval else '<div style="background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 5px;"><strong>✅ Ready:</strong> Customer can proceed with payment. Booking will appear on your schedule once payment is confirmed.</div>'}
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <p style="color: #6b7280; font-size: 14px; margin: 0;">Booking ID: {booking.id}</p>
                            <p style="color: #6b7280; font-size: 12px; margin-top: 5px;">Received: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
            """
            
            await send_email(admin_email, admin_email_subject, admin_email_html)
            logging.info(f"Admin notification email sent to {admin_email} for booking {booking.id}")
        except Exception as admin_email_error:
            logging.error(f"Failed to send admin notification email: {str(admin_email_error)}")
            # Don't fail booking if admin email fails
    
    # Send appropriate email based on approval status
    if is_email_enabled() and booking.email:
        logging.info(f"Email enabled, attempting to send email to {booking.email}")
        if quote_requires_approval:
            logging.info(f"Quote requires approval - sending 'Under Review' email")
            # Send "Under Review" email for quotes needing approval
            email_html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #333; background-color: #f5f5f5; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }}
                    .header {{ background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                    .content {{ background: #ffffff; padding: 40px 30px; }}
                    .highlight {{ background: #dbeafe; border-left: 4px solid #3b82f6; padding: 20px; margin: 25px 0; border-radius: 5px; }}
                    .info-box {{ background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; margin: 20px 0; border-radius: 8px; }}
                    .steps {{ background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0; border-radius: 5px; }}
                    .details {{ background: #f9fafb; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #e5e7eb; }}
                    .footer {{ text-align: center; color: #6b7280; font-size: 14px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }}
                    h1 {{ margin: 0; font-size: 28px; }}
                    h2 {{ color: #1f2937; font-size: 20px; margin-top: 0; }}
                    h3 {{ color: #374151; font-size: 18px; margin-bottom: 15px; }}
                    .status {{ display: inline-block; background: #3b82f6; color: white; padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div style="font-size: 48px; margin-bottom: 10px;">✓</div>
                        <h1>Quote Successfully Submitted</h1>
                        <p style="margin: 15px 0 0 0; opacity: 0.95; font-size: 16px;">Thank you for choosing Text2toss Junk Removal</p>
                    </div>
                    <div class="content">
                        <p style="font-size: 16px; margin-bottom: 20px;">Dear Valued Customer,</p>
                        
                        <p>Thank you for submitting your junk removal quote request. Your quote is currently <span class="status">Under Review</span> by our professional team.</p>
                        
                        <div class="highlight">
                            <h3 style="margin-top: 0; color: #1e40af;">📧 Response Timeline</h3>
                            <p style="margin: 0; font-size: 15px;">You will receive an email response with your <strong>approved quote within 24 hours</strong>. Our team is carefully reviewing your requirements to ensure accurate pricing.</p>
                        </div>
                        
                        <div class="details">
                            <h3>Your Quote Request Details:</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0; font-weight: 600; color: #4b5563;">Quote ID:</td>
                                    <td style="padding: 8px 0; color: #1f2937; font-family: monospace; background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">{booking.quote_id}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; font-weight: 600; color: #4b5563;">Pickup Date:</td>
                                    <td style="padding: 8px 0; color: #1f2937;">{booking.pickup_date.strftime('%B %d, %Y')}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; font-weight: 600; color: #4b5563;">Pickup Time:</td>
                                    <td style="padding: 8px 0; color: #1f2937;">{booking.pickup_time}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; font-weight: 600; color: #4b5563;">Service Address:</td>
                                    <td style="padding: 8px 0; color: #1f2937;">{booking.address}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; font-weight: 600; color: #4b5563;">Estimated Price:</td>
                                    <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">${quote_doc.get('total_price', 0):.2f} <span style="font-size: 13px; color: #6b7280; font-weight: normal;">(subject to review)</span></td>
                                </tr>
                            </table>
                        </div>
                        
                        <div class="steps">
                            <h3 style="margin-top: 0; color: #92400e;">📋 Next Steps - What to Expect</h3>
                            <ol style="margin: 10px 0 0 0; padding-left: 20px;">
                                <li style="margin-bottom: 12px; color: #1f2937;"><strong>Quote Review:</strong> Our team will assess your requirements and finalize pricing.</li>
                                <li style="margin-bottom: 12px; color: #1f2937;"><strong>Email Notification:</strong> You will receive your approved quote via email within 24 hours.</li>
                                <li style="margin-bottom: 12px; color: #1f2937;"><strong>Step 3 - Payment:</strong> Once you receive and approve the quote, you will complete the payment step to confirm your booking.</li>
                                <li style="margin-bottom: 0; color: #1f2937;"><strong>Booking Confirmed:</strong> After payment, your junk removal service will be officially scheduled.</li>
                            </ol>
                        </div>
                        
                        <div class="info-box">
                            <p style="margin: 0; font-size: 15px;"><strong>💡 Important:</strong> No payment is required at this time. You will only be charged <strong>after</strong> you review and approve the final quote. Your booking will be confirmed once Step 3 (Payment) is completed.</p>
                        </div>
                        
                        <p style="margin-top: 30px;">If you have any questions or need to make changes to your request, please feel free to contact us. We're here to help!</p>
                        
                        <p style="margin-top: 25px; color: #4b5563;">Best regards,<br>
                        <strong style="color: #1f2937;">The Text2toss Team</strong></p>
                        
                        <div class="footer">
                            <p style="margin-bottom: 10px;"><strong>Text2toss Junk Removal</strong></p>
                            <p style="margin: 5px 0; color: #9ca3af;">Professional • Reliable • Eco-Friendly</p>
                            <p style="margin: 15px 0 0 0; font-size: 13px; color: #9ca3af;">Thank you for choosing our service!</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
            """
            email_result = await send_email(
                to_email=booking.email,
                subject="✓ Quote Submitted - Under Review | Text2toss",
                html_content=email_html
            )
            logging.info(f"Quote under review email sent to {booking.email}: {email_result}")
        else:
            logging.info(f"Quote auto-approved - sending standard booking confirmation")
            # Send standard booking confirmation email for auto-approved quotes
            email_html = create_booking_confirmation_email(booking.dict(), quote_doc)
            email_result = await send_email(
                to_email=booking.email,
                subject=f"🎉 Booking Confirmed - {booking.pickup_date.strftime('%B %d, %Y')}",
                html_content=email_html
            )
            logging.info(f"Booking confirmation email sent to {booking.email}: {email_result}")
    else:
        if not is_email_enabled():
            logging.warning(f"Email NOT sent - email is disabled in environment")
        if not booking.email:
            logging.warning(f"Email NOT sent - no email address provided for booking {booking.id}")
    
    # Optional: Send SMS if enabled
    if is_sms_enabled():
        phone = booking.phone.replace('(', '').replace(')', '').replace(' ', '').replace('-', '')
        if phone and not phone.startswith('+'):
            phone = '+1' + phone
        
        if phone:
            pickup_date_str = booking.pickup_date.strftime('%B %d, %Y')
            confirmation_message = f"✅ Text2toss Confirmed: Junk removal scheduled for {pickup_date_str} between {booking.pickup_time} at {booking.address}. Check your email for details!"
            
            sms_result = await send_sms(phone, confirmation_message)
            logging.info(f"Booking confirmation SMS sent: {sms_result}")
    
    return booking

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
            
        # Create Booking object without quote_details field for validation
        clean_booking_data = {k: v for k, v in booking_data.items() if k != "quote_details"}
        booking_obj = Booking(**clean_booking_data)
        
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
    
    # If marking as completed, add completion timestamp
    if new_status == "completed":
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.bookings.update_one(
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
    completion_note: str = ""
):
    """Upload completion photo and note for a booking"""
    
    # Verify booking exists and is completed
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Can only add completion photos to completed bookings")
    
    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    # Create completion photos directory
    completion_dir = Path("/app/backend/static/completion_photos")
    completion_dir.mkdir(parents=True, exist_ok=True)
    
    # Save completion photo
    file_extension = Path(file.filename).suffix or '.jpg'
    photo_filename = f"completion_{booking_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}{file_extension}"
    photo_path = completion_dir / photo_filename
    
    try:
        # Save uploaded file
        async with aiofiles.open(photo_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Update booking with completion photo and note
        update_data = {
            "completion_photo_path": str(photo_path),
            "completion_note": completion_note
        }
        
        result = await db.bookings.update_one(
            {"id": booking_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Send SMS with completion photo
        phone = booking.get('phone', '').replace('(', '').replace(')', '').replace(' ', '').replace('-', '')
        if phone and not phone.startswith('+'):
            phone = '+1' + phone  # Assume US number if no country code
        
        if phone:
            # Create public URL for the image accessible by SMS
            backend_url = os.environ.get('REACT_APP_BACKEND_URL')
            photo_url = f"{backend_url}/api/public/completion-photo/{booking_id}"
            
            completion_message = f"📸 Text2toss Complete: Your junk has been removed from {booking['address']}. "
            if completion_note:
                completion_message += f"Note: {completion_note} "
            completion_message += "See attached photo of the cleaned area!"
            
            # Only send SMS if customer opted in for notifications
            if booking.get('sms_notifications', False):
                sms_result = await send_sms(phone, completion_message, photo_url)
                logging.info(f"Completion SMS sent for booking {booking_id}: {sms_result}")
            else:
                logging.info(f"Completion SMS not sent for booking {booking_id}: Customer opted out of notifications")
        
        return {
            "message": "Completion photo uploaded and customer notified with photo",
            "photo_path": str(photo_path),
            "completion_note": completion_note
        }
        
    except Exception as e:
        # Clean up file on error
        if photo_path.exists():
            photo_path.unlink()
        raise e

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
    """Clean up temporary images older than 4 days that weren't booked"""
    import time
    
    temp_dir = Path("/app/static/temp_uploads")
    if not temp_dir.exists():
        return {"message": "No temporary directory found"}
    
    cleaned_count = 0
    cutoff_time = time.time() - (4 * 24 * 60 * 60)  # 4 days ago (96 hours)
    
    for file_path in temp_dir.glob("temp_*"):
        if file_path.is_file() and file_path.stat().st_mtime < cutoff_time:
            try:
                file_path.unlink()
                cleaned_count += 1
                logger.info(f"Cleaned up old temp image: {file_path.name}")
            except Exception as e:
                logger.error(f"Failed to delete {file_path.name}: {str(e)}")
    
    return {"message": f"Cleaned up {cleaned_count} temporary images older than 4 days"}

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
    """Approve or reject a quote"""
    try:
        quote = await db.quotes.find_one({"id": quote_id})
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        if quote.get("approval_status") not in ["pending_approval"]:
            raise HTTPException(status_code=400, detail="Quote is not pending approval")
        
        # Prepare update data
        update_data = {
            "approval_status": "approved" if approval_action.action == "approve" else "rejected",
            "admin_notes": approval_action.admin_notes,
            "approved_by": "admin",  # You can enhance this with actual admin user
            "approved_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Handle price adjustments and customer approval requirements
        original_price = quote.get("total_price", 0)
        
        if approval_action.approved_price is not None:
            update_data["approved_price"] = approval_action.approved_price
            
            # If price is increased, require customer approval
            if approval_action.approved_price > original_price:
                # Find any existing booking for this quote
                existing_booking = await db.bookings.find_one({"quote_id": quote_id})
                
                if existing_booking:
                    # Generate approval token for customer
                    approval_token = str(uuid.uuid4())
                    
                    # Update booking to require customer approval
                    booking_update = {
                        "status": "pending_customer_approval",
                        "original_price": original_price,
                        "adjusted_price": approval_action.approved_price,
                        "price_adjustment_reason": approval_action.admin_notes or "Price adjustment by admin",
                        "customer_approval_token": approval_token,
                        "requires_customer_approval": True
                    }
                    
                    await db.bookings.update_one(
                        {"id": existing_booking["id"]},
                        {"$set": booking_update}
                    )
                    
                    # Send SMS notification to customer about price change
                    try:
                        price_increase = approval_action.approved_price - original_price
                        backend_url = os.environ.get('REACT_APP_BACKEND_URL')
                        approval_url = f"{backend_url}/customer-approval/{approval_token}"
                        
                        message = f"""🔔 Text2toss Price Update
                        
Your quote has been updated from ${original_price:.2f} to ${approval_action.approved_price:.2f} (+${price_increase:.2f}).

Reason: {approval_action.admin_notes or 'Price adjustment after review'}

Please review and approve: {approval_url}

Your job is on hold until you approve the new price."""
                        
                        await send_sms(existing_booking["phone"], message)
                        
                        # Update status to reflect customer notification sent
                        update_data["approval_status"] = "approved_pending_customer"
                        
                    except Exception as sms_error:
                        logger.error(f"Failed to send price change notification: {str(sms_error)}")
        
        # Update quote
        await db.quotes.update_one(
            {"id": quote_id},
            {"$set": update_data}
        )
        
        # Send email notification to customer
        if is_email_enabled():
            # Check if there's a booking for this quote to get customer email
            booking = await db.bookings.find_one({"quote_id": quote_id})
            
            if booking and booking.get("email"):
                customer_email = booking.get("email")
                customer_name = booking.get("name", "Valued Customer")
                
                try:
                    if approval_action.action == "approve":
                        # Send approval email
                        approved_price = approval_action.approved_price or quote.get("total_price")
                        
                        email_subject = "✅ Your Quote Has Been Approved - Text2toss"
                        email_html = f"""
                        <!DOCTYPE html>
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
                            </style>
                        </head>
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
                                        <div style="font-size: 16px; color: #059669; font-weight: 600;">
                                            {'Updated Price (Admin Adjusted)' if approval_action.approved_price and approval_action.approved_price != quote.get("total_price") else 'Approved Quote'}
                                        </div>
                                        <div class="price">${approved_price:.2f}</div>
                                        {f'<div style="font-size: 14px; color: #6b7280; margin-top: 10px;"><s>Original: ${quote.get("total_price"):.2f}</s></div>' if approval_action.approved_price and approval_action.approved_price != quote.get("total_price") else ''}
                                    </div>
                                    
                                    {f'<div class="info-box"><strong>Admin Notes:</strong><br>{approval_action.admin_notes}</div>' if approval_action.admin_notes else ''}
                                    
                                    <div class="info-box">
                                        <h3 style="margin-top: 0; color: #059669;">✅ Ready to Complete Your Booking!</h3>
                                        <p style="margin: 10px 0;">Your quote is approved and ready for payment. Click the button below to complete your booking and confirm your pickup date.</p>
                                    </div>
                                    
                                    <div style="text-align: center; margin: 30px 0;">
                                        <a href="{os.environ.get('REACT_APP_BACKEND_URL', 'https://junkai-platform.emergent.host')}" class="cta-button" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 16px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 18px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
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
                        </html>
                        """
                        
                        await send_email(customer_email, email_subject, email_html)
                        logging.info(f"Approval email sent to {customer_email}")
                        
                    else:  # reject
                        # Send rejection email
                        email_subject = "Quote Decision - Text2toss"
                        email_html = f"""
                        <!DOCTYPE html>
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
                            </style>
                        </head>
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
                                    
                                    {f'<div class="info-box"><strong>Reason:</strong><br>{approval_action.admin_notes}</div>' if approval_action.admin_notes else ''}
                                    
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
                        </html>
                        """
                        
                        await send_email(customer_email, email_subject, email_html)
                        logging.info(f"Rejection email sent to {customer_email}")
                        
                except Exception as email_error:
                    logging.error(f"Failed to send approval/rejection email: {str(email_error)}")
                    # Don't fail the approval process if email fails
        
        # Get updated quote for response
        updated_quote = await db.quotes.find_one({"id": quote_id})
        if "_id" in updated_quote:
            del updated_quote["_id"]
        updated_quote = parse_from_mongo(updated_quote)
        
        return {
            "message": f"Quote {approval_action.action}d successfully",
            "quote": updated_quote
        }
        
    except Exception as e:
        logger.error(f"Error approving quote: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to process quote approval")

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
    """Secure admin username/password authentication"""
    try:
        # Get admin user from database
        admin_user = await db.admin_users.find_one({"username": login_data.username})
        
        if not admin_user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Verify password
        if not pwd_context.verify(login_data.password, admin_user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Create admin session token with user info
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
        
        return {
            "success": True, 
            "token": admin_token, 
            "message": "Login successful",
            "display_name": admin_user["display_name"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin login error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid credentials")

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
async def verify_admin_token(token: str = None):
    """Verify admin token"""
    if not token:
        raise HTTPException(status_code=401, detail="No token provided")
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("admin"):
            return {"valid": True}
        else:
            raise HTTPException(status_code=401, detail="Invalid admin token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid admin token")

@api_router.post("/admin/send-bulk-email-reminder")
async def send_bulk_email_reminder(token: str = Depends(verify_admin_token)):
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
async def send_booking_confirmation_email_admin(booking_id: str, token: str = Depends(verify_admin_token)):
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
        
        amount = quote_doc.get("total_price", 0)
        venmo_qr_url = "https://www.paypal.com/qrcodes/venmocs/9f1f97dd-23ed-4676-82b5-3fc2126def65?created=1762118921"
        
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
    message: str,
    token: str = Depends(verify_admin_token)
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
async def optimize_route(token: str = Depends(verify_admin_token)):
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
async def get_all_bookings(token: str = Depends(verify_admin_token)):
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
    """Upload a photo to the gallery"""
    try:
        # Read and save the uploaded file
        contents = await photo.read()
        
        # Create unique filename
        file_extension = photo.filename.split('.')[-1] if '.' in photo.filename else 'jpg'
        filename = f"gallery_{uuid.uuid4()}.{file_extension}"
        
        # Save to static directory
        file_path = f"/app/static/gallery/{filename}"
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, "wb") as f:
            f.write(contents)
        
        # Create URL for the photo - use API endpoint for reliable serving
        backend_url = os.environ.get('REACT_APP_BACKEND_URL')
        photo_url = f"{backend_url}/api/images/gallery/{filename}"
        
        # Save to database
        photo_doc = {
            "url": photo_url,
            "filename": filename,
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        await db.gallery_photos.insert_one(photo_doc)
        
        return {"message": "Photo uploaded successfully", "url": photo_url}
        
    except Exception as e:
        logger.error(f"Failed to upload photo: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to upload photo")

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

@api_router.delete("/admin/gallery-photo")
async def remove_gallery_photo(request: dict):
    """Remove a photo from the gallery"""
    try:
        photo_url = request.get("photo_url")
        
        # Remove from database
        result = await db.gallery_photos.delete_one({"url": photo_url})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Photo not found")
        
        # Try to remove file from filesystem
        try:
            if photo_url.startswith("/static/gallery/") or photo_url.startswith("/files/gallery/"):
                # Convert to actual file path
                if photo_url.startswith("/static/gallery/"):
                    file_path = f"/app{photo_url}"
                elif photo_url.startswith("/files/gallery/"):
                    file_path = f"/app/static{photo_url.replace('/files', '')}"
                else:
                    backend_url = os.environ.get('REACT_APP_BACKEND_URL')
                    file_path = photo_url.replace(f"{backend_url}/files", "/app/static")
                
                if os.path.exists(file_path):
                    os.remove(file_path)
        except Exception as file_error:
            logger.warning(f"Failed to remove file {photo_url}: {str(file_error)}")
        
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
    from fastapi.responses import FileResponse
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
            message = f"""❌ Text2toss: Booking Cancelled
            
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
async def export_job_contacts(token: str = Depends(verify_admin_token)):
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

# Include the router in the main app
app.include_router(api_router)

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