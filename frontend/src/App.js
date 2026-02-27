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
    <div className="min-h-screen bg-white" data-testid="landing-page">
      
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T2T</span>
              </div>
              <span className="text-lg sm:text-xl font-extrabold tracking-tight text-gray-900">Text2toss</span>
            </div>
            <div className="flex items-center gap-3">
              <a href="#how-it-works" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">How It Works</a>
              <a href="#contact" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">Contact</a>
              <Button 
                onClick={() => setShowQuote(true)}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 h-9 rounded-full"
                data-testid="get-quote-btn"
              >
                Get Quote
              </Button>
              <Link to="/admin">
                <button className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" data-testid="admin-login-nav-btn">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-12 sm:pt-20 pb-8 sm:pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            
            {/* Left - Copy */}
            <div className="space-y-6 sm:space-y-8 animate-fade-up">
              <div>
                <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-xs sm:text-sm font-medium px-3 py-1.5 rounded-full mb-4 sm:mb-6">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  Serving Flagstaff, AZ
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 tracking-tight leading-[1.1]">
                  Junk removal,<br />
                  <span className="text-emerald-600">made simple.</span>
                </h1>
                <p className="mt-4 sm:mt-6 text-base sm:text-lg text-gray-500 leading-relaxed max-w-lg">
                  Snap a photo of your junk, get an instant AI quote, and schedule a pickup. No callbacks. No hassles.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={() => setShowQuote(true)}
                  size="lg"
                  className="bg-gray-900 hover:bg-gray-800 text-white text-base sm:text-lg font-bold px-6 sm:px-8 h-14 rounded-xl shadow-lg hover:shadow-xl transition-all"
                  data-testid="hero-get-quote-btn"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Upload Photo & Get Quote
                </Button>
                <a href="tel:9288539619">
                  <Button 
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto border-2 border-gray-200 text-gray-700 hover:bg-gray-50 text-base font-semibold px-6 h-14 rounded-xl"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    Call Us
                  </Button>
                </a>
              </div>

              {/* Trust strip */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Instant AI quotes
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  No callbacks
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Curbside pickup
                </div>
              </div>
            </div>

            {/* Right - Photo carousel */}
            <div className="animate-fade-up stagger-2">
              <PhotoCarousel 
                photos={photoReel}
                currentIndex={currentPhotoIndex}
                onIndexChange={setCurrentPhotoIndex}
              />
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-12 sm:py-20 bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">How it works</h2>
            <p className="text-base text-gray-500">Three steps, no waiting</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            {[
              { step: "1", title: "Upload a photo", desc: "Take a photo of your junk and add a quick description. Our AI identifies items and calculates pricing instantly.", icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
              { step: "2", title: "Get your quote", desc: "Receive transparent pricing in seconds. No hidden fees, no surprises, no waiting for callbacks.", icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> },
              { step: "3", title: "Schedule & pay", desc: "Pick a convenient Mon-Thu time slot and pay via Venmo. We handle the rest — ground level and curbside.", icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> }
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 hover:border-emerald-200 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-5">
                  {item.icon}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Step {item.step}</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-12 sm:py-16 bg-emerald-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Ready to clear your space?</h2>
          <p className="text-emerald-100 text-base mb-8 max-w-xl mx-auto">Upload a photo and get your instant quote in under 30 seconds. It's that easy.</p>
          <Button 
            onClick={() => setShowQuote(true)}
            size="lg"
            className="bg-white text-emerald-700 hover:bg-emerald-50 text-base font-bold px-8 h-14 rounded-xl shadow-lg"
          >
            Get Your Free Quote
          </Button>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-12 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Get in touch</h2>
            <p className="text-base text-gray-500">We're here to help with your junk removal needs</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
            <a href="tel:9288539619" className="group flex flex-col items-center p-6 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3 group-hover:bg-emerald-100 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              </div>
              <span className="text-sm font-semibold text-gray-900">(928) 853-9619</span>
              <span className="text-xs text-gray-400 mt-1">Mon-Sat 8AM-6PM</span>
            </a>
            <a href="mailto:text2toss@gmail.com" className="group flex flex-col items-center p-6 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3 group-hover:bg-emerald-100 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <span className="text-sm font-semibold text-gray-900">text2toss@gmail.com</span>
              <span className="text-xs text-gray-400 mt-1">Quick response</span>
            </a>
            <a href="https://www.facebook.com/share/17Vsc23wKL/" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center p-6 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3 group-hover:bg-emerald-100 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </div>
              <span className="text-sm font-semibold text-gray-900">Facebook</span>
              <span className="text-xs text-gray-400 mt-1">Follow us</span>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-10 sm:py-14">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T2T</span>
              </div>
              <span className="text-lg font-extrabold text-white">Text2toss</span>
            </div>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
              <span>Flagstaff, AZ</span>
              <span>Ground level & curbside only</span>
              <span>Mon-Sat 8AM-6PM</span>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-6 text-center">
            <p className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Text2toss. Professional junk removal in Flagstaff, AZ.
            </p>
          </div>
        </div>
      </footer>

      {/* ============ MODALS ============ */}

      {/* Quote Modal */}
      {showQuote && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <Card className="w-full max-w-lg max-h-[95vh] my-2 sm:my-0 shadow-2xl border-0 overflow-y-auto rounded-2xl">
            
            {/* Progress */}
            <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
              <div className="flex items-center justify-center gap-2">
                <div className={`step-dot ${quoteStep > 1 ? 'done' : quoteStep === 1 ? 'active' : 'pending'}`}>
                  {quoteStep > 1 ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg> : "1"}
                </div>
                <div className={`step-line ${quoteStep > 1 ? 'done' : ''}`}></div>
                <div className={`step-dot ${quoteStep > 2 ? 'done' : quoteStep === 2 ? 'active' : 'pending'}`}>
                  {quoteStep > 2 ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg> : "2"}
                </div>
                <div className={`step-line ${quoteStep > 2 ? 'done' : ''}`}></div>
                <div className={`step-dot ${quoteStep === 3 ? 'active' : 'pending'}`}>3</div>
              </div>
              <div className="flex justify-between mt-1.5 px-1">
                <span className={`text-xs font-medium ${quoteStep >= 1 ? 'text-emerald-600' : 'text-gray-400'}`}>Upload</span>
                <span className={`text-xs font-medium ${quoteStep >= 2 ? 'text-emerald-600' : 'text-gray-400'}`}>Quote</span>
                <span className={`text-xs font-medium ${quoteStep >= 3 ? 'text-emerald-600' : 'text-gray-400'}`}>Book</span>
              </div>
            </div>

            {/* STEP 1: Upload */}
            {quoteStep === 1 && (
              <>
                <CardHeader className="text-center pb-3 pt-6">
                  <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900">
                    Upload your junk photo
                  </CardTitle>
                  <CardDescription className="text-sm text-gray-500">
                    Take a clear photo of the items you want removed
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 px-5 sm:px-6">
                  {quoteError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                      <p className="text-red-600 text-sm font-medium">{quoteError}</p>
                    </div>
                  )}

                  {/* Upload area */}
                  {!uploadedImage ? (
                    <div className="space-y-3">
                      <label className="block cursor-pointer">
                        <div className="flex items-center gap-4 p-4 border-2 border-dashed border-emerald-300 rounded-xl bg-emerald-50/50 hover:bg-emerald-50 transition-colors">
                          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Take a picture</p>
                            <p className="text-xs text-gray-500">Open camera to capture now</p>
                          </div>
                          <svg className="w-5 h-5 text-gray-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                        </div>
                        <Input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" data-testid="camera-input" />
                      </label>

                      <label className="block cursor-pointer">
                        <div className="flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Choose from gallery</p>
                            <p className="text-xs text-gray-500">Select an existing photo</p>
                          </div>
                          <svg className="w-5 h-5 text-gray-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                        </div>
                        <Input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" data-testid="gallery-input" />
                      </label>

                      <p className="text-xs text-gray-400 text-center">PNG, JPG, HEIC up to 10MB</p>
                    </div>
                  ) : (
                    <div className="relative rounded-xl overflow-hidden">
                      <img src={uploadedImage} alt="Uploaded items" className="w-full h-56 object-cover" />
                      <Button
                        onClick={() => { setImageFile(null); setUploadedImage(null); setQuoteError(''); }}
                        variant="destructive"
                        size="sm"
                        className="absolute top-3 right-3 h-8 rounded-lg text-xs"
                      >
                        Remove
                      </Button>
                      <div className="absolute bottom-3 left-3 bg-emerald-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                        Ready
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Brief description <span className="text-gray-400 font-normal">(optional)</span></label>
                    <Textarea
                      placeholder="e.g., Old furniture in garage, mattress, boxes..."
                      value={imageDescription}
                      onChange={(e) => setImageDescription(e.target.value)}
                      className="min-h-[70px] text-sm resize-none rounded-xl border-gray-200"
                      maxLength={200}
                      data-testid="image-description-input"
                    />
                  </div>
                  
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs text-amber-700 font-medium">Ground level & curbside pickup only. Items must be accessible without stairs.</p>
                  </div>
                </CardContent>

                <div className="p-5 bg-white border-t flex justify-between gap-3">
                  <Button
                    variant="outline"
                    onClick={() => { setShowQuote(false); setQuoteStep(1); setImageFile(null); setUploadedImage(null); setQuoteError(''); setImageDescription(''); }}
                    disabled={imageAnalyzing}
                    className="h-11 rounded-xl border-gray-200"
                    data-testid="cancel-quote-btn"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={analyzeImageAndGetQuote}
                    disabled={!imageFile || imageAnalyzing}
                    className="h-11 bg-emerald-600 hover:bg-emerald-700 rounded-xl px-6 font-semibold"
                    data-testid="get-instant-quote-btn"
                  >
                    {imageAnalyzing ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Analyzing...
                      </span>
                    ) : "Get Quote"}
                  </Button>
                </div>
              </>
            )}

            {/* STEP 2: Quote */}
            {quoteStep === 2 && quote && (
              <>
                <CardHeader className="text-center pb-2 pt-6 bg-emerald-50 border-b border-emerald-100">
                  <div className="text-5xl font-black text-emerald-700 mb-1">
                    ${quote.total_price}
                  </div>
                  <CardDescription className="text-sm font-medium text-emerald-600">
                    Your instant quote
                  </CardDescription>
                  <div className="mt-2">
                    <Badge variant="outline" className="border-emerald-200 text-emerald-600 text-xs">
                      Quote #{quote.id?.substring(0, 8)}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-5 px-5 sm:px-6">
                  {quote.breakdown && quote.breakdown.items && quote.breakdown.items.length > 0 && (
                    <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
                      <div className="px-4 py-2.5 bg-gray-50 rounded-t-xl">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Items identified</h4>
                      </div>
                      {quote.breakdown.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center px-4 py-2.5">
                          <span className="text-sm text-gray-700">{item.name} <span className="text-xs text-gray-400">({item.size})</span></span>
                          <span className="text-sm font-semibold text-gray-900">${item.estimated_cost || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {quote.ai_explanation && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <p className="text-xs font-semibold text-blue-600 mb-1">AI Analysis</p>
                      <p className="text-sm text-blue-700 leading-relaxed">{quote.ai_explanation}</p>
                    </div>
                  )}

                  {quote.requires_approval && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-sm font-bold text-amber-800 mb-1">Admin approval required</p>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        Continue to provide your details. Payment is blocked until approval. You'll hear back within 24 hours.
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 text-center">Ground level & curbside pickup only</p>
                </CardContent>

                <div className="p-5 bg-white border-t flex justify-between gap-3">
                  <Button
                    variant="outline"
                    onClick={() => { setQuoteStep(1); setQuote(null); setImageFile(null); setUploadedImage(null); setImageDescription(''); }}
                    className="h-11 rounded-xl border-gray-200"
                  >
                    New Quote
                  </Button>
                  <Button
                    onClick={() => { setShowBooking(true); setShowQuote(false); }}
                    className="h-11 bg-gray-900 hover:bg-gray-800 rounded-xl px-6 font-semibold"
                    data-testid="book-pickup-btn"
                  >
                    Continue to Booking
                  </Button>
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
          onSuccess={() => { setShowBooking(false); setShowQuote(false); toast.success("Pickup scheduled successfully!"); }}
          onVenmoPayment={(bookingId, qrCode) => { setVenmoBookingId(bookingId); setVenmoQRCode(qrCode); setShowBooking(false); setShowVenmoPayment(true); }}
        />
      )}

      {/* Venmo Payment Modal */}
      {showVenmoPayment && (
        <VenmoPaymentModal 
          quote={quote}
          bookingId={venmoBookingId}
          qrCode={venmoQRCode}
          onClose={() => { setShowVenmoPayment(false); setShowQuote(false); toast.success("Booking confirmed! Payment instructions sent via SMS."); }}
        />
      )}

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl my-8 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-emerald-600 text-white p-6 flex-shrink-0 text-center">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-xl font-bold">Quote Under Review</h3>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-emerald-800 mb-1">Quote submitted successfully</p>
                <p className="text-xs text-emerald-700">Our team is reviewing your request and will provide an accurate quote.</p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Response within 24 hours</p>
                    <p className="text-xs text-gray-500">Check your email for the approved quote and next steps.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">No charges until approved</p>
                    <p className="text-xs text-gray-500">Payment link sent only after quote approval.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-5 bg-gray-50 space-y-2 flex-shrink-0 border-t">
              <button
                onClick={() => { setShowApprovalModal(false); setShowBooking(true); setShowQuote(false); }}
                className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                Provide Booking Details
              </button>
              <button
                onClick={() => setShowApprovalModal(false)}
                className="w-full bg-white border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                I'll wait for the email
              </button>
            </div>
          </div>
        </div>
      )}
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
    const textToCopy = bookingId.substring(0, 8);
    
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          toast.success("Booking ID copied to clipboard!");
        })
        .catch((err) => {
          // Fallback to legacy method
          copyToClipboardFallback(textToCopy);
        });
    } else {
      // Use fallback for browsers/contexts that don't support Clipboard API
      copyToClipboardFallback(textToCopy);
    }
  };
  
  const copyToClipboardFallback = (text) => {
    // Legacy method that works everywhere
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        toast.success("Booking ID copied to clipboard!");
      } else {
        toast.error("Copy failed. Booking ID: " + text);
      }
    } catch (err) {
      toast.error("Copy failed. Booking ID: " + text);
    }
    
    document.body.removeChild(textArea);
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
        toast.success("✅ Booking Successfully Submitted! We'll contact you within 24 hours after quote approval.", {
          duration: 5000,
          style: {
            background: '#10b981',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: '600',
            padding: '16px',
          },
        });
        onSuccess(); // Close the modal
        return;
      }
      
      // For non-approval quotes, proceed with payment
      toast.success("✅ Booking Successfully Submitted! Please complete payment to confirm.", {
        duration: 4000,
        style: {
          background: '#10b981',
          color: '#ffffff',
          fontSize: '16px',
          fontWeight: '600',
          padding: '16px',
        },
      });
      
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