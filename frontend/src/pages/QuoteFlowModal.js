import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import AddToHomeScreenPrompt from "../components/customer/AddToHomeScreenPrompt";
import PriorityPicker from "../components/customer/PriorityPicker";

/**
 * 3-step quote flow modal: Upload → Quote → (booking opens externally).
 * State (quoteStep, quote, etc.) is owned by the parent so booking can chain.
 */
export default function QuoteFlowModal({
  // step + state
  quoteStep,
  quote,
  quoteError,
  imageFiles,
  uploadedImages,
  imageDescription,
  setImageDescription,
  imageAnalyzing,
  analysisStatus,

  // actions
  onImageUpload,
  onRemoveImageAt,
  onClearImages,
  onAnalyze,
  onCancel,         // close + reset everything
  onContinueToBooking,
  onCloseAfterQuote, // close from step 2 (e.g., "Close")
  priorityTier,
  onPriorityChange,
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <Card className="w-full max-w-lg max-h-[95vh] my-2 sm:my-0 shadow-2xl border-0 overflow-y-auto rounded-2xl">
        {/* Progress */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-center gap-2">
            <StepDot step={1} quoteStep={quoteStep} />
            <div className={`step-line ${quoteStep > 1 ? "done" : ""}`}></div>
            <StepDot step={2} quoteStep={quoteStep} />
            <div className={`step-line ${quoteStep > 2 ? "done" : ""}`}></div>
            <StepDot step={3} quoteStep={quoteStep} />
          </div>
          <div className="flex justify-between mt-1.5 px-1">
            <span className={`text-xs font-medium ${quoteStep >= 1 ? "text-emerald-600" : "text-gray-400"}`}>Upload</span>
            <span className={`text-xs font-medium ${quoteStep >= 2 ? "text-emerald-600" : "text-gray-400"}`}>Quote</span>
            <span className={`text-xs font-medium ${quoteStep >= 3 ? "text-emerald-600" : "text-gray-400"}`}>Book</span>
          </div>
        </div>

        {quoteStep === 1 && (
          <UploadStep
            quoteError={quoteError}
            uploadedImages={uploadedImages}
            imageFiles={imageFiles}
            imageDescription={imageDescription}
            setImageDescription={setImageDescription}
            imageAnalyzing={imageAnalyzing}
            analysisStatus={analysisStatus}
            onImageUpload={onImageUpload}
            onRemoveImageAt={onRemoveImageAt}
            onClearImages={onClearImages}
            onAnalyze={onAnalyze}
            onCancel={onCancel}
          />
        )}

        {quoteStep === 2 && quote && (
          <QuoteStep
            quote={quote}
            onContinueToBooking={onContinueToBooking}
            onCloseAfterQuote={onCloseAfterQuote}
            priorityTier={priorityTier}
            onPriorityChange={onPriorityChange}
          />
        )}
      </Card>
    </div>
  );
}

function StepDot({ step, quoteStep }) {
  let state;
  if (step < quoteStep) state = "done";
  else if (step === quoteStep) state = "active";
  else state = "pending";
  const showCheck = step < quoteStep;
  return (
    <div className={`step-dot ${state}`}>
      {showCheck ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        step
      )}
    </div>
  );
}

