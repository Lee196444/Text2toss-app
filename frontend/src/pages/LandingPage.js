import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import PhotoCarousel from "../components/customer/PhotoCarousel";
import QuoteAnalyzingProgress from "../components/customer/QuoteAnalyzingProgress";
import BookingModal from "../components/booking/BookingModal";
import VenmoPaymentModal from "../components/booking/VenmoPaymentModal";
import QuoteFlowModal from "./QuoteFlowModal";
import { toast } from "../lib/toast";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
  // While analyzing: holds the resolved quote / error so the progress overlay
  // can populate real values (item count, cubic ft, price) on the relevant
  // steps before transitioning the customer to the quote screen.
  const [pendingQuote, setPendingQuote] = useState(null);
  const [analyzeError, setAnalyzeError] = useState(null);
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
  const fetchPhotoReel = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/reel-photos`);
      setPhotoReel(response.data.photos || []);
    } catch (error) {
      console.error('Failed to fetch photo reel:', error);
    }
  }, []);

  useEffect(() => {
    fetchPhotoReel();
  }, [fetchPhotoReel]);

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
      // Sanity cap on raw upload — we compress to ~150KB before sending, so
      // anything under 50MB is fine. Modern phones (esp. Samsung HQ mode)
      // routinely produce 12-25MB photos.
      if (file.size > 50 * 1024 * 1024) {
        setQuoteError("Image must be less than 50MB");
        toast.error("Image must be less than 50MB");
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

  const [analysisStatus, setAnalysisStatus] = useState('');

  // Compress image client-side before uploading (phone photos can be 5-10MB).
  // Resolves to null on any failure so the caller can fall back to uploading
  // the original file (the backend can decode HEIC/HEIF + odd formats).
  const compressImageForUpload = (file) => {
    return new Promise((resolve) => {
      // Hard timeout — if the browser can't decode the image (e.g. HEIC on
      // Chrome/Firefox) onload/onerror may never fire. Don't hang the UI.
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 15000);

      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      const cleanup = () => {
        clearTimeout(timeoutId);
        try { URL.revokeObjectURL(objectUrl); } catch (_) { /* noop */ }
      };

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 800;
          let { width, height } = img;
          if (!width || !height) {
            cleanup();
            resolve(null);
            return;
          }
          if (width > maxDim || height > maxDim) {
            const ratio = maxDim / Math.max(width, height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              cleanup();
              // Reject empty / failed encodes — caller will fall back
              if (!blob || blob.size < 1024) {
                resolve(null);
              } else {
                resolve(blob);
              }
            },
            'image/jpeg',
            0.65,
          );
        } catch (_) {
          cleanup();
          resolve(null);
        }
      };

      img.onerror = () => {
        cleanup();
        resolve(null);
      };

      img.src = objectUrl;
    });
  };

  const analyzeImageAndGetQuote = async () => {
    if (!imageFile) {
      setQuoteError("Please upload a photo of your items");
      toast.error("Please upload a photo of your items");
      return;
    }

    setImageAnalyzing(true);
    setPendingQuote(null);
    setAnalyzeError(null);
    setQuoteError('');

    try {
      // Compress image client-side first (5-10MB → ~100-200KB).
      // If compression fails (HEIC, decode error, timeout) fall back to the
      // raw file — the backend will decode + resize it.
      const compressedBlob = await compressImageForUpload(imageFile);

      const formData = new FormData();
      if (compressedBlob) {
        formData.append('file', compressedBlob, 'photo.jpg');
      } else {
        formData.append('file', imageFile, imageFile.name || 'photo.jpg');
      }
      formData.append('description', imageDescription);

      const response = await axios.post(`${API}/quotes/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 60000, // 60s — covers slow networks + AI vision call
      });

      // Hand the response to the progress overlay; it will animate the
      // remaining steps and call onDone when ready to advance.
      setPendingQuote(response.data);
    } catch (error) {
      let errorMsg = error.response?.data?.detail;
      if (!errorMsg) {
        if (error.code === 'ECONNABORTED') {
          errorMsg = "Upload timed out. Please check your connection and try again.";
        } else if (error.message?.includes('Network')) {
          errorMsg = "Network error. Please check your connection and try again.";
        } else {
          errorMsg = "Failed to analyze image. Please try again.";
        }
      }
      setAnalyzeError(errorMsg);
    }
  };

  // Called by QuoteAnalyzingProgress when its animation finishes (or when an
  // error has been surfaced). Advances the wizard to step 2 on success, or
  // surfaces the error inline on the upload step.
  const handleAnalyzeOverlayDone = () => {
    if (pendingQuote) {
      setQuote(pendingQuote);
      setItems(pendingQuote.items);
      setImageAnalyzed(true);
      setQuoteStep(2);
      toast.success("Quote generated successfully!");
    } else if (analyzeError) {
      setQuoteError(analyzeError);
      toast.error(analyzeError);
    }
    setPendingQuote(null);
    setAnalyzeError(null);
    setImageAnalyzing(false);
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
              <Link to="/track" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">Track Booking</Link>
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

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
            <a href="https://g.page/r/CaN7_KQsxQCdEAE/review" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center p-6 rounded-2xl border border-gray-100 hover:border-amber-200 hover:shadow-md transition-all" data-testid="google-review-link">
              <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center mb-3 group-hover:bg-amber-100 transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <span className="text-sm font-semibold text-gray-900">Leave a Review</span>
              <span className="text-xs text-gray-400 mt-1">Google Reviews</span>
            </a>
          </div>

          {/* Track booking link */}
          <div className="mt-8 text-center">
            <Link to="/track" className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-semibold text-sm transition-colors" data-testid="track-booking-link">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Track your booking status
            </Link>
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
        <QuoteFlowModal
          quoteStep={quoteStep}
          quote={quote}
          quoteError={quoteError}
          imageFile={imageFile}
          uploadedImage={uploadedImage}
          imageDescription={imageDescription}
          setImageDescription={setImageDescription}
          imageAnalyzing={imageAnalyzing}
          analysisStatus={analysisStatus}
          onImageUpload={handleImageUpload}
          onRemoveImage={() => { setImageFile(null); setUploadedImage(null); setQuoteError(''); }}
          onAnalyze={analyzeImageAndGetQuote}
          onCancel={() => { setShowQuote(false); setQuoteStep(1); setImageFile(null); setUploadedImage(null); setQuoteError(''); setImageDescription(''); }}
          onContinueToBooking={() => { setShowBooking(true); setShowQuote(false); }}
          onCloseAfterQuote={() => { setShowQuote(false); setQuoteStep(1); setQuote(null); setImageFile(null); setUploadedImage(null); setImageDescription(''); }}
        />
      )}

      {/* AI Analyzing Progress Overlay (sits ABOVE the quote modal while the AI request is in flight) */}
      {imageAnalyzing && (
        <QuoteAnalyzingProgress
          quote={pendingQuote}
          error={analyzeError}
          onDone={handleAnalyzeOverlayDone}
        />
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

export default LandingPage;
