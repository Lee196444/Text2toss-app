import React, { useState, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import ProtectedAdmin from "./components/ProtectedAdmin";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
import { Calendar } from "./components/ui/calendar";
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
      
      {/* Navigation */}
      <nav className="bg-black/70 backdrop-blur-md border-b border-emerald-400/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">T2T</span>
              </div>
              <span className="text-2xl font-bold text-white">Text2toss</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#how-it-works" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">How It Works</a>
              <a href="#pricing" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">Pricing</a>
              <a href="#contact" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">Contact</a>
            </div>
            <div className="flex items-center space-x-3">
              <Link to="/admin">
                <Button 
                  variant="outline"
                  className="border-emerald-400 text-emerald-400 hover:bg-emerald-400 hover:text-white"
                  data-testid="admin-login-nav-btn"
                >
                  🔐 Admin Login
                </Button>
              </Link>
              <Button 
                onClick={() => setShowQuote(true)}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6"
                data-testid="get-quote-btn"
              >
                📸 Upload & Quote
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
                  📸 AI-Powered Photo Quotes • No Callbacks Required
                </Badge>
                <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">
                  <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Text2toss</span>
                </h1>
                <div className="bg-emerald-900/40 border border-emerald-400/40 rounded-lg p-4 mb-4">
                  <p className="text-emerald-200 text-lg font-semibold text-center">
                    📍 Servicing Flagstaff AZ and surrounding areas
                  </p>
                  <p className="text-emerald-300 text-sm text-center mt-1">
                    Locally owned and operated business
                  </p>
                </div>
                <p className="text-xl text-gray-200 leading-relaxed">
                  Upload photo of junk and quick description, get a quote in seconds! 
                  No more waiting on callbacks and no more hassles. 
                  <strong>Junk removal made seamless.</strong>
                </p>
                <div className="bg-emerald-900/30 border border-emerald-400/30 rounded-lg p-4 mt-4">
                  <p className="text-emerald-200 text-sm font-medium">
                    📍 Ground Level & Curbside Pickup Only
                  </p>
                  <p className="text-emerald-300 text-sm mt-1">
                    We pickup items from ground level locations and curbside. Items must be accessible without stairs.
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  onClick={() => setShowQuote(true)}
                  size="lg"
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-lg px-8 py-6"
                  data-testid="hero-get-quote-btn"
                >
                  📸 Upload Photo & Get Quote
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-lg px-8 py-6"
                  data-testid="learn-more-btn"
                  onClick={() => {
                    document.getElementById('how-it-works').scrollIntoView({ 
                      behavior: 'smooth' 
                    });
                  }}
                >
                  Learn More
                </Button>
              </div>

              <div className="flex items-center space-x-8">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-gray-200">No Callbacks Required</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-gray-200">Instant Photo Quotes</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-gray-200">Same Day Pickup</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="relative z-10">
                <img 
                  src="https://customer-assets.emergentagent.com/job_clutterclear-1/artifacts/j1lldodm_20250618_102613.jpg"
                  alt="Text2toss truck loaded with junk from actual job in Flagstaff AZ"
                  className="rounded-2xl shadow-2xl w-full h-auto object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full opacity-20 blur-xl"></div>
              <div className="absolute -top-4 -left-4 w-32 h-32 bg-gradient-to-br from-teal-400 to-emerald-500 rounded-full opacity-15 blur-2xl"></div>
            </div>
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
                  Choose a convenient time for pickup and pay securely online. 
                  We accept card payments and Venmo for your convenience.
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
                        </h3>
                        <p className="text-emerald-600 text-sm mb-2">Quote ID: {quote.id}</p>
                        {quote.ai_explanation && (
                          <div className="bg-white/50 rounded-lg p-3 mb-4">
                            <p className="text-xs text-gray-600 mb-1">🤖 AI Pricing Analysis</p>
                            <p className="text-sm text-gray-700">{quote.ai_explanation}</p>
                          </div>
                        )}
                      </div>
                      <Button 
                        onClick={() => setShowBooking(true)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        data-testid="book-pickup-btn"
                      >
                        Book Pickup
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
        />
      )}
    </div>
  );
};

