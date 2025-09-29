import React, { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import QRCode from 'qrcode';
import ProtectedAdmin from "./components/ProtectedAdmin";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Calendar } from "./components/ui/calendar";
import AvailabilityCalendar from "./components/AvailabilityCalendar";
import { Label } from "./components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { toast } from "sonner";
// Toast notifications - using inline implementation until sonner is fixed
const showToastNotification = (type, message) => {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 9999;
    max-width: 350px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    ${type === 'success' ? 'background-color: #10b981;' : 'background-color: #ef4444;'}
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 4000);
};

// Make it available globally
window.showToast = showToastNotification;

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Landing Page Component
const LandingPage = () => {
  const [showQuote, setShowQuote] = useState(false);
  const [items, setItems] = useState([]);
  const [description, setDescription] = useState("");
  const [currentItem, setCurrentItem] = useState({ name: "", quantity: 1, size: "medium", description: "" });
  const [quote, setQuote] = useState(null);
  const [showBooking, setShowBooking] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageDescription, setImageDescription] = useState("");
  const [imageAnalyzing, setImageAnalyzing] = useState(false);
  const [showVenmoPayment, setShowVenmoPayment] = useState(false);
  const [venmoBookingId, setVenmoBookingId] = useState('');
  const [venmoQRCode, setVenmoQRCode] = useState('');
  
  // Photo Reel States
  const [photoReel, setPhotoReel] = useState([
    'https://customer-assets.emergentagent.com/job_clutterclear-1/artifacts/j1lldodm_20250618_102613.jpg',
    'https://customer-assets.emergentagent.com/job_text2toss/artifacts/mjas9jtq_image000000%2819%29.jpg',
    null, // Empty slots for admin to fill
    null,
    null,
    null
  ]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  // Fetch photo reel data from backend
  useEffect(() => {
    const fetchPhotoReel = async () => {
      try {
        const response = await axios.get(`${API}/reel-photos`);
        
        // Backend now returns full URLs
        setPhotoReel(response.data.photos || []);
      } catch (error) {
        console.error('Failed to fetch photo reel:', error);
      }
    };
    fetchPhotoReel();
  }, []);

  // Auto-cycle photos every 4 seconds
  useEffect(() => {
    const validPhotos = photoReel.filter(photo => photo !== null);
    if (validPhotos.length > 1) {
      const interval = setInterval(() => {
        setCurrentPhotoIndex(prev => {
          const validIndices = photoReel.map((photo, index) => photo !== null ? index : -1).filter(index => index !== -1);
          const currentValidIndex = validIndices.indexOf(prev);
          const nextValidIndex = (currentValidIndex + 1) % validIndices.length;
          return validIndices[nextValidIndex];
        });
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [photoReel]);
  
  const addItem = () => {
    if (!currentItem.name) return;
    setItems([...items, { ...currentItem }]);
    setCurrentItem({ name: "", quantity: 1, size: "medium", description: "" });
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setUploadedImage(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!imageFile) {
      toast.error("Please upload an image first");
      return;
    }

    setImageAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      formData.append('description', imageDescription);

      const response = await axios.post(`${API}/quotes/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setQuote(response.data);
      // Also populate the items list from AI analysis
      setItems(response.data.items);
      toast.success("Image analyzed successfully!");
    } catch (error) {
      toast.error("Failed to analyze image");
      console.error(error);
    }
    setImageAnalyzing(false);
  };

  const getQuote = async () => {
    if (items.length === 0) {
      toast.error("Please add at least one item or upload an image");
      return;
    }

    try {
      const response = await axios.post(`${API}/quotes`, {
        items,
        description
      });
      setQuote(response.data);
      toast.success("Quote generated successfully!");
    } catch (error) {
      toast.error("Failed to generate quote");
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50">
      {/* Toast notifications handled by global function */}
      
      {/* Enhanced Navigation */}
      <nav className="bg-black/80 backdrop-blur-lg border-b border-emerald-400/40 sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4 sm:py-5">
            
            {/* Premium Corner Logo Design */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              {/* Enhanced Logo Badge */}
              <div className="relative group">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/50 ring-2 ring-emerald-300/30 hover:ring-emerald-300/60 transition-all duration-500 transform hover:scale-105 hover:rotate-2">
                  {/* Premium Truck & Recycling Icon */}
                  <div className="relative">
                    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" className="text-white filter drop-shadow-lg">
                      {/* Truck Body */}
                      <path d="M22 6H12V4C12 3.45 12.45 3 13 3H21C21.55 3 22 3.45 22 4V6Z" fill="currentColor"/>
                      <path d="M6 9V25C6 25.55 6.45 26 7 26H8.5C8.78 24.85 9.8 24 11 24C12.2 24 13.22 24.85 13.5 26H19.5C19.78 24.85 20.8 24 22 24C23.2 24 24.22 24.85 24.5 26H27C27.55 26 28 25.55 28 25V16L25 12H22V9H6Z" fill="currentColor"/>
                      <circle cx="11" cy="25" r="2" fill="currentColor"/>
                      <circle cx="22" cy="25" r="2" fill="currentColor"/>
                      
                      {/* Recycling Symbol Overlay */}
                      <g transform="translate(10, 10)" opacity="0.8">
                        <path d="M6 2L8 0L6 -2" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                        <path d="M8 0L10 2L12 0" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                        <path d="M10 2L8 4L6 2" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                      </g>
                      
                      {/* Sparkle Effects */}
                      <circle cx="8" cy="8" r="0.8" fill="rgba(255,255,255,0.8)" opacity="0.7"/>
                      <circle cx="24" cy="12" r="1" fill="rgba(255,255,255,0.6)" opacity="0.5"/>
                    </svg>
                  </div>
                </div>
                
                {/* Status Indicator */}
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-orange-400 to-red-500 rounded-full shadow-lg flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                </div>
                
                {/* Subtle Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 to-teal-600/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              </div>
              
              {/* Enhanced Typography */}
              <div className="flex flex-col">
                <div className="flex items-center space-x-2">
                  {/* Main Brand Name */}
                  <div className="relative">
                    <span className="text-2xl sm:text-4xl font-black bg-gradient-to-r from-emerald-300 via-emerald-200 to-teal-300 bg-clip-text text-transparent tracking-tight filter drop-shadow-sm">
                      Text2toss
                    </span>
                    {/* Subtle underline accent */}
                    <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-gradient-to-r from-emerald-400/60 via-transparent to-teal-400/60"></div>
                  </div>
                  
                  {/* Animated Status Dots */}
                  <div className="hidden sm:flex items-center space-x-1 ml-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-400/50"></div>
                    <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse shadow-lg shadow-teal-400/50" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse shadow-lg shadow-emerald-300/50" style={{animationDelay: '0.4s'}}></div>
                  </div>
                </div>
                
                {/* Enhanced Tagline */}
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-emerald-300/95 text-xs sm:text-sm font-bold tracking-wider uppercase bg-emerald-900/20 px-2 py-0.5 rounded-full border border-emerald-400/30">
                    Professional Junk Removal
                  </span>
                  {/* Service Status Badge */}
                  <div className="hidden sm:flex items-center space-x-1 text-xs text-emerald-400">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span className="font-medium">Online</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Centered Upload Button - Hidden on mobile, shown in hero section instead */}
            <div className="hidden lg:block absolute left-1/2 transform -translate-x-1/2">
              <Button 
                onClick={() => setShowQuote(true)}
                className="bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:via-emerald-700 hover:to-teal-700 text-white px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-xl shadow-lg shadow-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/50 transition-all duration-300 transform hover:scale-105"
                data-testid="get-quote-btn"
              >
                <span className="flex items-center space-x-2">
                  <span className="text-lg sm:text-xl">📸</span>
                  <span>Upload & Quote</span>
                </span>
              </Button>
            </div>

            {/* Right Navigation Links + Admin Button */}
            <div className="flex items-center space-x-4 sm:space-x-6">
              <div className="hidden md:flex items-center space-x-6">
                <a href="#how-it-works" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors text-sm">How It Works</a>
                <a href="#contact" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors text-sm">Contact</a>
              </div>
              <Link to="/admin">
                <Button 
                  variant="outline"
                  className="border-2 border-emerald-400 text-emerald-400 hover:bg-emerald-400 hover:text-white text-sm px-4 py-2 font-medium rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-emerald-400/30"
                  data-testid="admin-login-nav-btn"
                >
                  <span className="flex items-center space-x-1">
                    <span>🔐</span>
                    <span className="hidden sm:inline">Admin Login</span>
                    <span className="sm:hidden">Admin</span>
                  </span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="space-y-6 lg:space-y-8 px-2 lg:px-0">
              <div className="space-y-4 lg:space-y-6">
                <div className="text-center lg:text-left">
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-xs sm:text-sm">
                    <span className="flex items-center justify-center flex-wrap">
                      <span>📸 AI-Powered Photo Quotes</span>
                      <span className="hidden sm:inline"> • No Callbacks Required</span>
                    </span>
                  </Badge>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight text-center lg:text-left">
                  <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Text2toss</span>
                </h1>
                <div className="bg-emerald-900/40 border border-emerald-400/40 rounded-lg p-3 lg:p-4 mb-4">
                  <p className="text-emerald-200 text-base lg:text-lg font-semibold text-center">
                    📍 Servicing Flagstaff AZ and surrounding areas
                  </p>
                  <p className="text-emerald-300 text-sm text-center mt-1">
                    Locally owned and operated business
                  </p>
                </div>
                <div className="text-base sm:text-lg lg:text-xl text-gray-200 leading-relaxed text-center lg:text-left px-2 lg:px-0">
                  <p className="mb-2">
                    Upload photo of junk and quick description, get a quote in seconds!
                  </p>
                  <p className="mb-2">
                    No more waiting on callbacks and no more hassles.
                  </p>
                  <p className="font-semibold text-emerald-200">
                    Junk removal made seamless.
                  </p>
                </div>
                <div className="bg-emerald-900/30 border border-emerald-400/30 rounded-lg p-3 lg:p-4 mt-4">
                  <p className="text-emerald-200 text-sm font-medium text-center lg:text-left">
                    📍 Ground Level & Curbside Pickup Only
                  </p>
                  <p className="text-emerald-300 text-sm mt-1 text-center lg:text-left">
                    We pickup items from ground level locations and curbside. Items must be accessible without stairs.
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 lg:gap-4 justify-center px-2 sm:px-4 lg:px-0 max-w-full mx-auto">
                <Button 
                  onClick={() => setShowQuote(true)}
                  size="lg"
                  className="w-full sm:flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-base sm:text-lg font-bold px-4 sm:px-6 py-4 sm:py-5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  data-testid="hero-get-quote-btn"
                >
                  <span className="flex items-center justify-center space-x-2">
                    <span className="text-lg sm:text-xl">📸</span>
                    <span className="whitespace-nowrap">Upload & Quote</span>
                  </span>
                </Button>
                
                <Link to="/admin" className="w-full sm:w-auto">
                  <Button 
                    variant="outline"
                    size="lg"
                    className="w-full border-2 border-emerald-400 text-emerald-400 hover:bg-emerald-400 hover:text-white text-base sm:text-lg font-semibold px-4 sm:px-6 py-4 sm:py-5 rounded-xl transition-all duration-300 hover:shadow-lg"
                    data-testid="hero-admin-btn"
                  >
                    <span className="flex items-center justify-center space-x-2">
                      <span>🔐</span>
                      <span className="whitespace-nowrap">Admin Login</span>
                    </span>
                  </Button>
                </Link>
              </div>
              
              {/* Mobile-Responsive Feature Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-4 px-2 lg:px-0">
                <div className="flex items-center justify-center sm:justify-start space-x-2">
                  <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-gray-200 text-sm sm:text-base">No Callbacks Required</span>
                </div>
                <div className="flex items-center justify-center sm:justify-start space-x-2">
                  <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-gray-200 text-sm sm:text-base">Instant Photo Quotes</span>
                </div>
                <div className="flex items-center justify-center sm:justify-start space-x-2">
                  <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-gray-200 text-sm sm:text-base">Professional Service</span>
                </div>
              </div>
            </div>

            <PhotoCarousel 
              photos={photoReel}
              currentIndex={currentPhotoIndex}
              onIndexChange={setCurrentPhotoIndex}
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-black/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">How Text2toss Works</h2>
            <p className="text-xl text-gray-200">Three simple steps - no waiting, no callbacks</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="text-center border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-b from-white to-emerald-50/30">
              <CardHeader>
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full mx-auto flex items-center justify-center mb-4">
                  <span className="text-white text-2xl font-bold">1</span>
                </div>
                <CardTitle className="text-2xl">Upload Photo & Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  Take a photo of your junk and add a quick description. 
                  Our AI instantly identifies items and calculates pricing - no callbacks needed!
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-b from-white to-teal-50/30">
              <CardHeader>
                <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-full mx-auto flex items-center justify-center mb-4">
                  <span className="text-white text-2xl font-bold">2</span>
                </div>
                <CardTitle className="text-2xl">Get Quote in Seconds</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  Receive your quote instantly - no waiting for callbacks or estimates. 
                  Transparent pricing with no hidden fees or surprises.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-b from-white to-emerald-50/30">
              <CardHeader>
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full mx-auto flex items-center justify-center mb-4">
                  <span className="text-white text-2xl font-bold">3</span>
                </div>
                <CardTitle className="text-2xl">Schedule Pickup, Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  Choose a convenient time for pickup and pay via Venmo only. 
                  Send payment to @Text2toss with your booking ID for confirmation.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Quote Modal */}
      {showQuote && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="text-2xl">Text2toss Instant Quote</CardTitle>
              <CardDescription>Upload photo or add items - get quote in seconds!</CardDescription>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <p className="text-blue-800 text-sm font-medium">ℹ️ Service Area</p>
                <p className="text-blue-700 text-sm">Ground level & curbside pickup only. No stairs or upper floors.</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Image Upload Section */}
              <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold flex items-center gap-2">
                  📸 Upload Image for AI Analysis
                  <Badge variant="secondary" className="text-xs">New!</Badge>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Select Image</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      data-testid="image-upload-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Image Description (Optional)</Label>
                    <Input
                      placeholder="e.g., Items in my garage"
                      value={imageDescription}
                      onChange={(e) => setImageDescription(e.target.value)}
                      data-testid="image-description-input"
                    />
                  </div>
                </div>
                
                {uploadedImage && (
                  <div className="space-y-2">
                    <Label>Uploaded Image</Label>
                    <div className="flex items-start gap-4">
                      <img 
                        src={uploadedImage} 
                        alt="Uploaded junk items" 
                        className="w-32 h-32 object-cover rounded-lg border"
                      />
                      <div className="flex-1">
                        <Button 
                          onClick={analyzeImage}
                          disabled={imageAnalyzing}
                          className="bg-blue-600 hover:bg-blue-700"
                          data-testid="analyze-image-btn"
                        >
                          {imageAnalyzing ? "🤖 Analyzing..." : "🔍 Analyze with AI"}
                        </Button>
                        <p className="text-sm text-gray-600 mt-2">
                          AI will identify items and provide pricing automatically
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center text-gray-500 text-sm">
                ── OR ──
              </div>

              {/* Add Item Form */}
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold">Add Items</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Item Name</Label>
                    <Input
                      placeholder="e.g., Sofa, Mattress"
                      value={currentItem.name}
                      onChange={(e) => setCurrentItem({...currentItem, name: e.target.value})}
                      data-testid="item-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={currentItem.quantity}
                      onChange={(e) => setCurrentItem({...currentItem, quantity: parseInt(e.target.value)})}
                      data-testid="item-quantity-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Size</Label>
                    <Select value={currentItem.size} onValueChange={(value) => setCurrentItem({...currentItem, size: value})}>
                      <SelectTrigger data-testid="item-size-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={addItem} className="w-full" data-testid="add-item-btn">
                      Add Item
                    </Button>
                  </div>
                </div>
              </div>

              {/* Items List */}
              {items.length > 0 && (
                <div className="space-y-2" data-testid="items-list">
                  <h3 className="font-semibold">Items to Remove</h3>
                  {items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-white border rounded-lg">
                      <span className="font-medium">{item.quantity}x {item.name} ({item.size})</span>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => removeItem(index)}
                        data-testid={`remove-item-${index}`}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <Label>Additional Details</Label>
                <Textarea
                  placeholder="Any special instructions or additional details about your junk..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="description-textarea"
                />
              </div>

              {/* Quote Result */}
              {quote && (
                <Card className="bg-emerald-50 border-emerald-200" data-testid="quote-result">
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <div>
                        <h3 className="text-2xl font-bold text-emerald-800 mb-2">
                          Total: ${quote.total_price}
                          {quote.scale_level && quote.scale_level >= 9 && (
                            <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                              Requires Approval
                            </span>
                          )}
                        </h3>
                        <p className="text-emerald-600 text-sm mb-2">Quote ID: {quote.id}</p>
                        
                        {/* Price Breakdown Section */}
                        {quote.breakdown && (
                          <div className="bg-white/80 rounded-lg p-4 mb-4 text-left">
                            <h4 className="font-semibold text-emerald-800 mb-3 text-center">💰 Price Breakdown</h4>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Volume Scale:</span>
                                <span className="font-medium text-emerald-700">
                                  {quote.scale_level}/20 ({quote.scale_level <= 4 ? 'Small' : quote.scale_level <= 8 ? 'Medium' : quote.scale_level <= 14 ? 'Large' : 'XL'})
                                </span>
                              </div>
                              {quote.breakdown.base_price && (
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-600">Base Price Range:</span>
                                  <span className="font-medium">${quote.breakdown.base_price}</span>
                                </div>
                              )}
                              {quote.breakdown.items && quote.breakdown.items.length > 0 && (
                                <div className="border-t pt-2 mt-2">
                                  <p className="text-sm text-gray-600 mb-2">Items:</p>
                                  {quote.breakdown.items.map((item, index) => (
                                    <div key={index} className="flex justify-between items-center ml-4">
                                      <span className="text-xs text-gray-500">{item.name} ({item.size})</span>
                                      <span className="text-xs font-medium">${item.estimated_cost || 'Included'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {quote.breakdown.factors && (
                                <div className="border-t pt-2 mt-2">
                                  <p className="text-sm text-gray-600 mb-2">Pricing Factors:</p>
                                  {quote.breakdown.factors.map((factor, index) => (
                                    <div key={index} className="ml-4">
                                      <span className="text-xs text-gray-500">• {factor}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {quote.ai_explanation && (
                          <div className="bg-white/50 rounded-lg p-3 mb-4">
                            <p className="text-xs text-gray-600 mb-1">🤖 AI Pricing Analysis</p>
                            <p className="text-sm text-gray-700">{quote.ai_explanation}</p>
                          </div>
                        )}
                        
                        {/* Fine print for high-value quotes */}
                        {quote.scale_level && quote.scale_level >= 4 && (
                          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-xs text-yellow-800 font-medium">
                              📋 <strong>Important Notice:</strong> This quote requires admin approval before payment processing.
                            </p>
                            <p className="text-xs text-yellow-700 mt-1">
                              Large jobs (Scale 4-10) are reviewed for accuracy. You will be contacted within 24 hours 
                              with final pricing confirmation before any charges are processed.
                            </p>
                          </div>
                        )}
                      </div>
                      <Button 
                        onClick={() => setShowBooking(true)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        data-testid="book-pickup-btn"
                      >
                        {quote.scale_level && quote.scale_level >= 4 ? 'Schedule Pickup (Pending Approval)' : 'Book Pickup'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setShowQuote(false)} data-testid="cancel-quote-btn">
                Cancel
              </Button>
              <Button onClick={getQuote} disabled={items.length === 0} data-testid="get-quote-submit-btn">
                Get Quote from Items
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Booking Modal */}
      {showBooking && quote && (
        <BookingModal 
          quote={quote} 
          onClose={() => setShowBooking(false)}
          onSuccess={() => {
            setShowBooking(false);
            setShowQuote(false);
            toast.success("Pickup scheduled successfully!");
          }}
          onVenmoPayment={(bookingId, qrCode) => {
            setVenmoBookingId(bookingId);
            setVenmoQRCode(qrCode);
            setShowBooking(false);
            setShowVenmoPayment(true);
          }}
        />
      )}

      {/* Venmo Payment Modal */}
      {showVenmoPayment && (
        <VenmoPaymentModal 
          quote={quote}
          bookingId={venmoBookingId}
          qrCode={venmoQRCode}
          onClose={() => {
            setShowVenmoPayment(false);
            setShowQuote(false);
            toast.success("Booking confirmed! Payment instructions sent via SMS.");
          }}
        />
      )}

      {/* Contact Section */}
      <section id="contact" className="py-12 sm:py-20 bg-slate-900/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-4">
              Get In <span className="text-emerald-400">Touch</span>
            </h2>
            <p className="text-gray-300 text-lg sm:text-xl max-w-2xl mx-auto">
              Ready to clear out your space? Contact us for fast, professional junk removal services.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {/* Phone */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 text-center hover:bg-slate-800/70 transition-all duration-300 border border-slate-700">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📞</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Call Us</h3>
              <a 
                href="tel:9288539619" 
                className="text-emerald-400 hover:text-emerald-300 transition-colors text-lg font-medium"
              >
                (928) 853-9619
              </a>
              <p className="text-gray-400 text-sm mt-2">Mon-Sat: 8AM-6PM</p>
            </div>

            {/* Email */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 text-center hover:bg-slate-800/70 transition-all duration-300 border border-slate-700">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✉️</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Email Us</h3>
              <a 
                href="mailto:text2toss@gmail.com" 
                className="text-emerald-400 hover:text-emerald-300 transition-colors text-lg font-medium"
              >
                text2toss@gmail.com
              </a>
              <p className="text-gray-400 text-sm mt-2">Quick Response</p>
            </div>

            {/* Facebook */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 text-center hover:bg-slate-800/70 transition-all duration-300 border border-slate-700">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📘</span>
              </div>
              <h3 className="font-semibold text-white mb-2">Follow Us</h3>
              <a 
                href="https://www.facebook.com/share/17Vsc23wKL/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 transition-colors text-lg font-medium"
              >
                Facebook
              </a>
              <p className="text-gray-400 text-sm mt-2">Updates & Tips</p>
            </div>
          </div>

          {/* Service Area Info */}
          <div className="mt-12 text-center">
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-xl p-6 max-w-2xl mx-auto border border-slate-700">
              <h3 className="font-semibold text-white mb-3">🏔️ Serving Flagstaff, Arizona</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                Professional junk removal services • Ground level & curbside pickup only<br />
                Fast response times • Eco-friendly disposal • Competitive AI-powered pricing
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 py-8 sm:py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
            <div>
              <div className="flex items-center justify-center md:justify-start space-x-3 mb-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-lg sm:text-xl font-bold">🏠</span>
                </div>
                <span className="text-lg sm:text-2xl font-bold text-white">Text2toss</span>
              </div>
              <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
                Fast, reliable junk removal with instant AI-powered quotes. Easy Venmo payments (@Text2toss). Ground level & curbside pickup only.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm sm:text-base">Contact Info</h3>
              <div className="space-y-2">
                <a href="tel:9288539619" className="block text-gray-400 hover:text-emerald-400 transition-colors text-sm sm:text-base">📞 (928) 853-9619</a>
                <a href="mailto:text2toss@gmail.com" className="block text-gray-400 hover:text-emerald-400 transition-colors text-sm sm:text-base">✉️ text2toss@gmail.com</a>
                <a href="https://www.facebook.com/share/17Vsc23wKL/" target="_blank" rel="noopener noreferrer" className="block text-gray-400 hover:text-emerald-400 transition-colors text-sm sm:text-base">📘 Facebook</a>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm sm:text-base">Service Area</h3>
              <p className="text-gray-400 text-sm sm:text-base">
                🏔️ Flagstaff, Arizona<br />
                📍 Ground Level & Curbside Only<br />
                ⏰ Mon-Sat: 8AM-6PM
              </p>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-8 text-center">
            <p className="text-gray-400 text-sm sm:text-base">
              © 2024 Text2toss. All rights reserved. | Professional junk removal services in Flagstaff, AZ.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Photo Carousel Component
const PhotoCarousel = ({ photos, currentIndex, onIndexChange }) => {
  const validPhotos = photos.filter(photo => photo !== null);
  
  if (validPhotos.length === 0) {
    return (
      <div className="relative">
        <div className="bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl shadow-2xl w-full h-80 flex items-center justify-center">
          <div className="text-center text-gray-600">
            <span className="text-4xl mb-2 block">📷</span>
            <p className="text-lg font-medium">Photo Gallery Coming Soon</p>
            <p className="text-sm">Admin can upload photos here</p>
          </div>
        </div>
      </div>
    );
  }

  const handleDotClick = (index) => {
    const validIndices = photos.map((photo, idx) => photo !== null ? idx : -1).filter(idx => idx !== -1);
    onIndexChange(validIndices[index]);
  };

  return (
    <div className="relative">
      <div className="relative z-10 overflow-hidden rounded-2xl shadow-2xl">
        <img 
          src={photos[currentIndex]}
          alt={`Text2toss job photo ${currentIndex + 1}`}
          className="w-full h-80 object-cover transition-opacity duration-500"
        />
        
        {/* Photo Counter Overlay */}
        <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium">
          {photos.findIndex((_, idx) => idx === currentIndex && photos[idx] !== null) + 1} / {validPhotos.length}
        </div>
        
        {/* Navigation Dots */}
        {validPhotos.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
            {validPhotos.map((_, index) => {
              const validIndices = photos.map((photo, idx) => photo !== null ? idx : -1).filter(idx => idx !== -1);
              const isActive = validIndices[index] === currentIndex;
              return (
                <button
                  key={index}
                  onClick={() => handleDotClick(index)}
                  className={`w-3 h-3 rounded-full transition-all duration-300 ${
                    isActive 
                      ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' 
                      : 'bg-white/50 hover:bg-white/80'
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>
      
      {/* Decorative Elements */}
      <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full opacity-20 blur-xl"></div>
      <div className="absolute -top-4 -left-4 w-32 h-32 bg-gradient-to-br from-teal-400 to-emerald-500 rounded-full opacity-15 blur-2xl"></div>
    </div>
  );
};

// Venmo Payment Modal Component
const VenmoPaymentModal = ({ quote, bookingId, qrCode, onClose }) => {
  const venmoUrl = `https://venmo.com/code?user_id=Text2toss&amount=${quote.total_price}&note=Text2toss%20Booking%20${bookingId.substring(0, 8)}`;
  
  const copyBookingId = () => {
    navigator.clipboard.writeText(bookingId.substring(0, 8));
    toast.success("Booking ID copied to clipboard!");
  };

  const openVenmoApp = () => {
    window.open(venmoUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[95vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-green-600">🎉 Booking Confirmed!</h2>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            >
              ×
            </button>
          </div>

          {/* Booking Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-2">Booking Details:</h3>
            <p><strong>Booking ID:</strong> {bookingId.substring(0, 8)}</p>
            <p><strong>Total Amount:</strong> ${quote.total_price}</p>
            <p><strong>Service:</strong> Junk Removal</p>
          </div>

          {/* Payment Instructions */}
          <div className="mb-6">
            <h3 className="font-semibold mb-3 text-lg">📱 Complete Payment via Venmo:</h3>
            
            {/* QR Code */}
            <div className="text-center mb-4">
              <div className="inline-block p-4 bg-white border-2 border-gray-300 rounded-lg">
                <img 
                  src={qrCode} 
                  alt="Venmo Payment QR Code" 
                  className="w-48 h-48 mx-auto"
                />
              </div>
              <p className="text-sm text-gray-600 mt-2">Scan with Venmo app</p>
            </div>

            {/* OR Divider */}
            <div className="flex items-center my-4">
              <hr className="flex-1 border-gray-300" />
              <span className="px-3 text-gray-500 text-sm">OR</span>
              <hr className="flex-1 border-gray-300" />
            </div>

            {/* Manual Payment Instructions */}
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2">Manual Payment:</h4>
                <ul className="space-y-2 text-sm">
                  <li>• Send <strong>${quote.total_price}</strong> to <strong>@Text2toss</strong></li>
                  <li>• Include booking ID: <strong>{bookingId.substring(0, 8)}</strong> 
                    <button 
                      onClick={copyBookingId}
                      className="ml-2 text-blue-600 hover:text-blue-800 underline text-xs"
                    >
                      (Copy)
                    </button>
                  </li>
                  <li>• We'll confirm payment and send pickup details</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button 
              onClick={openVenmoApp}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3"
            >
              📱 Open Venmo App
            </Button>
            
            <Button 
              onClick={onClose}
              variant="outline"
              className="w-full py-3"
            >
              I'll Pay Later
            </Button>
          </div>

          {/* Important Note */}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Your pickup is scheduled but payment is required to confirm the service. 
              We'll send SMS confirmation once payment is received.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Booking Modal Component
const BookingModal = ({ quote, onClose, onSuccess, onVenmoPayment }) => {
  const [bookingData, setBookingData] = useState({
    pickup_date: "",
    pickup_time: "",
    address: "",
    phone: "",
    special_instructions: "",
    curbside_confirmed: false,
    sms_notifications: false
  });
  const [bookedTimeSlots, setBookedTimeSlots] = useState([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Check if date is allowed (no Fridays, Saturdays, Sundays)
  const isDateAllowed = (dateString) => {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    return dayOfWeek >= 1 && dayOfWeek <= 4; // Monday(1) to Thursday(4)
  };

  // Get booked time slots for a specific date
  const checkAvailableTimeSlots = async (selectedDate) => {
    if (!selectedDate || !isDateAllowed(selectedDate)) {
      setBookedTimeSlots([]);
      return;
    }

    setCheckingAvailability(true);
    try {
      const response = await axios.get(`${API}/availability/${selectedDate}`);
      const availabilityData = response.data;
      
      if (availabilityData.blocked_day) {
        toast.error(availabilityData.reason);
        setBookedTimeSlots([]);
        return;
      }
      
      setBookedTimeSlots(availabilityData.booked_slots || []);
      
      if (availabilityData.available_count === 0) {
        toast.warning("All time slots are booked for this date. Please choose another day.");
      }
      
    } catch (error) {
      console.error("Failed to check availability:", error);
      setBookedTimeSlots([]);
    }
    setCheckingAvailability(false);
  };

  // Handle date change
  const handleDateChange = (selectedDate) => {
    if (!isDateAllowed(selectedDate)) {
      toast.error("Pickup is not available on weekends or Fridays. Please select Monday-Thursday.");
      return;
    }
    
    setBookingData({...bookingData, pickup_date: selectedDate, pickup_time: ""}); // Reset time selection
    checkAvailableTimeSlots(selectedDate);
  };

  const handleVenmoBooking = async () => {
    if (!bookingData.pickup_date || !bookingData.pickup_time || !bookingData.address || !bookingData.phone) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!bookingData.curbside_confirmed) {
      toast.error("Please confirm that all items are placed on the ground by the curb");
      return;
    }

    if (!isDateAllowed(bookingData.pickup_date)) {
      toast.error("Selected date is not available for pickup");
      return;
    }

    if (bookedTimeSlots.includes(bookingData.pickup_time)) {
      toast.error("Selected time slot is already booked. Please choose another time.");
      return;
    }

    try {
      // Create the booking with Venmo payment method
      const bookingResponse = await axios.post(`${API}/bookings`, {
        quote_id: quote.id,
        ...bookingData,
        payment_method: 'venmo'
      });
      
      const bookingId = bookingResponse.data.id;
      
      // Generate Venmo payment URL and QR code
      const venmoUrl = `https://venmo.com/code?user_id=Text2toss&amount=${quote.total_price}&note=Text2toss%20Booking%20${bookingId.substring(0, 8)}`;
      
      // Generate QR code for Venmo payment
      const qrCodeDataUrl = await QRCode.toDataURL(venmoUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      // Set booking data and show Venmo payment modal
      onVenmoPayment(bookingId, qrCodeDataUrl);
      
    } catch (error) {
      toast.error("Failed to create booking");
      console.error(error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 pt-2 sm:pt-4 pb-2 sm:pb-4 overflow-y-auto">
      <Card className="w-full max-w-md mx-2 sm:mx-0 my-2 sm:my-4 max-h-[95vh] sm:max-h-none overflow-y-auto">
        <CardHeader>
          <CardTitle>Schedule Pickup & Pay</CardTitle>
          <CardDescription>
            <div className="flex justify-between items-center">
              <span>Total: ${quote.total_price}</span>
              <Badge className="bg-green-100 text-green-800">Payment Required</Badge>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 max-h-[50vh] sm:max-h-none overflow-y-auto">
          {/* Payment Options */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-3">💳 Payment Method</h3>
            <div className="text-center">
              <div className="mb-2">
                <span className="text-lg font-medium text-blue-700">📱 Venmo Only</span>
              </div>
              <p className="text-sm text-blue-600 mb-2">Send payment to @Text2toss</p>
              <p className="text-xs text-blue-600">After booking, you'll receive payment instructions with your booking ID</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pickup Date</Label>
            <Button
              variant="outline"
              onClick={() => setShowCalendar(true)}
              className="w-full justify-start text-left h-10"
              data-testid="pickup-date-button"
            >
              {bookingData.pickup_date ? 
                new Date(bookingData.pickup_date).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                }) : 
                "📅 Select pickup date"
              }
            </Button>
            <p className="text-xs text-gray-600">
              🟢 Available dates • 🟡 Limited slots • 🔴 Fully booked • ❌ Weekends unavailable
            </p>
          </div>
          <div className="space-y-2">
            <Label>Pickup Time</Label>
            <Select 
              value={bookingData.pickup_time} 
              onValueChange={(value) => setBookingData({...bookingData, pickup_time: value})}
              disabled={!bookingData.pickup_date || checkingAvailability}
            >
              <SelectTrigger data-testid="pickup-time-select">
                <SelectValue placeholder={
                  checkingAvailability ? "Checking availability..." : 
                  !bookingData.pickup_date ? "Select date first" : 
                  "Select time"
                } />
              </SelectTrigger>
              <SelectContent>
                {[
                  { value: "08:00-10:00", label: "8:00 AM - 10:00 AM" },
                  { value: "10:00-12:00", label: "10:00 AM - 12:00 PM" },
                  { value: "12:00-14:00", label: "12:00 PM - 2:00 PM" },
                  { value: "14:00-16:00", label: "2:00 PM - 4:00 PM" },
                  { value: "16:00-18:00", label: "4:00 PM - 6:00 PM" }
                ].map(timeSlot => {
                  const isBooked = bookedTimeSlots.includes(timeSlot.value);
                  return (
                    <SelectItem 
                      key={timeSlot.value}
                      value={timeSlot.value} 
                      disabled={isBooked}
                      className={isBooked ? "opacity-50 cursor-not-allowed" : ""}
                    >
                      {timeSlot.label} {isBooked && "🚫 Booked"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {bookingData.pickup_date && (
              <p className="text-xs text-gray-600">
                {bookedTimeSlots.length > 0 
                  ? `${bookedTimeSlots.length} time slot(s) already booked for this date` 
                  : "✅ All time slots available"
                }
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Textarea
              placeholder="Full pickup address"
              value={bookingData.address}
              onChange={(e) => setBookingData({...bookingData, address: e.target.value})}
              data-testid="address-textarea"
            />
          </div>
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <Input
              type="tel"
              placeholder="Your phone number"
              value={bookingData.phone}
              onChange={(e) => setBookingData({...bookingData, phone: e.target.value})}
              data-testid="phone-input"
            />
          </div>
          {/* Confirmation Checkbox */}
          <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start space-x-2 sm:space-x-3">
              <input
                type="checkbox"
                id="curbside-confirmation"
                checked={bookingData.curbside_confirmed || false}
                onChange={(e) => setBookingData({...bookingData, curbside_confirmed: e.target.checked})}
                className="mt-0.5 sm:mt-1 h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded flex-shrink-0"
                data-testid="curbside-checkbox"
              />
              <Label htmlFor="curbside-confirmation" className="text-xs sm:text-sm font-medium text-yellow-800 cursor-pointer leading-tight">
                ✅ I confirm all removal items are placed on the ground by the curb for easy pickup
              </Label>
            </div>
            <p className="text-xs text-yellow-700 ml-6 sm:ml-7 leading-tight">
              📋 <strong>Important:</strong> Items must be accessible from street level. No indoor/upper floor collection without arrangements.
            </p>
          </div>

          {/* SMS Notifications Opt-in */}
          <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-2 sm:space-x-3">
              <input
                type="checkbox"
                id="sms-notifications"
                checked={bookingData.sms_notifications || false}
                onChange={(e) => setBookingData({...bookingData, sms_notifications: e.target.checked})}
                className="mt-0.5 sm:mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded flex-shrink-0"
                data-testid="sms-checkbox"
              />
              <Label htmlFor="sms-notifications" className="text-xs sm:text-sm font-medium text-blue-800 cursor-pointer leading-tight">
                📱 Send me SMS updates (job start, progress, completion)
              </Label>
            </div>
            <p className="text-xs text-blue-700 ml-6 sm:ml-7 leading-tight">
              💬 <strong>Optional:</strong> Get real-time text notifications about your junk removal job status. Standard messaging rates may apply.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Special Instructions</Label>
            <Textarea
              placeholder="Any special instructions for pickup"
              value={bookingData.special_instructions}
              onChange={(e) => setBookingData({...bookingData, special_instructions: e.target.value})}
              data-testid="special-instructions-textarea"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 p-4 sm:p-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <h3 className="font-semibold text-blue-800 mb-2">💳 Payment Method</h3>
            <p className="text-blue-700 text-sm mb-3">
              We accept Venmo payments only. After booking, you'll receive payment instructions.
            </p>
          </div>
          
          <Button 
            onClick={handleVenmoBooking}
            data-testid="venmo-booking-btn" 
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-4 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 font-medium text-lg"
          >
            📱 Book Job - Pay with Venmo (@Text2toss)
          </Button>
          
          <Button 
            variant="outline" 
            onClick={onClose} 
            data-testid="cancel-booking-btn" 
            className="w-full bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 py-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium"
          >
            Cancel
          </Button>
        </CardFooter>
      </Card>
      
      {/* Availability Calendar Modal */}
      {showCalendar && (
        <AvailabilityCalendar
          selectedDate={bookingData.pickup_date}
          onDateSelect={(date) => {
            handleDateChange(date);
          }}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  );
};

// Main App Component
function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/admin" element={<ProtectedAdmin />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;