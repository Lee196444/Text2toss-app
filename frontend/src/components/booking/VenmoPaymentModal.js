import React from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";

const toast = {
  success: (m) => (window.showToast ? window.showToast("success", m) : console.log("SUCCESS:", m)),
  error: (m) => (window.showToast ? window.showToast("error", m) : console.log("ERROR:", m))
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

export default VenmoPaymentModal;
