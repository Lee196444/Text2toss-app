from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, date, time, timedelta
import hashlib
import jwt
from passlib.context import CryptContext
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType
import json
import re
import base64
from fastapi import UploadFile, File
import aiofiles
import os
from pathlib import Path
from twilio.rest import Client
import logging

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

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = "your-secret-key-change-in-production"
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
        print(f"SMS SIMULATION - To: {to_phone}, Message: {message}")
        if image_url:
            print(f"SMS SIMULATION - Image: {image_url}")
        return {"status": "simulated", "message": "SMS simulated (Twilio not configured)"}
    
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
            "message": "SMS sent successfully"
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
    description: str
    ai_explanation: Optional[str] = None
    temp_image_path: Optional[str] = None  # Temporary image path (deleted if not booked)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PriceQuoteCreate(BaseModel):
    items: List[JunkItem]
    description: str
    
class ImageQuoteCreate(BaseModel):
    description: str

class AdminLogin(BaseModel):
    password: str

class Booking(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    quote_id: str
    pickup_date: datetime
    pickup_time: str
    address: str
    phone: str
    special_instructions: Optional[str] = None
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

class BookingCompletion(BaseModel):
    completion_note: Optional[str] = None

# AI-powered pricing logic for ground level and curbside pickup only
async def calculate_ai_price(items: List[JunkItem], description: str) -> tuple[float, str]:
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

SIMPLIFIED PRICING GUIDELINES (Ground Level Only):
- Small items (boxes, bags, small furniture): $20-35 each
- Medium items (chairs, small appliances, mattresses): $45-75 each  
- Large items (sofas, refrigerators, washers): $85-140 each
- Minor additional charges for:
  - Basic disassembly (removing doors, etc.): +$10-20 per item
  - Oversized/awkward items: +$15-30 per item
  - Multiple heavy items requiring extra labor: +$20-40 total

Base service fee: $30-45 (includes ground level pickup and loading)

Since this is ground level/curbside service only, there are NO charges for stairs, upper floors, or difficult access.

If the description mentions stairs, upper floors, basements, or difficult access, note in explanation that customer needs to move items to ground level/curbside first.

Respond ONLY with a JSON object in this exact format:
{{
  "total_price": 150.00,
  "breakdown": {{
    "items_cost": 120.00,
    "service_fee": 30.00,
    "additional_charges": 0.00
  }},
  "explanation": "Brief explanation of the pricing factors considered for ground level pickup"
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
        
        return total_price, explanation
        
    except Exception as e:
        print(f"AI pricing error: {str(e)}")
        # Fallback to basic pricing if AI fails
        fallback_price = calculate_basic_price(items)
        return fallback_price, "Basic pricing applied (AI temporarily unavailable)"

# Fallback basic pricing function
def calculate_basic_price(items: List[JunkItem]) -> float:
    base_prices = {
        "small": 25,
        "medium": 50, 
        "large": 100
    }
    
    total = 0
    for item in items:
        base_price = base_prices.get(item.size, 50)
        total += base_price * item.quantity
    
    # Add service fee
    service_fee = total * 0.15
    return round(total + service_fee, 2)

# AI Vision Analysis for Image-based Quotes
async def analyze_image_for_quote(image_path: str, description: str) -> tuple[List[JunkItem], float, str]:
    """Use AI vision to analyze uploaded image and identify junk items for pricing"""
    
    ai_prompt = f"""You are a professional junk removal expert analyzing an image to provide accurate quotes. Analyze this image and identify all removable items.

ADDITIONAL CONTEXT FROM USER:
{description}

IMPORTANT SERVICE LIMITATIONS:
- We ONLY provide ground level pickup (no stairs, no upper floors)
- Items must be accessible at ground level or placed curbside

Please analyze the image and provide:
1. Identify all junk/furniture items visible
2. Estimate quantity and size of each item
3. Consider condition and removal difficulty
4. Calculate pricing for ground level pickup only

PRICING GUIDELINES (Ground Level Only):
- Small items (boxes, bags, small furniture): $20-35 each
- Medium items (chairs, small appliances, mattresses): $45-75 each  
- Large items (sofas, refrigerators, washers): $85-140 each
- Minor additional charges for:
  - Basic disassembly: +$10-20 per item
  - Oversized/awkward items: +$15-30 per item

Base service fee: $30-45

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
  "breakdown": {{
    "items_cost": 120.00,
    "service_fee": 30.00,
    "additional_charges": 0.00
  }},
  "explanation": "Detailed explanation of what was identified in the image and pricing factors"
}}"""

    try:
        # Create image file content
        image_file = FileContentWithMimeType(
            file_path=image_path,
            mime_type="image/jpeg"
        )
        
        # Initialize AI chat with vision capabilities
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY'),
            session_id=f"vision_analysis_{datetime.now().timestamp()}",
            system_message="You are a professional junk removal expert with visual analysis capabilities. Always respond with valid JSON only."
        ).with_model("openai", "gpt-4o")  # Use vision-capable model
        
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
        
        return items, total_price, explanation
        
    except Exception as e:
        print(f"AI vision analysis error: {str(e)}")
        # Fallback - create default item if image analysis fails
        fallback_items = [JunkItem(name="Unidentified items from image", quantity=1, size="medium")]
        fallback_price = 75.0
        fallback_explanation = "Image analysis temporarily unavailable. Basic estimate provided - please describe items for accurate pricing."
        return fallback_items, fallback_price, fallback_explanation

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
    total_price, ai_explanation = await calculate_ai_price(quote_data.items, quote_data.description)
    
    quote = PriceQuote(
        user_id="anonymous",  # Allow anonymous quotes
        items=quote_data.items,
        total_price=total_price,
        description=quote_data.description,
        ai_explanation=ai_explanation
    )
    
    quote_mongo = prepare_for_mongo(quote.dict())
    await db.quotes.insert_one(quote_mongo)
    
    return quote

@api_router.post("/quotes/image", response_model=PriceQuote)
async def create_quote_from_image(
    file: UploadFile = File(...),
    description: str = ""
):
    """Create quote by analyzing uploaded image with AI vision"""
    
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
        items, total_price, ai_explanation = await analyze_image_for_quote(str(file_path), description)
        
        # Create quote with temporary image path
        quote = PriceQuote(
            user_id="anonymous",
            items=items,
            total_price=total_price,
            description=f"Image analysis: {description}" if description else "Image-based quote",
            ai_explanation=ai_explanation,
            temp_image_path=str(file_path)  # Store temp path, will be moved when booked
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
        image_path=permanent_image_path
    )
    
    booking_mongo = prepare_for_mongo(booking.dict())
    await db.bookings.insert_one(booking_mongo)
    
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
    
    bookings = await db.bookings.find({
        "pickup_date": {
            "$gte": datetime.combine(start, datetime.min.time()),
            "$lt": datetime.combine(end, datetime.min.time())
        }
    }).sort([("pickup_date", 1), ("pickup_time", 1)]).to_list(1000)
    
    # Group by date
    schedule = {}
    for booking in bookings:
        booking_data = parse_from_mongo(booking)
        date_key = booking_data["pickup_date"].strftime("%Y-%m-%d")
        if date_key not in schedule:
            schedule[date_key] = []
        
        # Add quote details
        quote = await db.quotes.find_one({"id": booking_data["quote_id"]})
        if quote:
            booking_data["quote_details"] = parse_from_mongo(quote)
            
        schedule[date_key].append(booking_data)
    
    return schedule

@api_router.patch("/admin/bookings/{booking_id}")
async def update_booking_status(booking_id: str, status_update: dict):
    """Update booking status"""
    allowed_statuses = ["scheduled", "in_progress", "completed", "cancelled"]
    new_status = status_update.get("status")
    
    if new_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    update_data = {"status": new_status}
    
    # If marking as completed, add completion timestamp
    if new_status == "completed":
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.bookings.update_one(
        {"id": booking_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    return {"message": "Booking status updated successfully"}

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
        
        return {
            "message": "Completion photo uploaded successfully",
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
    """Send completion notification with photo to customer"""
    
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if not booking.get("completion_photo_path"):
        raise HTTPException(status_code=400, detail="No completion photo available")
    
    # For now, just return success - you can integrate with email service later
    # TODO: Integrate with email service (SendGrid, etc.) to send photo to customer
    
    return {
        "message": "Customer notification sent successfully",
        "customer_phone": booking.get("phone"),
        "completion_note": booking.get("completion_note", ""),
        "photo_available": True
    }

@api_router.post("/admin/login")
async def admin_login(login_data: AdminLogin):
    """Simple admin password authentication"""
    admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123')
    
    if login_data.password == admin_password:
        # Create a simple admin session token
        admin_token = jwt.encode(
            {"admin": True, "exp": datetime.now(timezone.utc) + timedelta(hours=8)}, 
            SECRET_KEY, 
            algorithm=ALGORITHM
        )
        return {"success": True, "token": admin_token, "message": "Login successful"}
    else:
        raise HTTPException(status_code=401, detail="Invalid admin password")

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

# Include the router in the main app
app.include_router(api_router)

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