function UploadStep({
  quoteError,
  uploadedImages,
  imageFiles,
  imageDescription,
  setImageDescription,
  imageAnalyzing,
  analysisStatus,
  onImageUpload,
  onRemoveImageAt,
  onClearImages,
  onAnalyze,
  onCancel,
}) {
  const count = (uploadedImages || []).length;
  const MAX = 8;
  const canAddMore = count < MAX;

  return (
    <>
      <CardHeader className="text-center pb-3 pt-6">
        <CardTitle className="text-xl sm:text-2xl font-bold text-gray-900">
          {count === 0 ? "Upload your junk photos" : `${count} photo${count === 1 ? "" : "s"} added`}
        </CardTitle>
        <CardDescription className="text-sm text-gray-500">
          {count === 0
            ? "One photo is fine — add multiple if your piles are in different spots"
            : canAddMore
              ? "Add more photos if you have piles in other spots (all go on one quote)"
              : `Maximum of ${MAX} photos per quote`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 px-5 sm:px-6">
        {quoteError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-red-600 text-sm font-medium">{quoteError}</p>
          </div>
        )}

        {count === 0 ? (
          <div className="space-y-3">
            <label className="block cursor-pointer">
              <div className="flex items-center gap-4 p-4 border-2 border-dashed border-emerald-300 rounded-xl bg-emerald-50/50 hover:bg-emerald-50 transition-colors">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Take a picture</p>
                  <p className="text-xs text-gray-500">Open camera to capture now</p>
                </div>
                <svg className="w-5 h-5 text-gray-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <Input type="file" accept="image/*" capture="environment" multiple onChange={onImageUpload} className="hidden" data-testid="camera-input" />
            </label>

            <label className="block cursor-pointer">
              <div className="flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Choose from gallery</p>
                  <p className="text-xs text-gray-500">Select one or multiple photos</p>
                </div>
                <svg className="w-5 h-5 text-gray-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <Input type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" data-testid="gallery-input" />
            </label>

            <p className="text-xs text-gray-400 text-center">Up to {MAX} photos · PNG, JPG, HEIC — any size, we'll shrink them</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Thumbnail strip */}
            <div className="grid grid-cols-3 gap-2" data-testid="upload-thumbs">
              {uploadedImages.map((src, idx) => (
                <div
                  key={`${src.slice(-20)}-${idx}`}
                  className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50 group"
                >
                  <img src={src} alt={`Pile ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onRemoveImageAt(idx)}
                    disabled={imageAnalyzing}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/70 text-white rounded-full text-xs flex items-center justify-center hover:bg-black disabled:opacity-50"
                    aria-label={`Remove photo ${idx + 1}`}
                    data-testid={`remove-photo-${idx}`}
                  >
                    ✕
                  </button>
                  <div className="absolute bottom-1 left-1 bg-emerald-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                    {idx + 1}
                  </div>
                </div>
              ))}
              {canAddMore && (
                <label className="aspect-square rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 flex flex-col items-center justify-center cursor-pointer transition-colors">
                  <span className="text-2xl text-emerald-500 mb-0.5">＋</span>
                  <span className="text-[11px] text-emerald-700 font-medium">Add photo</span>
                  <Input type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" data-testid="add-more-input" />
                </label>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {count} of {MAX} photo{count === 1 ? "" : "s"} — all combined into one quote
              </span>
              <button
                type="button"
                onClick={onClearImages}
                disabled={imageAnalyzing}
                className="text-red-600 hover:underline disabled:opacity-50"
                data-testid="clear-photos-btn"
              >
                Clear all
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">
            Brief description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <Textarea
            placeholder={count > 1 ? "e.g., 4 piles: garage, side yard, curb, back patio…" : "e.g., Old furniture in garage, mattress, boxes..."}
            value={imageDescription}
            onChange={(e) => setImageDescription(e.target.value)}
            className="min-h-[70px] text-sm resize-none rounded-xl border-gray-200"
            maxLength={200}
            data-testid="image-description-input"
          />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-700 font-medium">
            Ground level & curbside pickup only. Items must be accessible without stairs.
          </p>
        </div>

        {/* AI Disclaimer — upload step */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3" data-testid="ai-disclaimer-upload">
          <p className="text-[11px] text-blue-800 leading-relaxed">
            <span className="font-bold">⚡ AI-generated estimates are preliminary</span> and may change after in-person inspection.
            Final pricing is confirmed at pickup based on actual volume and accessibility.
          </p>
        </div>
      </CardContent>

      <div className="p-5 bg-white border-t flex justify-between gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={imageAnalyzing}
          className="h-11 rounded-xl border-gray-200"
          data-testid="cancel-quote-btn"
        >
          Cancel
        </Button>
        <Button
          onClick={onAnalyze}
          disabled={!imageFiles || imageFiles.length === 0 || imageAnalyzing}
          className="h-11 bg-emerald-600 hover:bg-emerald-700 rounded-xl px-6 font-semibold"
          data-testid="get-instant-quote-btn"
        >
          {imageAnalyzing ? (
            <span className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              {analysisStatus || "Analyzing..."}
            </span>
          ) : (
            "Get Quote"
          )}
        </Button>
      </div>
    </>
  );
}

function QuoteStep({ quote, onContinueToBooking, onCloseAfterQuote, priorityTier, onPriorityChange }) {
  return (
    <>
      <CardHeader className="text-center pb-2 pt-6 bg-emerald-50 border-b border-emerald-100">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <p className="text-sm font-bold text-emerald-700 mb-2" data-testid="quote-success-msg">
          Quote submitted successfully!
        </p>
        <div className="text-5xl font-black text-emerald-700 mb-1">${quote.total_price}</div>
        <CardDescription className="text-sm font-medium text-emerald-600">Your instant quote</CardDescription>
        <div className="mt-2">
          <Badge variant="outline" className="border-emerald-200 text-emerald-600 text-xs">
            Quote #{quote.id?.substring(0, 8)}
          </Badge>
        </div>
        {/* AI Disclaimer — quote step (small text right under price) */}
        <p className="mt-2 text-[10px] text-gray-500 italic px-4" data-testid="ai-disclaimer-quote">
          AI-generated estimate · Final price confirmed at pickup based on actual volume
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pt-5 px-5 sm:px-6">
        {quote.breakdown?.items?.length > 0 && (
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
            <div className="px-4 py-2.5 bg-gray-50 rounded-t-xl">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Items identified</h4>
            </div>
            {quote.breakdown.items.map((item, index) => (
              <div key={`${item.name}-${item.size}-${index}`} className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm text-gray-700">
                  {item.name} <span className="text-xs text-gray-400">({item.size})</span>
                </span>
                <span className="text-sm font-semibold text-gray-900">${item.estimated_cost || "—"}</span>
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

        {/* Priority Pickup upgrade — surfaces directly under the quote */}
        <PriorityPicker value={priorityTier} onChange={onPriorityChange} />

        <AddToHomeScreenPrompt />
      </CardContent>

      <div className="p-5 bg-white border-t space-y-3">
        <Button
          onClick={onContinueToBooking}
          className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold text-base"
          data-testid="book-pickup-btn"
        >
          Continue to Booking
        </Button>
        <Button
          variant="outline"
          onClick={onCloseAfterQuote}
          className="w-full h-12 rounded-xl border-gray-200 font-semibold text-base"
          data-testid="close-quote-btn"
        >
          Close
        </Button>
      </div>
    </>
  );
}
