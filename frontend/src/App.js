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
import { Toaster } from "./components/ui/sonner";

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
      <Toaster />
      
      {/* Navigation */}
      <nav className="bg-black/70 backdrop-blur-md border-b border-emerald-400/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">T2T</span>
              </div>
              <span className="text-2xl font-bold text-white">TEXT-2-TOSS</span>
            </div>
            <div className="hidden md:flex space-x-8">
              <a href="#how-it-works" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">How It Works</a>
              <a href="#pricing" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">Pricing</a>
              <a href="#contact" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">Contact</a>
              <Link to="/admin" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">Admin</Link>
            </div>
            <Button 
              onClick={() => setShowQuote(true)}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6"
              data-testid="get-quote-btn"
            >
              📸 Upload & Quote
            </Button>
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
                  <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">TEXT-2-TOSS</span>
                </h1>
                <p className="text-xl text-gray-200 leading-relaxed">
                  Upload photo of junk and quick description, get a quote in seconds! 
                  No more waiting on callbacks and no more hassles. 
                  Fast, reliable, and eco-friendly junk removal service.
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
              
              <div className="flex flex-col sm:flex-row gap-4">
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
                  src="https://images.unsplash.com/photo-1561069157-218187260215?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njl8MHwxfHNlYXJjaHw0fHxqdW5rJTIwcmVtb3ZhbHxlbnwwfHx8fDE3NTg3MjgzNjJ8MA&ixlib=rb-4.1.0&q=85"
                  alt="Professional junk removal truck"
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
            <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-xl text-gray-200">Three simple steps to junk-free living</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="text-center border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-b from-white to-emerald-50/30">
              <CardHeader>
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full mx-auto flex items-center justify-center mb-4">
                  <span className="text-white text-2xl font-bold">1</span>
                </div>
                <CardTitle className="text-2xl">Describe Your Junk</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  Tell us what items you need removed from ground level locations. 
                  Furniture, appliances, electronics - anything at curbside or ground level access.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-b from-white to-teal-50/30">
              <CardHeader>
                <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-full mx-auto flex items-center justify-center mb-4">
                  <span className="text-white text-2xl font-bold">2</span>
                </div>
                <CardTitle className="text-2xl">Get Instant Quote</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  Receive an upfront, transparent price estimate based on your items. 
                  No hidden fees or surprises.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-b from-white to-emerald-50/30">
              <CardHeader>
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full mx-auto flex items-center justify-center mb-4">
                  <span className="text-white text-2xl font-bold">3</span>
                </div>
                <CardTitle className="text-2xl">Schedule Pickup</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  Choose a convenient time for pickup. Our team will arrive on time 
                  and safely collect items from your ground level location.
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
              <CardTitle className="text-2xl">Get Your Free Quote</CardTitle>
              <CardDescription>Tell us what you need removed</CardDescription>
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

  const handleBooking = async () => {
    if (!bookingData.pickup_date || !bookingData.pickup_time || !bookingData.address || !bookingData.phone) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const response = await axios.post(`${API}/bookings`, {
        quote_id: quote.id,
        ...bookingData
      });
      onSuccess();
    } catch (error) {
      toast.error("Failed to schedule pickup");
      console.error(error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Schedule Pickup</CardTitle>
          <CardDescription>Total: ${quote.total_price}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Pickup Date</Label>
            <Input
              type="date"
              value={bookingData.pickup_date}
              onChange={(e) => setBookingData({...bookingData, pickup_date: e.target.value})}
              min={new Date().toISOString().split('T')[0]}
              data-testid="pickup-date-input"
            />
          </div>
          <div className="space-y-2">
            <Label>Pickup Time</Label>
            <Select value={bookingData.pickup_time} onValueChange={(value) => setBookingData({...bookingData, pickup_time: value})}>
              <SelectTrigger data-testid="pickup-time-select">
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="08:00-10:00">8:00 AM - 10:00 AM</SelectItem>
                <SelectItem value="10:00-12:00">10:00 AM - 12:00 PM</SelectItem>
                <SelectItem value="12:00-14:00">12:00 PM - 2:00 PM</SelectItem>
                <SelectItem value="14:00-16:00">2:00 PM - 4:00 PM</SelectItem>
                <SelectItem value="16:00-18:00">4:00 PM - 6:00 PM</SelectItem>
              </SelectContent>
            </Select>
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
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={onClose} data-testid="cancel-booking-btn">
            Cancel
          </Button>
          <Button onClick={handleBooking} data-testid="confirm-booking-btn">
            Confirm Booking
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
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;