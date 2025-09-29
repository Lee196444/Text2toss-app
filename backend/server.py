from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
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

# Mount static files for photo serving
app.mount("/static", StaticFiles(directory="/app/static"), name="static")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

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
    special_instructions: Optional[str] = None
    curbside_confirmed: bool = False
    sms_notifications: bool = False
    status: str = "scheduled"  # scheduled, in_progress, completed, cancelled
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    quote_details: Optional[PriceQuote] = None
    image_path: Optional[str] = None  # Path to customer's uploaded image
    completion_photo_path: Optional[str] = None  # Path to completion photo
    completion_note: Optional[str] = None  # Admin note for completion
    completed_at: Optional[datetime] = None  # When job was completed

class BookingCreate(BaseModel):
    quote_id: str
    pickup_date: str
    pickup_time: str
    address: str
    phone: str
    special_instructions: Optional[str] = None
    curbside_confirmed: bool = False
    sms_notifications: bool = False
    
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
    approved_price: Optional[float] = None  # Admin can adjust price

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
    ai_prompt = f"""You are a professional junk removal pricing expert for a GROUND LEVEL and CURBSIDE PICKUP ONLY service. Analyze the following junk removal request and provide an accurate price estimate.

IMPORTANT SERVICE LIMITATIONS:
- We ONLY provide ground level pickup (no stairs, no upper floors)
- Items must be accessible at ground level or placed curbside
- No basement, attic, or upper floor removals
- No carrying items up or down stairs

JUNK ITEMS TO REMOVE:
{items_summary}

ADDITIONAL DETAILS:
{description}

Please consider these factors in your pricing:
- Item size and weight (for ground level handling)
- Material type (furniture, appliances, electronics, etc.)
- Basic disassembly if needed (simple removal)
- Disposal and recycling costs
- Transportation needs

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

**VOLUME ESTIMATION GUIDANCE:**
- For PILES/STACKS: Estimate length × width × height in feet
- Large outdoor materials (logs, debris) typically Scale 15-20
- Use descriptive terms like "large pile", "massive stack" to indicate high volume

Additional charges may apply for:
- Hazardous materials disposal: +$25-50
- Electronic waste recycling: +$15-35 per item  
- Extra heavy items requiring special handling: +$20-40

NO service fee - price includes all ground level pickup and loading

Since this is ground level/curbside service only, there are NO charges for stairs, upper floors, or difficult access.

If the description mentions stairs, upper floors, basements, or difficult access, note in explanation that customer needs to move items to ground level/curbside first.

PRICING PROCESS:
1. Estimate total volume using the 1-20 scale above
2. Select appropriate price range for that scale
3. Adjust within range based on item condition, weight, disposal complexity
4. Add any applicable additional charges

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
        
        return total_price, explanation, scale_level, breakdown
        
    except Exception as e:
        print(f"AI pricing error: {str(e)}")
        # Fallback to basic pricing if AI fails
        fallback_price = calculate_basic_price(items)
        fallback_breakdown = {
            "base_price": f"{fallback_price:.2f}",
            "volume_assessment": f"Estimated {len(items)} items",
            "items": [{"name": item.name, "size": item.size, "estimated_cost": fallback_price / len(items)} for item in items],
            "factors": ["Ground level pickup included", "Standard rates applied", "AI analysis unavailable"],
            "additional_charges": 0,
            "total": fallback_price
        }
        return fallback_price, "Basic pricing applied (AI temporarily unavailable)", 3, fallback_breakdown

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
    
    ai_prompt = f"""You are a professional junk removal expert analyzing an image to provide accurate quotes. Analyze this image and identify all removable items.

ADDITIONAL CONTEXT FROM USER:
{description}

IMPORTANT SERVICE LIMITATIONS:
- We ONLY provide ground level pickup (no stairs, no upper floors)
- Items must be accessible at ground level or placed curbside

CRITICAL VOLUME ASSESSMENT INSTRUCTIONS:
1. CAREFULLY estimate the total cubic footage of ALL materials in the image
2. For PILES, STACKS, or OUTDOOR MATERIALS: Measure length × width × height to estimate total volume
3. For LARGE PILES (like logs, debris, construction materials): These often represent Scale 15-20 loads
4. Use REFERENCE OBJECTS (people, cars, houses, tools) in the image to gauge true scale
5. Consider that outdoor piles often appear smaller than they actually are