// Booking Modal Component
const BookingModal = ({ quote, onClose, onSuccess }) => {
  const [bookingData, setBookingData] = useState({
    pickup_date: "",
    pickup_time: "",
    address: "",
    phone: "",
    special_instructions: ""
  });
  const [bookedTimeSlots, setBookedTimeSlots] = useState([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

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

  const handleBooking = async () => {
    if (!bookingData.pickup_date || !bookingData.pickup_time || !bookingData.address || !bookingData.phone) {
      toast.error("Please fill in all required fields");
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
      // First create the booking
      const bookingResponse = await axios.post(`${API}/bookings`, {
        quote_id: quote.id,
        ...bookingData
      });
      
      const bookingId = bookingResponse.data.id;
      
      // Then initiate payment
      const paymentResponse = await axios.post(`${API}/payments/create-checkout-session`, {
        booking_id: bookingId,
        origin_url: window.location.origin
      });
      
      // Redirect to Stripe checkout
      if (paymentResponse.data.url) {
        window.location.href = paymentResponse.data.url;
      } else {
        throw new Error("Payment session creation failed");
      }
      
    } catch (error) {
      toast.error("Failed to process booking and payment");
      console.error(error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Schedule Pickup & Pay</CardTitle>
          <CardDescription>
            <div className="flex justify-between items-center">
              <span>Total: ${quote.total_price}</span>
              <Badge className="bg-green-100 text-green-800">Payment Required</Badge>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Payment Options */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <h3 className="font-semibold text-emerald-800 mb-3">Payment Options</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="mb-2">
                  <span className="text-sm font-medium text-gray-700">💳 Card Payment</span>
                </div>
                <p className="text-xs text-gray-600">Secure online payment</p>
              </div>
              <div className="text-center border-l border-emerald-200 pl-4">
                <div className="mb-2">
                  <span className="text-sm font-medium text-gray-700">📱 Venmo</span>
                </div>
                <p className="text-xs text-gray-600">Scan QR after booking</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pickup Date</Label>
            <Input
              type="date"
              value={bookingData.pickup_date}
              onChange={(e) => handleDateChange(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              data-testid="pickup-date-input"
            />
            <p className="text-xs text-gray-600">
              ⚠️ Pickup available Monday-Thursday only (No Fridays, Weekends)
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
        <CardFooter className="flex flex-col space-y-3">
          <div className="grid grid-cols-2 gap-3 w-full">
            <Button onClick={handleBooking} data-testid="confirm-booking-btn" className="bg-emerald-600 hover:bg-emerald-700">
              💳 Pay with Card
            </Button>
            <Button 
              onClick={() => {
                // For Venmo, we still create the booking but show QR code instead of redirecting to Stripe
                alert("Venmo payment: After booking confirmation, you'll see a QR code to complete payment via Venmo app.");
                handleBooking();
              }}
              variant="outline" 
              className="border-blue-500 text-blue-600 hover:bg-blue-50"
            >
              📱 Pay with Venmo
            </Button>
          </div>
          <Button variant="outline" onClick={onClose} data-testid="cancel-booking-btn" className="w-full">
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// Payment Success Component
const PaymentSuccess = () => {
  const [paymentStatus, setPaymentStatus] = useState('checking');
  const [sessionId, setSessionId] = useState('');
  const [paymentData, setPaymentData] = useState(null);

  useEffect(() => {
    // Get session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdParam = urlParams.get('session_id');
    
    if (sessionIdParam) {
      setSessionId(sessionIdParam);
      pollPaymentStatus(sessionIdParam);
    } else {
      setPaymentStatus('error');
    }
  }, []);

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 5;
    
    if (attempts >= maxAttempts) {
      setPaymentStatus('timeout');
      return;
    }

    try {
      const response = await axios.get(`${API}/payments/status/${sessionId}`);
      const data = response.data;
      
      // Store payment data for display
      setPaymentData(data);
      
      if (data.payment_status === 'paid') {
        setPaymentStatus('success');
        return;
      } else if (data.status === 'expired') {
        setPaymentStatus('expired');
        return;
      }

      // Continue polling if still pending
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch (error) {
      console.error('Error checking payment status:', error);
      setPaymentStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">
            {paymentStatus === 'checking' && '🔄 Processing Payment...'}
            {paymentStatus === 'success' && '✅ Payment Successful!'}
            {paymentStatus === 'error' && '❌ Payment Error'}
            {paymentStatus === 'timeout' && '⏱️ Payment Verification Timeout'}
            {paymentStatus === 'expired' && '⏰ Payment Session Expired'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paymentStatus === 'checking' && (
            <p className="text-gray-600">Please wait while we verify your payment...</p>
          )}
          {paymentStatus === 'success' && (
            <div className="space-y-4">
              <p className="text-green-600 font-semibold">
                Your payment has been processed successfully!
              </p>
              <p className="text-gray-600">
                Your junk removal pickup has been confirmed. We'll send you an SMS confirmation shortly.
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-green-800 mb-2">What's Next?</h3>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• You'll receive an SMS confirmation</li>
                  <li>• Our team will arrive at your scheduled time</li>
                  <li>• We'll send a completion photo after pickup</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2">💡 Alternative Payment Option</h3>
                <div className="text-center">
                  <p className="text-sm text-blue-700 mb-3">You can also pay via Venmo:</p>
                  <div className="bg-white p-4 rounded-lg border">
                    <div className="w-32 h-32 mx-auto bg-gray-100 border rounded-lg flex items-center justify-center mb-2">
                      <div className="text-center">
                        <div className="text-xs font-mono bg-white p-2 border rounded">
                          {/* Placeholder QR code pattern */}
                          <div className="grid grid-cols-8 gap-px">
                            {Array.from({length: 64}, (_, i) => (
                              <div key={i} className={`w-1 h-1 ${Math.random() > 0.5 ? 'bg-black' : 'bg-white'}`}></div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600">@Text2toss-AZ</p>
                    <p className="text-xs text-blue-600 font-semibold">${paymentData?.amount_total ? (paymentData.amount_total / 100).toFixed(2) : '0.00'}</p>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Scan with Venmo app or send to @Text2toss-AZ
                  </p>
                </div>
              </div>
            </div>
          )}
          {(paymentStatus === 'error' || paymentStatus === 'timeout' || paymentStatus === 'expired') && (
            <div className="space-y-4">
              <p className="text-red-600">
                {paymentStatus === 'error' && 'There was an error processing your payment.'}
                {paymentStatus === 'timeout' && 'Payment verification timed out.'}
                {paymentStatus === 'expired' && 'Your payment session has expired.'}
              </p>
              <p className="text-gray-600">
                Please try again or contact support if the issue persists.
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button 
            onClick={() => window.location.href = '/'} 
            className="w-full"
          >
            Return to Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// Payment Cancelled Component
const PaymentCancelled = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black/40 to-emerald-900/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">❌ Payment Cancelled</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Your payment was cancelled. No charges were made to your account.
          </p>
          <p className="text-gray-600">
            You can try again or contact us if you need assistance.
          </p>
        </CardContent>
        <CardFooter>
          <Button 
            onClick={() => window.location.href = '/'} 
            className="w-full"
          >
            Return to Home
          </Button>
        </CardFooter>
      </Card>
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
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/payment-cancelled" element={<PaymentCancelled />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;