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
import { logger } from "../utils/logger";


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
  const [uploadedImages, setUploadedImages] = useState([]); // Array of data-URL previews
  const [imageFiles, setImageFiles] = useState([]);           // Array of File objects
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
      logger.error('Failed to fetch photo reel:', error);
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
        logger.error('Error recalculating quote after item addition:', error);
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
        logger.error('Error recalculating quote after item removal:', error);
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

  const MAX_IMAGES = 8;

  const handleImageUpload = (event) => {
    const selected = Array.from(event.target.files || []);
    if (selected.length === 0) return;

    // Combined ceiling (existing + new) so adding one at a time still caps out.
    if (imageFiles.length + selected.length > MAX_IMAGES) {
      const msg = `You can upload up to ${MAX_IMAGES} photos per quote.`;
      setQuoteError(msg);
      toast.error(msg);
      return;
    }

    const accepted = [];
    for (const file of selected) {
      // Sanity cap on raw upload — we compress to ~150KB before sending, so
      // anything under 50MB is fine. Modern phones (esp. Samsung HQ mode)
      // routinely produce 12-25MB photos.
      if (file.size > 50 * 1024 * 1024) {
        setQuoteError(`"${file.name}" is larger than 50MB — please pick a smaller photo.`);
        toast.error(`"${file.name}" is larger than 50MB`);
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length === 0) return;

    setImageFiles(prev => [...prev, ...accepted]);
    setImageAnalyzed(false);
    setQuoteError('');

    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImages(prev => [...prev, e.target.result]);
      };
      reader.readAsDataURL(file);
    });

    // Allow selecting the same file again if it was removed earlier
    if (event.target && event.target.value !== undefined) {
      event.target.value = "";
    }
  };

  const handleRemoveImage = (index) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    setImageAnalyzed(false);
    setQuoteError('');
  };

  const handleClearImages = () => {
    setImageFiles([]);
    setUploadedImages([]);
    setQuoteError('');
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
    if (!imageFiles.length) {
      setQuoteError("Please upload at least one photo of your items");
      toast.error("Please upload at least one photo of your items");
      return;
    }

    setImageAnalyzing(true);
    setPendingQuote(null);
    setAnalyzeError(null);
    setQuoteError('');

    try {
      const formData = new FormData();
      // Compress each image client-side (5-10MB → ~100-200KB each). If any
      // compression step fails (HEIC, decode error, timeout) we fall back to
      // that file raw — the backend will decode + resize it.
      for (let i = 0; i < imageFiles.length; i++) {
        const original = imageFiles[i];
        const compressed = await compressImageForUpload(original);
        const payload = compressed || original;
        const name = compressed ? `photo_${i + 1}.jpg` : (original.name || `photo_${i + 1}.jpg`);
        formData.append('files', payload, name);
      }
      formData.append('description', imageDescription);

      const response = await axios.post(`${API}/quotes/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 90000, // 90s — multi-image vision can take a few seconds longer
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
              <img
                src="/apple-touch-icon.png?v=8"
                alt="Text2toss"
                className="w-9 h-9 rounded-lg shadow-sm"
                data-testid="brand-icon"
              />
              <span className="text-lg sm:text-xl font-extrabold tracking-tight text-gray-900 italic">Text2toss</span>
              <span className="hidden md:inline-flex items-center gap-1 ml-2 bg-black text-lime-400 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded">
                <span className="text-white">#1</span> in AZ
              </span>
            </div>
            <div className="flex items-center gap-3">
              <a href="#how-it-works" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">How It Works</a>
              <Link to="/track" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">Track Booking</Link>
              <a href="#contact" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">Contact</a>
              <Button
                onClick={() => setShowQuote(true)}
                size="sm"
                className="px-4 rounded-full"
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
                <div className="inline-flex items-center gap-2 bg-black text-lime-400 text-xs sm:text-sm font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-4 sm:mb-6 shadow-lg shadow-lime-400/20" data-testid="az-number-one-badge">
                  <svg className="w-4 h-4 fill-lime-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                  Arizona's #1 Junk Removal
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-lime-500 tracking-tight leading-[1.05]">
                  <span className="block text-base sm:text-lg font-extrabold uppercase tracking-[0.25em] text-black mb-2">Trash Today.</span>
                  Junk removal,<br />
                  <span className="text-chrome">made simple.</span>
                </h1>
                <p className="mt-4 sm:mt-6 text-base sm:text-lg text-gray-500 leading-relaxed max-w-lg">
                  Snap a photo. Get an instant AI quote. Schedule pickup. <span className="font-bold text-gray-900">No callbacks. No hassles.</span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setShowQuote(true)}
                  size="lg"
                  className="text-base sm:text-lg px-6 sm:px-8 shadow-lg hover:shadow-xl"
                  data-testid="hero-get-quote-btn"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Upload Photo & Get Quote
                </Button>
                <a href="tel:9288539619" className="block">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto px-6"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    Call Us
                  </Button>
                </a>
              </div>

              {/* Trust strip with real proof */}
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-0.5">
                    {[0,1,2,3,4].map(i => (
                      <svg key={i} className="w-3.5 h-3.5 fill-lime-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    ))}
                  </div>
                  <div>
                    <div className="font-display italic text-base text-black leading-none">4.9★</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Avg rating</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-7 h-7 text-lime-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  <div>
                    <div className="font-display italic text-base text-black leading-none">Same-Day</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Pickups</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-7 h-7 text-lime-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  <div>
                    <div className="font-display italic text-base text-black leading-none">Licensed</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">& Insured</div>
                  </div>
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
            <h2 className="text-3xl sm:text-4xl text-black mb-2 uppercase tracking-tight">How it works</h2>
            <p className="text-base text-gray-500">Three steps, no waiting</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            {[
              { step: "1", title: "Upload a photo", desc: "Take a photo of your junk and add a quick description. Our AI identifies items and calculates pricing instantly.", icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
              { step: "2", title: "Get your quote", desc: "Receive transparent pricing in seconds. No hidden fees, no surprises, no waiting for callbacks.", icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> },
              { step: "3", title: "Schedule & pay", desc: "Pick a convenient Mon-Thu time slot and pay via Venmo. We handle the rest — ground level and curbside.", icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> }
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 hover:border-lime-300 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 bg-black text-lime-400 rounded-xl flex items-center justify-center mb-5">
                  {item.icon}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-display italic text-xs text-black bg-lime-300 px-2 py-0.5 rounded-full uppercase tracking-wider">Step {item.step}</span>
                </div>
                <h3 className="font-display italic text-xl text-black mb-2 uppercase tracking-tight">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner — Arizona's #1 push */}
      <section className="relative py-12 sm:py-16 bg-black overflow-hidden">
        {/* Subtle hex pattern overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(190,255,77,0.8) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Lime accent stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-lime-400 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-lime-400 to-transparent" />

        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-lime-400 text-black text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full mb-4">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            Arizona's #1 — Trusted statewide
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 italic tracking-tight">
            Trash today.<br className="sm:hidden" />
            <span className="text-lime-400"> Tomorrow clean.</span>
          </h2>
          <p className="text-gray-300 text-base mb-8 max-w-xl mx-auto">
            Snap, quote, schedule — done in under 30 seconds. Same-day pickup available.
          </p>
          <Button
            onClick={() => setShowQuote(true)}
            size="lg"
            className="bg-lime-400 text-black hover:bg-lime-300 text-base font-black uppercase tracking-wider px-8 h-14 rounded-xl shadow-2xl shadow-lime-400/30 hover:shadow-lime-400/50 transition-all"
            data-testid="cta-banner-quote-btn"
          >
            Get Your Free Quote
          </Button>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-12 sm:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-3xl sm:text-4xl text-black mb-2 uppercase tracking-tight">Get in touch</h2>
            <p className="text-base text-gray-500">We're here to help with your junk removal needs</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <a href="tel:9288539619" className="group flex flex-col items-center p-6 rounded-2xl border border-gray-100 hover:border-lime-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-black text-lime-400 rounded-xl flex items-center justify-center mb-3 group-hover:bg-gray-900 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              </div>
              <span className="font-display italic text-base text-black tracking-tight">(928) 853-9619</span>
              <span className="text-xs text-gray-400 mt-1">Mon-Sat 8AM-6PM</span>
            </a>
            <a href="mailto:text2toss@gmail.com" className="group flex flex-col items-center p-6 rounded-2xl border border-gray-100 hover:border-lime-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-black text-lime-400 rounded-xl flex items-center justify-center mb-3 group-hover:bg-gray-900 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <span className="font-display italic text-sm text-black tracking-tight">text2toss@gmail.com</span>
              <span className="text-xs text-gray-400 mt-1">Quick response</span>
            </a>
            <a href="https://www.facebook.com/share/17Vsc23wKL/" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center p-6 rounded-2xl border border-gray-100 hover:border-lime-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 bg-black text-lime-400 rounded-xl flex items-center justify-center mb-3 group-hover:bg-gray-900 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </div>
              <span className="font-display italic text-base text-black uppercase tracking-tight">Facebook</span>
              <span className="text-xs text-gray-400 mt-1">Follow us</span>
            </a>
            <a href="https://g.page/r/CaN7_KQsxQCdEAE/review" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center p-6 rounded-2xl border border-gray-100 hover:border-lime-300 hover:shadow-md transition-all" data-testid="google-review-link">
              <div className="w-12 h-12 bg-black text-lime-400 rounded-xl flex items-center justify-center mb-3 group-hover:bg-gray-900 transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <span className="font-display italic text-base text-black uppercase tracking-tight">Leave a Review</span>
              <span className="text-xs text-gray-400 mt-1">Google Reviews</span>
            </a>
          </div>

          {/* Track booking link */}
          <div className="mt-8 text-center">
            <Link to="/track" className="inline-flex items-center gap-2 text-lime-600 hover:text-lime-700 font-display italic uppercase tracking-wider text-sm transition-colors" data-testid="track-booking-link">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Track your booking status
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-10 sm:py-14 border-t-2 border-lime-400/20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <img src="/apple-touch-icon.png?v=8" alt="Text2toss" className="w-9 h-9 rounded-lg" />
              <span className="text-lg font-extrabold italic text-white">Text2toss</span>
              <span className="ml-2 inline-flex items-center bg-lime-400 text-black text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">#1 AZ</span>
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
          imageFiles={imageFiles}
          uploadedImages={uploadedImages}
          imageDescription={imageDescription}
          setImageDescription={setImageDescription}
          imageAnalyzing={imageAnalyzing}
          analysisStatus={analysisStatus}
          onImageUpload={handleImageUpload}
          onRemoveImageAt={handleRemoveImage}
          onClearImages={handleClearImages}
          onAnalyze={analyzeImageAndGetQuote}
          onCancel={() => { setShowQuote(false); setQuoteStep(1); handleClearImages(); setImageDescription(''); }}
          onContinueToBooking={() => { setShowBooking(true); setShowQuote(false); }}
          onCloseAfterQuote={() => { setShowQuote(false); setQuoteStep(1); setQuote(null); handleClearImages(); setImageDescription(''); }}
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
            <div className="bg-lime-400 text-white p-6 flex-shrink-0 text-center">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-xl font-bold">Quote Under Review</h3>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="bg-lime-50 border border-lime-300 rounded-xl p-4">
                <p className="text-sm font-semibold text-lime-700 mb-1">Quote submitted successfully</p>
                <p className="text-xs text-lime-600">Our team is reviewing your request and will provide an accurate quote.</p>
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