VOLUME-BASED PRICING SCALE (Ground Level Only):
**CRITICAL**: Base pricing on TOTAL ESTIMATED CUBIC FEET, not item count

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
        # Create image file content
        image_file = FileContentWithMimeType(
            file_path=image_path,
            mime_type="image/jpeg"
        )
        
        # Initialize AI chat with vision capabilities - Use latest Gemini 2.5 Flash for image analysis
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=f"vision_analysis_{datetime.now().timestamp()}",
            system_message="You are a professional junk removal expert with visual analysis capabilities. Always respond with valid JSON only."
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
    
    # Create temporary and permanent directories
    temp_uploads_dir = Path("/tmp/temp_uploads")
    temp_uploads_dir.mkdir(exist_ok=True)
    
    # Save uploaded file temporarily (will be moved to permanent storage only if booked)
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
        requires_approval = scale_level and scale_level >= 9
        approval_status = "pending_approval" if requires_approval else "auto_approved"
        
        # Create quote with temporary image path
        quote = PriceQuote(
            user_id="anonymous",
            items=items,
            total_price=total_price,
            scale_level=scale_level,
            breakdown=breakdown,
            description=f"Image analysis: {description}" if description else "Image-based quote",
            ai_explanation=ai_explanation,
            temp_image_path=str(file_path),  # Store temp path, will be moved when booked
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
    
    booking = Booking(
        user_id=user_id,
        quote_id=booking_data.quote_id,
        pickup_date=pickup_datetime,
        pickup_time=booking_data.pickup_time,
        address=booking_data.address,
        phone=booking_data.phone,
        special_instructions=booking_data.special_instructions,
        curbside_confirmed=booking_data.curbside_confirmed,
        sms_notifications=booking_data.sms_notifications,
        image_path=permanent_image_path
    )
    
    booking_mongo = prepare_for_mongo(booking.dict())
    await db.bookings.insert_one(booking_mongo)
    
    # Send confirmation SMS
    phone = booking.phone.replace('(', '').replace(')', '').replace(' ', '').replace('-', '')
    if phone and not phone.startswith('+'):
        phone = '+1' + phone  # Assume US number if no country code
    
    if phone:
        pickup_date_str = booking.pickup_date.strftime('%B %d, %Y')
        confirmation_message = f"✅ Text2toss Confirmed: Junk removal scheduled for {pickup_date_str} between {booking.pickup_time} at {booking.address}. We'll text you updates!"
        
        sms_result = await send_sms(phone, confirmation_message)
        logging.info(f"Booking confirmation SMS sent: {sms_result}")
    
    return booking

@api_router.get("/bookings", response_model=List[Booking])
async def get_bookings(token: str = None):
    user_id = await get_current_user(token) if token else "anonymous"
    
    bookings = await db.bookings.find({"user_id": user_id}).to_list(1000)
    return [Booking(**parse_from_mongo(booking)) for booking in bookings]

@api_router.get("/admin/daily-schedule")
async def get_daily_schedule(date: str = None):
    """Get all bookings for a specific date (YYYY-MM-DD format) or today if no date specified"""
    if date is None:
        target_date = datetime.now(timezone.utc).date()
    else:
        target_date = datetime.fromisoformat(date).date()
    
    # Find bookings for the target date - match date part of pickup_date
    target_date_str = target_date.strftime("%Y-%m-%d")
    
    bookings = await db.bookings.find({
        "pickup_date": {
            "$regex": f"^{target_date_str}"
        }
    }).sort("pickup_time", 1).to_list(1000)
    
    result = []
    for booking in bookings:
        # Remove MongoDB _id field to avoid serialization issues
        if "_id" in booking:
            del booking["_id"]
        booking_data = parse_from_mongo(booking)
        
        # Add quote details to booking
        quote = await db.quotes.find_one({"id": booking_data["quote_id"]})
        if quote:
            if "_id" in quote:
                del quote["_id"]
            booking_data["quote_details"] = parse_from_mongo(quote)
            
        # Create Booking object without quote_details field for validation
        clean_booking_data = {k: v for k, v in booking_data.items() if k != "quote_details"}
        booking_obj = Booking(**clean_booking_data)
        
        result.append(booking_data)  # Return raw data instead of Pydantic object
    
    return result

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
    
    # Get all bookings and filter in Python since dates are stored as strings
    all_bookings = await db.bookings.find().to_list(1000)
    bookings = []
    
    for booking in all_bookings:
        pickup_date_str = booking.get("pickup_date", "")
        if pickup_date_str:
            # Extract date part from pickup_date string
            date_part = pickup_date_str.split("T")[0]  # Get YYYY-MM-DD part
            try:
                booking_date = datetime.fromisoformat(date_part).date()
                if start <= booking_date < end:
                    bookings.append(booking)
            except:
                continue
    
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
        
        # Add quote details
        quote = await db.quotes.find_one({"id": booking_data["quote_id"]})
        if quote:
            if "_id" in quote:
                del quote["_id"]
            booking_data["quote_details"] = parse_from_mongo(quote)
            
        schedule[date_key].append(booking_data)
    
    return schedule

@api_router.get("/admin/calendar-data")
async def get_calendar_data(start_date: str, end_date: str):
    """Get calendar data for a month range showing all scheduled jobs"""
    try:
        # Query bookings within the date range
        pipeline = [
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
        bookings = await bookings_cursor.to_list(length=None)
        
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
        
        # Get existing bookings for this date
        pipeline = [
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
        bookings = await bookings_cursor.to_list(length=None)
        
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
                # Get bookings for this date
                pipeline = [
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
                bookings = await bookings_cursor.to_list(length=None)
                
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
            backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://text2toss-venmo.preview.emergentagent.com')
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
    """Clean up temporary images older than 24 hours that weren't booked"""
    import time
    
    temp_dir = Path("/tmp/temp_uploads")
    if not temp_dir.exists():
        return {"message": "No temporary directory found"}
    
    cleaned_count = 0
    cutoff_time = time.time() - (24 * 60 * 60)  # 24 hours ago
    
    for file_path in temp_dir.glob("temp_*"):
        if file_path.stat().st_mtime < cutoff_time:
            file_path.unlink()
            cleaned_count += 1
    
    return {"message": f"Cleaned up {cleaned_count} temporary images"}

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
        backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://text2toss-venmo.preview.emergentagent.com')
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
    completion_photo_url = f"https://text2toss-venmo.preview.emergentagent.com/api/public/completion-photo/{booking_id}"
    
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
        quotes = await quotes_cursor.to_list(length=None)
        
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
        
        # If price is adjusted
        if approval_action.approved_price is not None:
            update_data["approved_price"] = approval_action.approved_price
        
        # Update quote
        await db.quotes.update_one(
            {"id": quote_id},
            {"$set": update_data}
        )
        
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
    
    # Hash the password securely
    password_hash = pwd_context.hash("L1964c10$")
    
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
        }).to_list(length=None)
        
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
# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Photo Management Endpoints
@api_router.get("/admin/gallery-photos")
async def get_gallery_photos():
    """Get all gallery photos"""
    try:
        photos = await db.gallery_photos.find({}).to_list(length=None)
        return [photo["url"] for photo in photos]
    except Exception as e:
        logger.error(f"Failed to get gallery photos: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve gallery photos")

@api_router.get("/admin/reel-photos")
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
        return {"photos": reel["photos"]}
    except Exception as e:
        logger.error(f"Failed to get reel photos: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve reel photos")

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
        
        # Create URL for the photo  
        photo_url = f"{os.environ.get('REACT_APP_BACKEND_URL', '')}/static/gallery/{filename}"
        
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
            if photo_url.startswith("/static/gallery/"):
                file_path = f"/app{photo_url}"
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

@api_router.get("/admin/customer-photos")
async def get_customer_photos():
    """Get photos uploaded by customers for quotes"""
    try:
        # Get quotes with uploaded images
        quotes = await db.quotes.find({
            "image_file": {"$exists": True, "$ne": None}
        }).to_list(length=None)
        
        customer_photos = []
        for quote in quotes:
            if quote.get("image_file"):
                customer_photos.append({
                    "url": quote["image_file"],
                    "quote_id": quote["id"],
                    "uploaded_at": quote.get("created_at"),
                    "description": quote.get("image_description", "")
                })
        
        # Sort by upload date (newest first)
        customer_photos.sort(key=lambda x: x["uploaded_at"] or "", reverse=True)
        
        return customer_photos
        
    except Exception as e:
        logger.error(f"Failed to get customer photos: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve customer photos")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()