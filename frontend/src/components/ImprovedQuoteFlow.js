import React, { useState } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Step-by-step wizard for clean quote flow
const ImprovedQuoteFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [description, setDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");

  // Step 1: Upload Photo
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError("Image must be less than 10MB");
        return;
      }
      setImageFile(file);
      setError("");
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleNextToQuote = async () => {
    if (!imageFile) {
      setError("Please upload a photo of your items");
      return;
    }

    setAnalyzing(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      formData.append('description', description);

      const response = await axios.post(`${API}/quotes/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setQuote(response.data);
      setCurrentStep(2);
    } catch (error) {
      setError(error.response?.data?.detail || "Failed to analyze image. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Progress Indicator */}
        <div className="bg-emerald-50 border-b border-emerald-200 p-4">
          <div className="flex items-center justify-center space-x-2">
            <StepIndicator step={1} currentStep={currentStep} label="Upload Photo" />
            <div className="w-12 h-1 bg-emerald-200"></div>
            <StepIndicator step={2} currentStep={currentStep} label="Get Quote" />
            <div className="w-12 h-1 bg-emerald-200"></div>
            <StepIndicator step={3} currentStep={currentStep} label="Book & Pay" />
          </div>
        </div>

        {/* Step 1: Upload Photo */}
        {currentStep === 1 && (
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
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <p className="text-red-700 text-sm font-medium">⚠️ {error}</p>
                </div>
              )}

              {/* Image Upload Area */}
              <div className="space-y-4">
                {!imagePreview ? (
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
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Uploaded items"
                      className="w-full h-64 object-cover rounded-lg border-2 border-emerald-300"
                    />
                    <Button
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                        setError("");
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
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[80px]"
                  maxLength={200}
                />
                <p className="text-xs text-gray-500 text-right">
                  {description.length}/200 characters
                </p>
              </div>

              {/* Important Notice */}
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
            </CardContent>

            {/* Actions */}
            <div className="p-6 bg-gray-50 border-t flex justify-between">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={analyzing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleNextToQuote}
                disabled={!imageFile || analyzing}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 px-8"
              >
                {analyzing ? (
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
          </>
        )}

        {/* Step 2: Quote Display */}
        {currentStep === 2 && quote && (
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

              {/* Breakdown */}
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
              {quote.scale_level && quote.scale_level >= 4 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-yellow-800 mb-2">
                    ⏳ Admin Approval Required
                  </p>
                  <p className="text-xs text-yellow-700">
                    Large jobs require admin review for accuracy. You'll be contacted within 24 hours with final pricing before any payment is processed.
                  </p>
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
                  setCurrentStep(1);
                  setQuote(null);
                }}
              >
                ← New Quote
              </Button>
              <Button
                onClick={() => setCurrentStep(3)}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 px-8"
              >
                Continue to Booking →
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Booking & Payment (Placeholder) */}
        {currentStep === 3 && (
          <>
            <CardHeader className="text-center">
              <CardTitle>Schedule Pickup & Payment</CardTitle>
              <CardDescription>This will connect to your existing booking flow</CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-gray-600">
                The existing booking modal with calendar, payment, and form will appear here.
              </p>
              <Button
                onClick={() => {
                  // This would trigger the existing BookingModal
                  alert("This will open the existing booking modal");
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Open Booking Form
              </Button>
            </CardContent>
            <div className="p-6 bg-gray-50 border-t flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(2)}>
                ← Back to Quote
              </Button>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

// Step Indicator Component
const StepIndicator = ({ step, currentStep, label }) => {
  const isActive = step === currentStep;
  const isCompleted = step < currentStep;

  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
          isCompleted
            ? "bg-emerald-600 text-white"
            : isActive
            ? "bg-emerald-500 text-white ring-4 ring-emerald-200"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        {isCompleted ? "✓" : step}
      </div>
      <p
        className={`text-xs mt-1 font-medium ${
          isActive ? "text-emerald-700" : "text-gray-500"
        }`}
      >
        {label}
      </p>
    </div>
  );
};

export default ImprovedQuoteFlow;
