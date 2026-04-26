import React, { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import QRCode from 'qrcode';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import AvailabilityCalendar from "../AvailabilityCalendar";

const toast = {
  success: (m) => (window.showToast ? window.showToast("success", m) : console.log("SUCCESS:", m)),
  error: (m) => (window.showToast ? window.showToast("error", m) : console.log("ERROR:", m))
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
  const [bookingSubmitted, setBookingSubmitted] = useState(false);
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
      
      // If quote requires approval, show success screen inside the modal
      if (quote.requires_approval) {
        setBookingSubmitted(true);
        // Auto-close after 7 seconds
        setTimeout(() => {
          setBookingSubmitted(false);
          onSuccess();
        }, 7000);
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
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-start justify-center p-4 overflow-y-auto pt-8">

      {/* Booking Submitted Success Screen */}
      {bookingSubmitted ? (
        <div className="w-full max-w-md mt-12 animate-fade-up">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden text-center">
            <div className="bg-emerald-600 py-10 px-6">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-white" data-testid="booking-success-title">Booking Submitted!</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-700 text-base leading-relaxed">
                Your booking has been submitted successfully. Our team will review your quote and contact you within <strong>24 hours</strong>.
              </p>
              <p className="text-sm text-gray-500">
                Payment will be available once your quote is approved. Check your email for updates.
              </p>
              <Link to="/track" className="block">
                <button className="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 py-3 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-colors">
                  Track My Booking
                </button>
              </Link>
              <button
                onClick={() => { setBookingSubmitted(false); onSuccess(); }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl text-base font-bold transition-colors"
                data-testid="booking-success-close-btn"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : (

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
              <div className="relative">
                <select
                  value={bookingData.pickup_time || ""}
                  onChange={(e) => setBookingData({...bookingData, pickup_time: e.target.value})}
                  disabled={!bookingData.pickup_date || checkingAvailability}
                  className="w-full h-14 border-2 border-gray-200 rounded-lg px-4 text-base bg-white appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
                  data-testid="pickup-time-select"
                >
                  <option value="" disabled>
                    {checkingAvailability ? "Checking..." : 
                     !bookingData.pickup_date ? "Select date first" : 
                     "Choose time window"}
                  </option>
                  {[
                    { value: "08:00-10:00", label: "Morning (8-10 AM)" },
                    { value: "10:00-12:00", label: "Late Morning (10 AM-12 PM)" },
                    { value: "12:00-14:00", label: "Afternoon (12-2 PM)" },
                    { value: "14:00-16:00", label: "Mid Afternoon (2-4 PM)" },
                    { value: "16:00-18:00", label: "Evening (4-6 PM)" }
                  ].map(timeSlot => {
                    const isBooked = bookedTimeSlots.includes(timeSlot.value);
                    return (
                      <option 
                        key={timeSlot.value}
                        value={timeSlot.value}
                        disabled={isBooked}
                      >
                        {timeSlot.label}{isBooked ? " (Booked)" : ""}
                      </option>
                    );
                  })}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
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
      )}
      
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

export default BookingModal;
