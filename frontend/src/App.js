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
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 sm:py-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-sm sm:text-lg">T2T</span>
              </div>
              <span className="text-lg sm:text-2xl font-bold text-white">Text2toss</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#how-it-works" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">How It Works</a>
              <a href="#contact" className="text-gray-300 hover:text-emerald-400 font-medium transition-colors">Contact</a>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <Link to="/admin">
                <Button 
                  variant="outline"
                  size="sm"
                  className="border-emerald-400 text-emerald-400 hover:bg-emerald-400 hover:text-white text-xs sm:text-sm px-3 sm:px-4 py-2 min-w-0"
                  data-testid="admin-login-nav-btn"
                >
                  <span className="hidden sm:inline">🔐 Admin Login</span>
                  <span className="sm:hidden">Admin</span>
                </Button>
              </Link>
              <Button 
                onClick={() => setShowQuote(true)}
                size="sm"
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 min-w-0 font-medium"
                data-testid="get-quote-btn"
              >
                <span className="hidden sm:inline">📸 Upload & Quote</span>
                <span className="sm:hidden">Get Quote</span>
              </Button>
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
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
                    📸 AI-Powered Photo Quotes • No Callbacks Required
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
                <p className="text-lg lg:text-xl text-gray-200 leading-relaxed text-center lg:text-left px-2 lg:px-0">
                  Upload photo of junk and quick description, get a quote in seconds! 
                  No more waiting on callbacks and no more hassles. 
                  <strong>Junk removal made seamless.</strong>
                </p>
                <div className="bg-emerald-900/30 border border-emerald-400/30 rounded-lg p-3 lg:p-4 mt-4">
                  <p className="text-emerald-200 text-sm font-medium text-center lg:text-left">
                    📍 Ground Level & Curbside Pickup Only
                  </p>
                  <p className="text-emerald-300 text-sm mt-1 text-center lg:text-left">
                    We pickup items from ground level locations and curbside. Items must be accessible without stairs.
                  </p>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 lg:gap-4 justify-center px-4 sm:px-6 lg:px-0 max-w-full mx-auto">
                <Button 
                  onClick={() => setShowQuote(true)}
                  size="lg"
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm sm:text-base lg:text-lg px-4 sm:px-6 lg:px-8 py-4 lg:py-6 w-full max-w-full text-center font-semibold"
                  data-testid="hero-get-quote-btn"
                >
                  <span className="block sm:hidden">📸 Upload & Quote</span>
                  <span className="hidden sm:block">📸 Upload Photo & Get Quote</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm sm:text-base lg:text-lg px-3 sm:px-6 lg:px-8 py-4 lg:py-6 w-full max-w-full text-center"
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
                Fast, reliable junk removal with instant AI-powered quotes. Ground level & curbside pickup only.
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

// Booking Modal Component
const BookingModal = ({ quote, onClose, onSuccess }) => {
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
      
      // Show success message with Venmo payment instructions
      toast.success("Booking confirmed! Please complete payment via Venmo to @Text2toss");
      
      // Show Venmo payment instructions
      alert(`🎉 Booking Confirmed! 

📱 Complete Payment via Venmo:
• Send $${quote.total_price} to @Text2toss
• Include booking ID: ${bookingId.substring(0, 8)}
• We'll confirm payment and send pickup details

Thank you for choosing Text2toss!`);
      
      // Call onSuccess to close modals and show success
      onSuccess();
      
    } catch (error) {
      toast.error("Failed to create booking");
      console.error(error);
    }
  };

  const handleBooking = async () => {
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
      
      // Show success message with Venmo payment instructions
      toast.success("Booking confirmed! Please complete payment via Venmo to @Text2toss");
      
      // Show Venmo payment instructions
      alert(`🎉 Booking Confirmed! 

📱 Complete Payment via Venmo:
• Send $${quote.total_price} to @Text2toss
• Include booking ID: ${bookingId}
• We'll confirm payment and send pickup details

Thank you for choosing Text2toss!`);
      
      // Call onSuccess to close modals and show success
      onSuccess();
      
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