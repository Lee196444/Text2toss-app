import React, { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import QRCode from 'qrcode';
import ProtectedAdmin from "./components/ProtectedAdmin";
import CustomerApproval from "./components/CustomerApproval";
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
import PreviewPage from "./PreviewPage";
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
  const [quoteStep, setQuoteStep] = useState(1); // NEW: Wizard step tracker
  const [items, setItems] = useState([]);
  const [description, setDescription] = useState("");
  const [currentItem, setCurrentItem] = useState({ name: "", size: "medium", description: "" });
  const [quote, setQuote] = useState(null);
  const [showBooking, setShowBooking] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageDescription, setImageDescription] = useState("");
  const [imageAnalyzing, setImageAnalyzing] = useState(false);
  const [imageAnalyzed, setImageAnalyzed] = useState(false);
  const [quoteRecalculating, setQuoteRecalculating] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showVenmoPayment, setShowVenmoPayment] = useState(false);
  const [venmoBookingId, setVenmoBookingId] = useState('');
  const [venmoQRCode, setVenmoQRCode] = useState('');
  const [quoteError, setQuoteError] = useState(''); // NEW: Error handling
  const [showApprovalModal, setShowApprovalModal] = useState(false); // NEW: Approval notification modal
  const [fieldErrors, setFieldErrors] = useState({}); // NEW: Track which fields have errors
  
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
  
  const addItem = async () => {
    if (!currentItem.name) return;
    
    const newItem = { ...currentItem, quantity: 1 }; // Add default quantity for backend compatibility
    const updatedItems = [...items, newItem];
    setItems(updatedItems);
    setCurrentItem({ name: "", size: "medium", description: "" });
    
    // If there was already a quote, automatically recalculate with the new item
    if (quote) {
      setQuoteRecalculating(true);
      try {
        // For automatic recalculation, use the same format as manual quote generation
        const response = await axios.post(`${API}/quotes`, {
          items: updatedItems,
          description
        });
        
        setQuote(response.data);
        
        // Show success message with updated price
        const priceIncrease = response.data.total_price - quote.total_price;
        if (priceIncrease > 0) {
          toast.success(`Item "${newItem.name}" added. Quote updated to $${response.data.total_price} (+$${priceIncrease.toFixed(2)})`);
        } else {
          toast.success(`Item "${newItem.name}" added. Quote updated to $${response.data.total_price}`);
        }
        
      } catch (error) {
        console.error('Error recalculating quote after item addition:', error);
        // Clear quote on error - user will need to manually get new quote
        setQuote(null);
        toast.error("Quote recalculation failed. Please get a new quote.");
      } finally {
        setQuoteRecalculating(false);
      }
    } else {
      // No existing quote, just show success message for item addition
      toast.success(`Item "${newItem.name}" added. Click "Get Quote from Items" to see pricing.`);
    }
  };

  const removeItem = async (index) => {
    const removedItem = items[index];
    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);
    
    // If there was a quote and items remain, automatically recalculate
    if (quote && updatedItems.length > 0) {
      setQuoteRecalculating(true);
      try {
        // For automatic recalculation, use the same format as manual quote generation
        const response = await axios.post(`${API}/quotes`, {
          items: updatedItems,
          description
        });
        
        setQuote(response.data);
        
        // Show success message with updated price
        toast.success(`Item "${removedItem.name}" removed. Quote updated to $${response.data.total_price}`);
        
      } catch (error) {
        console.error('Error recalculating quote after item removal:', error);
        // Clear quote on error - user will need to manually get new quote
        setQuote(null);
        toast.error("Quote recalculation failed. Please get a new quote.");
      } finally {
        setQuoteRecalculating(false);
      }
    } else {
      // No items left or no existing quote, clear the quote
      setQuote(null);
      if (updatedItems.length === 0) {
        toast.info(`Item "${removedItem.name}" removed. Please add items to get a new quote.`);
      }
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setQuoteError("Image must be less than 10MB");
        toast.error("Image must be less than 10MB");
        return;
      }
      setImageFile(file);
      setImageAnalyzed(false); // Reset analysis state when new image uploaded
      setQuoteError(''); // Clear any previous errors
      const reader = new FileReader();
      reader.onload = (e) => setUploadedImage(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const analyzeImageAndGetQuote = async () => {
    if (!imageFile) {
      setQuoteError("Please upload a photo of your items");
      toast.error("Please upload a photo of your items");
      return;
    }

    setImageAnalyzing(true);
    setQuoteError('');
    
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
      setImageAnalyzed(true);
      setQuoteStep(2); // Move to quote display step
      toast.success("Quote generated successfully!");
      
      // Don't auto-show approval modal - let customers proceed to booking form
    } catch (error) {
      const errorMsg = error.response?.data?.detail || "Failed to analyze image. Please try again.";
      setQuoteError(errorMsg);
      toast.error(errorMsg);
      console.error(error);
    } finally {
      setImageAnalyzing(false);
    }
  };

  const getQuote = async () => {
    if (items.length === 0) {
      toast.error("Please add at least one item or upload an image");
      return;
    }

    setQuoteLoading(true);
    try {
      const response = await axios.post(`${API}/quotes`, {
        items,
        description
      });
      setQuote(response.data);
      toast.success(`Quote generated successfully! Total: $${response.data.total_price}`);
    } catch (error) {
      toast.error("Failed to generate quote");
      console.error(error);
    } finally {
      setQuoteLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-w-full w-full bg-gradient-to-br from-black/40 to-emerald-900/50">
      {/* Toast notifications handled by global function */}
      
      {/* Navigation */}
      <nav className="bg-black/70 backdrop-blur-md border-b border-emerald-400/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 sm:py-4">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-base sm:text-xl">T2T</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">TEXT2TOSS</span>
                <span className="text-xs sm:text-sm text-emerald-300 font-medium tracking-wide">Professional Junk Removal</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-8">
                <a href="#how-it-works" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">How It Works</a>
                <a href="#contact" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">Contact</a>
              </div>
              <Button 
                onClick={() => setShowQuote(true)}
                size="sm"
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 min-w-0 font-medium"
                data-testid="get-quote-btn"
              >
                <span className="hidden sm:inline">📸 Upload & Quote</span>
                <span className="sm:hidden">Get Quote</span>
              </Button>
              <Link to="/admin">
                <Button 
                  variant="outline"
                  className="border-emerald-400 text-emerald-400 hover:bg-emerald-400 hover:text-white w-10 h-10 p-0 rounded-lg flex items-center justify-center"
                  data-testid="admin-login-nav-btn"
                >
                  🔐
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-8 sm:py-12 lg:py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-8 lg:gap-12 items-center">
            <div className="space-y-4 sm:space-y-6 lg:space-y-8 px-2 lg:px-0">
              <div className="space-y-4 lg:space-y-6">
                <div className="text-center lg:text-left">
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-xs sm:text-sm">
                    <span className="flex items-center justify-center flex-wrap">
                      <span>📸 AI-Powered Photo Quotes</span>
                      <span className="hidden sm:inline"> • No Callbacks Required</span>
                    </span>
                  </Badge>
                </div>
                <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-[10rem] xl:text-[12rem] font-black leading-tight text-center lg:text-left">
                  <span style={{
                    color: '#10b981',
                    textShadow: `
                      -4px -4px 0 white, -4px -3px 0 white, -4px -2px 0 white, -4px -1px 0 white, -4px 0 0 white, -4px 1px 0 white, -4px 2px 0 white, -4px 3px 0 white, -4px 4px 0 white,
                      -3px -4px 0 white, -3px 4px 0 white,
                      -2px -4px 0 white, -2px 4px 0 white,
                      -1px -4px 0 white, -1px 4px 0 white,
                      0px -4px 0 white, 0px 4px 0 white,
                      1px -4px 0 white, 1px 4px 0 white,
                      2px -4px 0 white, 2px 4px 0 white,
                      3px -4px 0 white, 3px 4px 0 white,
                      4px -4px 0 white, 4px -3px 0 white, 4px -2px 0 white, 4px -1px 0 white, 4px 0 0 white, 4px 1px 0 white, 4px 2px 0 white, 4px 3px 0 white, 4px 4px 0 white,
                      0 0 10px #00ff88, 0 0 20px #00ff88, 0 0 30px #00ff88, 0 0 40px #00ff88
                    `
                  }}>Text2toss</span>
                </h1>
                <div className="bg-emerald-900/40 border border-emerald-400/40 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
                  <p className="text-emerald-200 text-sm sm:text-base lg:text-lg font-semibold text-center">
                    📍 Servicing Flagstaff AZ and surrounding areas
                  </p>
                  <p className="text-emerald-300 text-xs sm:text-sm text-center mt-1">
                    Locally owned and operated business
                  </p>
                </div>
                <div className="text-sm sm:text-base lg:text-xl text-gray-200 leading-relaxed text-center lg:text-left px-2 lg:px-0 mb-3 sm:mb-4">
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
                <div className="bg-emerald-900/30 border border-emerald-400/30 rounded-lg p-3 sm:p-4 mt-3 sm:mt-4 mb-20">
                  <p className="text-emerald-200 text-xs sm:text-sm font-medium text-center lg:text-left">
                    📍 Ground Level & Curbside Pickup Only
                  </p>
                  <p className="text-emerald-300 text-xs sm:text-sm mt-1 text-center lg:text-left">
                    We pickup items from ground level locations and curbside. Items must be accessible without stairs.
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 lg:gap-4 justify-center px-2 sm:px-4 lg:px-0 max-w-full mx-auto">
                <Button 
                  onClick={() => setShowQuote(true)}
                  size="lg"
                  className="w-full sm:flex-1 bg-black border-4 border-white hover:bg-black/80 text-lg sm:text-xl lg:text-2xl font-black px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  data-testid="hero-get-quote-btn"
                  style={{
                    color: '#059669',
                    textShadow: `
                      -3px -3px 0 white, -3px -2px 0 white, -3px -1px 0 white, -3px 0 0 white, -3px 1px 0 white, -3px 2px 0 white, -3px 3px 0 white,
                      -2px -3px 0 white, -2px 3px 0 white,
                      -1px -3px 0 white, -1px 3px 0 white,
                      0px -3px 0 white, 0px 3px 0 white,
                      1px -3px 0 white, 1px 3px 0 white,
                      2px -3px 0 white, 2px 3px 0 white,
                      3px -3px 0 white, 3px -2px 0 white, 3px -1px 0 white, 3px 0 0 white, 3px 1px 0 white, 3px 2px 0 white, 3px 3px 0 white,
                      0 0 5px #10b981, 0 0 10px #10b981
                    `
                  }}
                >
                  <span className="flex items-center justify-center space-x-3">
                    <span className="text-lg sm:text-2xl lg:text-3xl">📸</span>
                    <span className="whitespace-nowrap">UPLOAD & QUOTE</span>
                  </span>
                </Button>
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

      {/* NEW: Improved Quote Modal - Step-by-Step Wizard */}
      {showQuote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl max-h-[95vh] my-2 sm:my-0 shadow-2xl overflow-y-auto">
            
            {/* TOP Progress Indicator */}
            <div className="bg-emerald-50 border-b border-emerald-200 p-4 sticky top-0 z-10">
              <div className="flex items-center justify-center space-x-2">
                {/* Step 1 Indicator */}
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    quoteStep > 1 ? "bg-emerald-600 text-white" :
                    quoteStep === 1 ? "bg-emerald-500 text-white ring-4 ring-emerald-200" :
                    "bg-gray-200 text-gray-500"
                  }`}>
                    {quoteStep > 1 ? "✓" : "1"}
                  </div>
                  <p className={`text-xs mt-1 font-medium ${quoteStep === 1 ? "text-emerald-700" : "text-gray-500"}`}>
                    Upload
                  </p>
                </div>
                
                <div className="w-12 h-1 bg-emerald-200"></div>
                
                {/* Step 2 Indicator */}
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    quoteStep > 2 ? "bg-emerald-600 text-white" :
                    quoteStep === 2 ? "bg-emerald-500 text-white ring-4 ring-emerald-200" :
                    "bg-gray-200 text-gray-500"
                  }`}>
                    {quoteStep > 2 ? "✓" : "2"}
                  </div>
                  <p className={`text-xs mt-1 font-medium ${quoteStep === 2 ? "text-emerald-700" : "text-gray-500"}`}>
                    Quote
                  </p>
                </div>
                
                <div className="w-12 h-1 bg-emerald-200"></div>
                
                {/* Step 3 Indicator */}
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                    quoteStep === 3 ? "bg-emerald-500 text-white ring-4 ring-emerald-200" :
                    "bg-gray-200 text-gray-500"
                  }`}>
                    3
                  </div>
                  <p className={`text-xs mt-1 font-medium ${quoteStep === 3 ? "text-emerald-700" : "text-gray-500"}`}>
                    Book
                  </p>
                </div>
              </div>
            </div>

            {/* STEP 1: Upload Photo */}
            {quoteStep === 1 && (
              <>
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-3xl font-bold text-emerald-800">
                    📸 Upload Your Junk Photo
                  </CardTitle>
                  <CardDescription className="text-base">
                    Take a clear photo of the items you want removed
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Error Message */}
                  {quoteError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                      <p className="text-red-700 text-sm font-medium">⚠️ {quoteError}</p>
                    </div>
                  )}

                  {/* Important Notice - Photo Tips (moved above upload) */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800 font-medium mb-2">
                      📋 Photo Tips for Accurate Quotes:
                    </p>
                    <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                      <li>Include all items in one photo if possible</li>
                      <li>Ensure good lighting for clear visibility</li>
                      <li>Show items from a distance to capture full size</li>
                    </ul>
                  </div>

                  {/* Image Upload Area */}
                  <div className="space-y-4">
                    {!uploadedImage ? (
                      <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-emerald-300 rounded-lg cursor-pointer bg-emerald-50 hover:bg-emerald-100 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <span className="text-6xl mb-4">📷</span>
                          <p className="mb-2 text-sm font-semibold text-emerald-700">
                            Click to upload photo
                          </p>
                          <p className="text-xs text-emerald-600">
                            PNG, JPG or HEIC (max 10MB)
                          </p>
                        </div>
                        <Input
                          type="file"
                          accept="image/*,image/heic,image/heif"
                          onChange={handleImageUpload}
                          className="hidden"
                          data-testid="image-upload-input"
                        />
                      </label>
                    ) : (
                      <div className="relative">
                        <img
                          src={uploadedImage}
                          alt="Uploaded items"
                          className="w-full h-64 object-cover rounded-lg border-2 border-emerald-300"
                        />
                        <Button
                          onClick={() => {
                            setImageFile(null);
                            setUploadedImage(null);
                            setQuoteError('');
                          }}
                          variant="destructive"
                          size="sm"
                          className="absolute top-2 right-2"
                        >
                          ✕ Remove
                        </Button>
                        <Badge className="absolute bottom-2 left-2 bg-green-600 text-white">
                          ✓ Photo Ready
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Description (Optional) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Brief Description (Optional)
                    </label>
                    <Textarea
                      placeholder="e.g., Old furniture in garage, mattress, boxes..."
                      value={imageDescription}
                      onChange={(e) => setImageDescription(e.target.value)}
                      className="min-h-[80px]"
                      maxLength={200}
                      data-testid="image-description-input"
                    />
                    <p className="text-xs text-gray-500 text-right">
                      {imageDescription.length}/200 characters
                    </p>
                  </div>
                  
                  {/* Service Area Notice */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-yellow-800 text-xs font-medium">
                      📍 <strong>Service Area:</strong> Ground level & curbside pickup only. No stairs or upper floors.
                    </p>
                  </div>
                </CardContent>

                {/* Actions */}
                <div className="p-6 bg-gray-50 border-t flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowQuote(false);
                      setQuoteStep(1);
                      setImageFile(null);
                      setUploadedImage(null);
                      setQuoteError('');
                      setImageDescription('');
                    }}
                    disabled={imageAnalyzing}
                    data-testid="cancel-quote-btn"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={analyzeImageAndGetQuote}
                    disabled={!imageFile || imageAnalyzing}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 px-8"
                    data-testid="get-instant-quote-btn"
                  >
                    {imageAnalyzing ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Analyzing Photo...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Get Instant Quote →
                      </span>
                    )}
                  </Button>
                </div>

                {/* BOTTOM Progress Indicator - Step 1 */}
                <div className="bg-emerald-50 border-t border-emerald-200 p-3">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm ring-2 ring-emerald-200">
                        1
                      </div>
                      <span className="text-sm font-semibold text-emerald-700">Upload Photo</span>
                    </div>
                    <div className="w-8 h-0.5 bg-emerald-300"></div>
                    <div className="flex items-center gap-2 opacity-50">
                      <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm">
                        2
                      </div>
                      <span className="text-sm text-gray-500">View Quote</span>
                    </div>
                    <div className="w-8 h-0.5 bg-gray-300"></div>
                    <div className="flex items-center gap-2 opacity-50">
                      <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm">
                        3
                      </div>
                      <span className="text-sm text-gray-500">Book & Pay</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* STEP 2: Quote Display */}
            {quoteStep === 2 && quote && (
              <>
                <CardHeader className="text-center pb-4 bg-emerald-50">
                  <div className="flex justify-center mb-4">
                    <span className="text-6xl">💰</span>
                  </div>
                  <CardTitle className="text-4xl font-bold text-emerald-800">
                    ${quote.total_price}
                  </CardTitle>
                  <CardDescription className="text-lg font-medium text-emerald-700">
                    Your Instant Quote
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6 pt-6">
                  {/* Quote ID */}
                  <div className="text-center">
                    <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                      Quote ID: {quote.id?.substring(0, 8)}
                    </Badge>
                  </div>

                  {/* Items Identified */}
                  {quote.breakdown && quote.breakdown.items && quote.breakdown.items.length > 0 && (
                    <div className="bg-white border border-emerald-200 rounded-lg p-4">
                      <h4 className="font-semibold text-emerald-800 mb-3 text-center">
                        📋 Items Identified
                      </h4>
                      <div className="space-y-2">
                        {quote.breakdown.items.map((item, index) => (
                          <div key={index} className="flex justify-between items-center py-2 border-b last:border-b-0">
                            <span className="text-sm font-medium text-gray-700">
                              {item.name} <span className="text-xs text-gray-500">({item.size})</span>
                            </span>
                            <span className="text-sm font-semibold text-emerald-600">
                              ${item.estimated_cost || 'Included'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Explanation */}
                  {quote.ai_explanation && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-xs font-semibold text-blue-800 mb-2">🤖 AI Analysis:</p>
                      <p className="text-sm text-blue-700">{quote.ai_explanation}</p>
                    </div>
                  )}

                  {/* Approval Notice for Large Jobs */}
                  {quote.requires_approval && (
                    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">📧</span>
                        <div>
                          <p className="text-base font-bold text-yellow-900 mb-2">
                            ⏳ Quote Requires Admin Approval
                          </p>
                          <p className="text-sm text-yellow-800 mb-2">
                            <strong>Please click "Continue to Booking" below</strong> to provide your contact info and preferred pickup date/time.
                          </p>
                          <p className="text-xs text-yellow-700">
                            ✓ Payment is blocked until quote is approved<br/>
                            ✓ You'll receive an email within 24 hours with approval<br/>
                            ✓ Then you can complete payment to confirm your booking
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Service Note */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-xs text-gray-600 text-center">
                      ℹ️ Ground level & curbside pickup only. Items must be accessible without stairs.
                    </p>
                  </div>
                </CardContent>

                {/* Actions */}
                <div className="p-6 bg-gray-50 border-t flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuoteStep(1);
                      setQuote(null);
                      setImageFile(null);
                      setUploadedImage(null);
                      setImageDescription('');
                    }}
                  >
                    ← New Quote
                  </Button>
                  
                  {/* Always allow booking form entry, payment blocked later if approval required */}
                  <Button
                    onClick={() => {
                      setShowBooking(true);
                      setShowQuote(false);
                    }}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 px-8"
                    data-testid="book-pickup-btn"
                  >
                    Continue to Booking →
                  </Button>
                </div>

                {/* BOTTOM Progress Indicator - Step 2 */}
                <div className="bg-emerald-50 border-t border-emerald-200 p-3">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="flex items-center gap-2 opacity-70">
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                        ✓
                      </div>
                      <span className="text-sm text-emerald-600 font-medium">Uploaded</span>
                    </div>
                    <div className="w-8 h-0.5 bg-emerald-400"></div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm ring-2 ring-emerald-200">
                        2
                      </div>
                      <span className="text-sm font-semibold text-emerald-700">Quote Ready</span>
                    </div>
                    <div className="w-8 h-0.5 bg-emerald-300"></div>
                    <div className="flex items-center gap-2 opacity-50">
                      <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm">
                        3
                      </div>
                      <span className="text-sm text-gray-500">Book & Pay</span>
                    </div>
                  </div>
                </div>
              </>
            )}

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

      {/* Quote Approval Required Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl animate-fadeIn my-8 max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-4 sm:p-6 rounded-t-2xl flex-shrink-0">
              <div className="flex items-center justify-center mb-2">
                <span className="text-3xl sm:text-4xl">📧</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-center">Quote Under Review</h3>
            </div>
            
            <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
              <div className="bg-blue-50 border border-blue-300 rounded-lg p-3 sm:p-4">
                <p className="text-sm sm:text-base font-semibold text-blue-900 mb-2">
                  ✓ Quote Successfully Submitted
                </p>
                <p className="text-xs sm:text-sm text-blue-800 leading-relaxed">
                  Your quote request is currently under review by our team. We will carefully assess your requirements and provide you with an accurate quote.
                </p>
              </div>
              
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3 sm:p-4">
                <p className="text-sm sm:text-base font-bold text-red-900 mb-1">
                  🔒 Payment Blocked Until Approval
                </p>
                <p className="text-xs sm:text-sm text-red-800">
                  You cannot proceed to payment until your quote is reviewed and approved by our team. This ensures accuracy and prevents confusion.
                </p>
              </div>
              
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <span className="text-xl sm:text-2xl mt-1 flex-shrink-0">📧</span>
                  <div>
                    <p className="text-sm sm:text-base font-semibold text-gray-900 mb-1">Expect a Response Within 24 Hours</p>
                    <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                      You will receive an email notification with your approved quote and next steps. Please check your inbox (and spam folder) for our response.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <span className="text-xl sm:text-2xl mt-1 flex-shrink-0">💳</span>
                  <div>
                    <p className="text-sm sm:text-base font-semibold text-gray-900 mb-1">Payment After Approval Only</p>
                    <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                      Once your quote is approved, you will receive a link to complete Step 3 (Payment) to confirm your booking. <strong>No charges will be made until you review and approve the final quote.</strong>
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <span className="text-xl sm:text-2xl mt-1 flex-shrink-0">👋</span>
                  <div>
                    <p className="text-sm sm:text-base font-semibold text-gray-900 mb-1">You May Exit This Page</p>
                    <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                      Thank you for choosing Text2toss! You can safely close this page. We will contact you via email with your approved quote.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 sm:p-4 text-center">
                <p className="text-xs sm:text-sm text-emerald-800 font-medium">
                  📞 Questions? We're here to help! Contact us anytime.
                </p>
              </div>
            </div>
            
            <div className="p-4 sm:p-6 bg-gray-50 rounded-b-2xl space-y-2 sm:space-y-3 flex-shrink-0 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setShowBooking(true);
                  setShowQuote(false);
                }}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 px-4 sm:px-6 rounded-lg text-sm sm:text-base font-semibold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg"
              >
                📝 Provide Booking Details Now
              </button>
              <button
                onClick={() => setShowApprovalModal(false)}
                className="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 px-4 sm:px-6 rounded-lg text-sm sm:text-base font-semibold hover:bg-gray-50 transition-all"
              >
                I'll Wait for Email
              </button>
            </div>
          </div>
        </div>
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
                <span className="text-2xl sm:text-4xl font-black text-white tracking-tight">TEXT2TOSS</span>
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
  // Use the real Text2toss Venmo QR code
  const venmoQRCodeUrl = "https://www.paypal.com/qrcodes/venmocs/9f1f97dd-23ed-4676-82b5-3fc2126def65?created=1762118921";
  const venmoUrl = `venmo://paycharge?txn=pay&recipients=Text2toss&amount=${quote.total_price}&note=Text2toss%20Booking%20${bookingId.substring(0, 8)}`;
  
  const copyBookingId = () => {
    navigator.clipboard.writeText(bookingId.substring(0, 8));
    toast.success("Booking ID copied to clipboard!");
  };

  const openVenmoApp = () => {
    // Try to open Venmo app, fallback to web
    window.location.href = venmoUrl;
    // Fallback to web after 1 second if app doesn't open
    setTimeout(() => {
      window.open(`https://venmo.com/?txn=pay&recipients=Text2toss&amount=${quote.total_price}&note=Booking%20${bookingId.substring(0, 8)}`, '_blank');
    }, 1000);
  };

  const handlePayLater = async () => {
    try {
      // Send payment reminder SMS
      await axios.post(`${API}/bookings/${bookingId}/payment-reminder`);
      toast.success("Payment reminder sent! Check your phone for details.");
      onClose();
    } catch (error) {
      console.error("Failed to send payment reminder:", error);
      toast.error("Could not send reminder, but your booking is confirmed!");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full max-h-[95vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-center relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:text-gray-200 text-3xl font-bold leading-none"
          >
            ×
          </button>
          <div className="text-white">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-2xl font-bold mb-2">Booking Confirmed!</h2>
            <p className="text-white/90 text-sm">Booking ID: {bookingId.substring(0, 8)}</p>
          </div>
        </div>

        <CardContent className="p-6 space-y-6">
          {/* Booking Summary */}
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4">
            <h3 className="font-bold text-emerald-900 mb-3 text-lg">📋 Booking Summary</h3>
            <div className="space-y-2 text-emerald-800">
              <div className="flex justify-between">
                <span className="font-medium">Amount Due:</span>
                <span className="font-bold text-xl">${quote.total_price}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Service:</span>
                <span>Junk Removal</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Payment Method:</span>
                <span className="font-semibold">Venmo</span>
              </div>
            </div>
          </div>

          {/* Payment Instructions */}
          <div>
            <h3 className="font-bold text-gray-900 mb-4 text-lg text-center">
              💳 Complete Payment via Venmo
            </h3>
            
            {/* QR Code - Using Real Text2toss Venmo QR */}
            <div className="text-center mb-4">
              <div className="inline-block p-4 bg-white border-4 border-gray-300 rounded-2xl shadow-lg">
                <img 
                  src={venmoQRCodeUrl} 
                  alt="Text2toss Venmo Payment QR Code" 
                  className="w-48 h-48 mx-auto"
                  onError={(e) => {
                    // Fallback to generated QR if static QR fails to load
                    e.target.src = qrCode;
                  }}
                />
              </div>
              <p className="text-gray-700 font-semibold mt-3 text-base">📱 Scan with Venmo app</p>
              <p className="text-gray-600 text-sm mt-1">Opens directly to payment screen</p>
            </div>

            {/* OR Divider */}
            <div className="flex items-center my-6">
              <hr className="flex-1 border-gray-400" />
              <span className="px-4 text-gray-600 font-semibold text-base">OR</span>
              <hr className="flex-1 border-gray-400" />
            </div>

            {/* Manual Payment Instructions */}
            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-5">
              <h4 className="font-bold text-blue-900 mb-3 text-base">📱 Manual Payment:</h4>
              <ul className="space-y-3 text-blue-900">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-lg">1.</span>
                  <span className="font-medium">
                    Send <span className="font-bold text-xl text-blue-600">${quote.total_price}</span> to <span className="font-bold">@Text2toss</span>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-lg">2.</span>
                  <div className="flex-1">
                    <span className="font-medium">Include booking ID in note: </span>
                    <span className="font-bold bg-blue-200 px-2 py-1 rounded">{bookingId.substring(0, 8)}</span>
                    <button 
                      onClick={copyBookingId}
                      className="ml-2 text-blue-700 hover:text-blue-900 underline font-semibold text-sm"
                    >
                      (Copy ID)
                    </button>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-lg">3.</span>
                  <span className="font-medium">We'll confirm payment and send pickup details via SMS</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button 
              onClick={openVenmoApp}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 text-lg font-bold shadow-lg"
            >
              📱 Open Venmo App
            </Button>
            
            <Button 
              onClick={handlePayLater}
              variant="outline"
              className="w-full py-4 border-2 border-gray-300 text-gray-700 font-semibold text-base hover:bg-gray-50"
            >
              📧 Email Me Payment Details
            </Button>
          </div>

          {/* Important Note */}
          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4">
            <p className="text-yellow-900 font-medium text-sm">
              <span className="font-bold text-base">⚠️ Important:</span> Your pickup is scheduled but payment is required to confirm the service. 
              We'll send SMS confirmation once payment is received at <strong>@Text2toss</strong>.
            </p>
          </div>
        </CardContent>
      </Card>
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
    email: "",
    special_instructions: "",
    curbside_confirmed: false,
    email_notifications: true
  });
  const [bookedTimeSlots, setBookedTimeSlots] = useState([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({}); // Track validation errors

  // Check if date is allowed (no Fridays, Saturdays, Sundays)
  const isDateAllowed = (dateString) => {
    // Parse date as local time to avoid timezone shift
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
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
    setShowCalendar(false); // Close calendar after selection
  };

  const handleVenmoBooking = async () => {
    // Reset previous errors
    setFieldErrors({});
    
    // Validate all required fields
    const errors = {};
    const missingFields = [];
    
    if (!bookingData.pickup_date) {
      errors.pickup_date = true;
      missingFields.push("Pickup Date");
    }
    
    if (!bookingData.pickup_time) {
      errors.pickup_time = true;
      missingFields.push("Pickup Time");
    }
    
    if (!bookingData.address || bookingData.address.trim() === '') {
      errors.address = true;
      missingFields.push("Service Address");
    }
    
    if (!bookingData.phone || bookingData.phone.trim() === '') {
      errors.phone = true;
      missingFields.push("Phone Number");
    }
    
    if (!bookingData.email || bookingData.email.trim() === '') {
      errors.email = true;
      missingFields.push("Email Address");
    }
    
    if (!bookingData.curbside_confirmed) {
      errors.curbside_confirmed = true;
      missingFields.push("Curbside Confirmation");
    }
    
    // If there are any missing fields, show error and highlight them
    if (missingFields.length > 0) {
      setFieldErrors(errors);
      const fieldList = missingFields.join(", ");
      toast.error(`Please complete the following required fields: ${fieldList}`);
      
      // Scroll to first error field
      setTimeout(() => {
        const firstErrorField = document.querySelector('.border-red-500');
        if (firstErrorField) {
          firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstErrorField.focus();
        }
      }, 100);
      
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
      
      // If quote requires approval, show success message and close
      if (quote.requires_approval) {
        toast.success("Booking information submitted! We'll contact you within 24 hours after quote approval.");
        onSuccess(); // Close the modal
        return;
      }
      
      // For non-approval quotes, proceed with payment
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-start justify-center p-4 overflow-y-auto pt-8">
      <Card className="w-full max-w-2xl shadow-2xl border-0 mb-8 max-h-[calc(100vh-4rem)]">
        {/* Sticky Header with Price & Progress */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-t-lg">
          {/* Progress Indicator */}
          <div className="bg-emerald-600/30 px-4 py-3 border-b border-white/20">
            <div className="flex items-center justify-center space-x-2">
              <div className="flex items-center gap-1 opacity-70">
                <div className="w-6 h-6 rounded-full bg-white/30 text-white flex items-center justify-center text-xs font-bold">✓</div>
                <span className="text-xs text-white/80 hidden sm:inline">Photo</span>
              </div>
              <div className="w-8 h-0.5 bg-white/30"></div>
              <div className="flex items-center gap-1 opacity-70">
                <div className="w-6 h-6 rounded-full bg-white/30 text-white flex items-center justify-center text-xs font-bold">✓</div>
                <span className="text-xs text-white/80 hidden sm:inline">Quote</span>
              </div>
              <div className="w-8 h-0.5 bg-white/40"></div>
              <div className="flex items-center gap-1">
                <div className="w-6 h-6 rounded-full bg-white text-emerald-600 flex items-center justify-center text-xs font-bold ring-2 ring-white/50">3</div>
                <span className="text-xs text-white font-semibold">Book & Pay</span>
              </div>
            </div>
          </div>
          
          {/* Price Header */}
          <div className="p-4 text-center">
            <div className="text-white">
              <h2 className="text-2xl font-bold mb-2">Complete Your Booking</h2>
              <div className="flex items-center justify-center gap-2">
                <span className="text-4xl font-black">${quote.total_price}</span>
                <Badge className="bg-white/20 text-white border-0 text-xs px-2 py-1">
                  💳 Venmo
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto max-h-[calc(100vh-16rem)]">
          <CardContent className="p-4 sm:p-6 space-y-5">
          
          {/* Approval Required Notice */}
          {quote.requires_approval && (
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-lg p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="text-3xl">⏳</span>
                <div>
                  <p className="text-base font-bold text-yellow-900 mb-2">
                    Quote Pending Admin Approval
                  </p>
                  <p className="text-sm text-yellow-800 mb-2">
                    Please fill out your booking information below. Your booking will be held as <strong>pending</strong> until your quote is approved.
                  </p>
                  <p className="text-xs text-yellow-700">
                    ✓ No payment will be processed until quote is approved<br/>
                    ✓ We'll contact you within 24 hours with approval<br/>
                    ✓ You can then complete payment to confirm your booking
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Schedule Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-emerald-500">
              <span className="text-2xl">📅</span>
              <h3 className="text-xl font-bold text-gray-800">Schedule Pickup</h3>
            </div>

            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="text-base font-semibold text-gray-700">Select Date</Label>
              <Button
                variant="outline"
                onClick={() => setShowCalendar(true)}
                className="w-full justify-between text-left h-14 border-2 border-gray-200 hover:border-emerald-400 text-gray-700 hover:bg-emerald-50 font-medium text-base"
                data-testid="pickup-date-button"
              >
                <span>
                  {bookingData.pickup_date ? 
                    (() => {
                      // Parse date as local time to avoid timezone shift
                      const [year, month, day] = bookingData.pickup_date.split('-').map(Number);
                      const date = new Date(year, month - 1, day);
                      return date.toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      });
                    })() :
                    "Choose your pickup date"
                  }
                </span>
                <span className="text-2xl">📅</span>
              </Button>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span> Available
                <span className="mx-2">•</span>
                <span className="w-2 h-2 bg-red-500 rounded-full"></span> Booked
                <span className="mx-2">•</span>
                Mon-Thu only
              </p>
            </div>

            {/* Time Picker */}
            <div className="space-y-2">
              <Label className="text-base font-semibold text-gray-700">Select Time Window</Label>
              <Select 
                value={bookingData.pickup_time} 
                onValueChange={(value) => setBookingData({...bookingData, pickup_time: value})}
                disabled={!bookingData.pickup_date || checkingAvailability}
              >
                <SelectTrigger className="h-14 border-2 text-base" data-testid="pickup-time-select">
                  <SelectValue placeholder={
                    checkingAvailability ? "⏳ Checking..." : 
                    !bookingData.pickup_date ? "Select date first" : 
                    "Choose time window"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { value: "08:00-10:00", label: "Morning (8-10 AM)", icon: "🌅" },
                    { value: "10:00-12:00", label: "Late Morning (10 AM-12 PM)", icon: "☀️" },
                    { value: "12:00-14:00", label: "Afternoon (12-2 PM)", icon: "🕐" },
                    { value: "14:00-16:00", label: "Mid Afternoon (2-4 PM)", icon: "☀️" },
                    { value: "16:00-18:00", label: "Evening (4-6 PM)", icon: "🌆" }
                  ].map(timeSlot => {
                    const isBooked = bookedTimeSlots.includes(timeSlot.value);
                    return (
                      <SelectItem 
                        key={timeSlot.value}
                        value={timeSlot.value} 
                        disabled={isBooked}
                        className={`${isBooked ? "opacity-50 cursor-not-allowed" : ""} py-3`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{timeSlot.icon}</span>
                          <span>{timeSlot.label}</span>
                          {isBooked && <span className="text-red-600 font-semibold">• Booked</span>}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-emerald-500">
              <span className="text-2xl">📍</span>
              <h3 className="text-xl font-bold text-gray-800">Contact Details</h3>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label className="text-base font-semibold text-gray-700">
                  Pickup Address {fieldErrors.address && <span className="text-red-600">*Required</span>}
                </Label>
                <Textarea
                  placeholder="Enter your full address..."
                  value={bookingData.address}
                  onChange={(e) => {
                    setBookingData({...bookingData, address: e.target.value});
                    setFieldErrors({...fieldErrors, address: false}); // Clear error on change
                  }}
                  className={`min-h-[80px] border-2 resize-none text-base ${fieldErrors.address ? 'border-red-500 bg-red-50 focus:border-red-600 focus:ring-red-500' : ''}`}
                  data-testid="address-textarea"
                />
                {fieldErrors.address && (
                  <p className="text-red-600 text-sm font-medium flex items-center gap-1">
                    <span>⚠️</span> Please enter your pickup address
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label className="text-base font-semibold text-gray-700">
                  Email Address {fieldErrors.email && <span className="text-red-600">*Required</span>}
                </Label>
                <Input
                  type="email"
                  placeholder="your.email@example.com"
                  value={bookingData.email}
                  onChange={(e) => {
                    setBookingData({...bookingData, email: e.target.value});
                    setFieldErrors({...fieldErrors, email: false}); // Clear error on change
                  }}
                  className={`h-12 border-2 text-base ${fieldErrors.email ? 'border-red-500 bg-red-50 focus:border-red-600 focus:ring-red-500' : ''}`}
                  data-testid="email-input"
                />
                {fieldErrors.email && (
                  <p className="text-red-600 text-sm font-medium flex items-center gap-1">
                    <span>⚠️</span> Please enter your email address
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label className="text-base font-semibold text-gray-700">
                  Phone Number {fieldErrors.phone && <span className="text-red-600">*Required</span>}
                </Label>
                <Input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={bookingData.phone}
                  onChange={(e) => {
                    setBookingData({...bookingData, phone: e.target.value});
                    setFieldErrors({...fieldErrors, phone: false}); // Clear error on change
                  }}
                  className={`h-12 border-2 text-base ${fieldErrors.phone ? 'border-red-500 bg-red-50 focus:border-red-600 focus:ring-red-500' : ''}`}
                  data-testid="phone-input"
                />
                {fieldErrors.phone && (
                  <p className="text-red-600 text-sm font-medium flex items-center gap-1">
                    <span>⚠️</span> Please enter your phone number
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b-2 border-emerald-500">
              <span className="text-2xl">✓</span>
              <h3 className="text-xl font-bold text-gray-800">Requirements</h3>
            </div>

            {/* Curbside Confirmation */}
            <div className={`bg-amber-50 border-2 rounded-xl p-4 ${fieldErrors.curbside_confirmed ? 'border-red-500 bg-red-50' : 'border-amber-200'}`}>
              <div 
                onClick={() => {
                  setBookingData({...bookingData, curbside_confirmed: !bookingData.curbside_confirmed});
                  setFieldErrors({...fieldErrors, curbside_confirmed: false});
                }}
                className="flex items-start gap-3 sm:gap-4 cursor-pointer"
              >
                {/* Custom Checkbox */}
                <div className="mt-1 flex-shrink-0">
                  <div className={`
                    w-7 h-7 sm:w-6 sm:h-6 
                    rounded border-2 
                    flex items-center justify-center
                    transition-all duration-200
                    ${bookingData.curbside_confirmed 
                      ? 'bg-emerald-500 border-emerald-500' 
                      : 'bg-white border-gray-400'
                    }
                  `}>
                    {bookingData.curbside_confirmed && (
                      <svg className="w-5 h-5 sm:w-4 sm:h-4 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" stroke="currentColor">
                        <path d="M5 13l4 4L19 7"></path>
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-base">
                    Items are curbside & ground level {fieldErrors.curbside_confirmed && <span className="text-red-600">*Required</span>}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    All items must be accessible from street level without stairs
                  </p>
                  {fieldErrors.curbside_confirmed && (
                    <p className="text-red-600 text-sm font-medium flex items-center gap-1 mt-2">
                      <span>⚠️</span> You must confirm curbside placement to proceed
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Email Notifications Opt-in */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <div 
                onClick={() => setBookingData({...bookingData, email_notifications: !bookingData.email_notifications})}
                className="flex items-start gap-3 sm:gap-4 cursor-pointer"
              >
                {/* Custom Checkbox */}
                <div className="mt-1 flex-shrink-0">
                  <div className={`
                    w-7 h-7 sm:w-6 sm:h-6 
                    rounded border-2 
                    flex items-center justify-center
                    transition-all duration-200
                    ${bookingData.email_notifications 
                      ? 'bg-blue-500 border-blue-500' 
                      : 'bg-white border-gray-400'
                    }
                  `}>
                    {bookingData.email_notifications && (
                      <svg className="w-5 h-5 sm:w-4 sm:h-4 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" stroke="currentColor">
                        <path d="M5 13l4 4L19 7"></path>
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-base">
                    📧 Get Email Updates (Recommended)
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Receive booking confirmation, payment reminders, and job updates via email
                  </p>
                </div>
              </div>
            </div>

            {/* Special Instructions */}
            <div className="space-y-2">
              <Label className="text-base font-semibold text-gray-700">Special Instructions (Optional)</Label>
              <Textarea
                placeholder="Any additional details we should know..."
                value={bookingData.special_instructions}
                onChange={(e) => setBookingData({...bookingData, special_instructions: e.target.value})}
                className="min-h-[80px] border-2 resize-none text-base"
                data-testid="special-instructions-textarea"
              />
            </div>
          </div>

          {/* Payment Info */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-4 text-center">
            <p className="text-base font-bold text-blue-900 mb-1">
              💰 Payment via Venmo Only
            </p>
            <p className="text-sm text-blue-800">
              After booking, you'll receive payment instructions to complete via <strong>@Text2toss</strong>
            </p>
          </div>
          </CardContent>
        </div>

        {/* Sticky Footer Actions */}
        <div className="sticky bottom-0 p-4 bg-white border-t border-gray-200 flex flex-col sm:flex-row gap-3 rounded-b-lg">
          <Button 
            variant="outline" 
            onClick={onClose} 
            data-testid="cancel-booking-btn" 
            className="flex-1 h-12 border-2 text-base font-semibold"
          >
            Cancel
          </Button>
          
          {/* Different button based on approval status */}
          {quote.requires_approval ? (
            <Button 
              onClick={handleVenmoBooking}
              data-testid="venmo-booking-btn" 
              className="flex-1 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white text-base font-bold shadow-lg hover:shadow-xl transition-all"
            >
              📝 Submit Booking (Pending Approval)
            </Button>
          ) : (
            <Button 
              onClick={handleVenmoBooking}
              data-testid="venmo-booking-btn" 
              className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-base font-bold shadow-lg hover:shadow-xl transition-all"
            >
              📱 Confirm Booking
            </Button>
          )}
        </div>
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
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="/admin" element={<ProtectedAdmin />} />
          <Route path="/customer-approval/:token" element={<CustomerApproval />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;