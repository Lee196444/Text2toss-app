import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import AddToHomeScreenPrompt from "../components/customer/AddToHomeScreenPrompt";
import PriorityPicker, { PRIORITY_TIERS } from "../components/customer/PriorityPicker";
import usePriorityConfig from "../hooks/usePriorityConfig";

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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-stretch sm:items-center justify-center sm:p-4">
      <Card className="w-full max-w-lg h-screen sm:h-auto sm:max-h-[95vh] sm:my-0 shadow-2xl border-0 overflow-y-auto rounded-none sm:rounded-2xl">
        {/* Progress */}
        <div className="bg-black border-b border-lime-400/30 px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-center gap-2">
            <StepDot step={1} quoteStep={quoteStep} />
            <div className={`step-line ${quoteStep > 1 ? "done" : ""}`}></div>
            <StepDot step={2} quoteStep={quoteStep} />
            <div className={`step-line ${quoteStep > 2 ? "done" : ""}`}></div>
            <StepDot step={3} quoteStep={quoteStep} />
          </div>
          <div className="flex justify-between mt-1.5 px-1">
            <span className={`text-xs font-display italic uppercase tracking-wider ${quoteStep >= 1 ? "text-lime-400" : "text-gray-500"}`}>Upload</span>
            <span className={`text-xs font-display italic uppercase tracking-wider ${quoteStep >= 2 ? "text-lime-400" : "text-gray-500"}`}>Quote</span>
            <span className={`text-xs font-display italic uppercase tracking-wider ${quoteStep >= 3 ? "text-lime-400" : "text-gray-500"}`}>Book</span>
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
      <CardHeader className="text-center pb-2 pt-5 bg-black border-b border-lime-400/20">
        <CardTitle className="font-display italic text-2xl sm:text-3xl uppercase tracking-tight text-white">
          {count === 0 ? <>Snap your <span className="text-lime-400">junk pile</span></> : <>{count} photo{count === 1 ? "" : "s"} <span className="text-lime-400">locked in</span></>}
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-gray-400 mt-1.5 tracking-wide">
          {count === 0
            ? "Instant AI quote · curbside / ground level only"
            : canAddMore
              ? "Add another pile or continue to your quote"
              : `Maximum of ${MAX} photos reached`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 px-5 sm:px-6 pb-2 pt-5 bg-gray-50">
        {quoteError && (
          <div className="bg-red-50 border-2 border-red-400 rounded-lg p-3 text-center">
            <p className="text-red-700 text-sm font-semibold">{quoteError}</p>
          </div>
        )}

        {count === 0 ? (
          <div className="space-y-3">
            {/* Hero camera button — black + neon lime brand */}
            <label className="block cursor-pointer group" data-testid="camera-cta">
              <div className="relative overflow-hidden rounded-2xl bg-black border-2 border-lime-400 p-5 shadow-[0_8px_24px_-6px_rgba(190,242,100,0.45)] hover:shadow-[0_10px_30px_-6px_rgba(190,242,100,0.6)] transition-all active:scale-[0.98]">
                {/* Subtle lime glow corner */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-lime-400/15 rounded-full blur-2xl pointer-events-none"></div>
                <div className="relative flex items-center gap-4">
                  <div className="w-14 h-14 bg-lime-400 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                    <svg className="w-7 h-7 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-display italic text-xl uppercase tracking-tight text-lime-400 leading-none">Take a Photo</p>
                    <p className="text-xs text-gray-300 mt-1.5">Open camera · fastest way</p>
                  </div>
                  <svg className="w-6 h-6 text-lime-400 group-hover:translate-x-1 transition-transform flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              <Input type="file" accept="image/*" capture="environment" multiple onChange={onImageUpload} className="hidden" data-testid="camera-input" />
            </label>

            {/* Secondary: gallery option — chrome / light variant */}
            <label className="block cursor-pointer" data-testid="gallery-cta">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white border-2 border-gray-300 hover:border-black hover:bg-gray-50 transition-colors active:scale-[0.99] shadow-sm">
                <div className="w-11 h-11 bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-display italic text-base uppercase tracking-tight text-black leading-none">Choose from Gallery</p>
                  <p className="text-xs text-gray-500 mt-1">Pick up to {MAX} photos</p>
                </div>
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <Input type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" data-testid="gallery-input" />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Thumbnail strip — bold lime accents */}
            <div className="grid grid-cols-3 gap-2.5" data-testid="upload-thumbs">
              {uploadedImages.map((src, idx) => (
                <div
                  key={`${src.slice(-20)}-${idx}`}
                  className="relative aspect-square rounded-xl overflow-hidden ring-2 ring-black bg-gray-50 group shadow-md"
                >
                  <img src={src} alt={`Pile ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onRemoveImageAt(idx)}
                    disabled={imageAnalyzing}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black hover:bg-gray-900 text-lime-400 rounded-full text-sm font-bold flex items-center justify-center disabled:opacity-50 shadow-lg ring-1 ring-lime-400/40"
                    aria-label={`Remove photo ${idx + 1}`}
                    data-testid={`remove-photo-${idx}`}
                  >
                    ✕
                  </button>
                  <div className="absolute bottom-1.5 left-1.5 bg-lime-400 text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow font-display italic">
                    #{idx + 1}
                  </div>
                </div>
              ))}
              {canAddMore && (
                <label className="aspect-square rounded-xl border-2 border-dashed border-black bg-lime-50 hover:bg-lime-100 flex flex-col items-center justify-center cursor-pointer transition-colors">
                  <span className="text-3xl text-black leading-none mb-1">＋</span>
                  <span className="text-[11px] text-black font-display italic uppercase tracking-wide">Add photo</span>
                  <Input type="file" accept="image/*" multiple onChange={onImageUpload} className="hidden" data-testid="add-more-input" />
                </label>
              )}
            </div>

            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-gray-700 font-semibold tracking-wide">
                {count} of {MAX} · combined into one quote
              </span>
              <button
                type="button"
                onClick={onClearImages}
                disabled={imageAnalyzing}
                className="text-red-600 font-display italic uppercase tracking-wide hover:underline disabled:opacity-50"
                data-testid="clear-photos-btn"
              >
                Clear all
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-display italic uppercase tracking-wide text-black">
            Anything we should know? <span className="text-gray-400 normal-case font-normal">(optional)</span>
          </label>
          <Textarea
            placeholder={count > 1 ? "e.g., 4 piles: garage, side yard, curb, back patio…" : "e.g., Old couch, broken washer, lots of boxes…"}
            value={imageDescription}
            onChange={(e) => setImageDescription(e.target.value)}
            className="min-h-[72px] text-sm resize-none rounded-xl border-2 border-gray-300 focus:border-lime-500 focus:ring-2 focus:ring-lime-100 bg-white"
            maxLength={200}
            data-testid="image-description-input"
          />
        </div>

        {/* Brand info card — black header strip + clean content */}
        <div className="rounded-xl overflow-hidden border-2 border-black shadow-sm">
          <div className="bg-black px-3 py-1.5">
            <p className="font-display italic uppercase text-[11px] tracking-wider text-lime-400">Quick Heads-Up</p>
          </div>
          <div className="bg-white p-3 space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-base leading-none mt-0.5">📋</span>
              <p className="text-xs text-gray-800 leading-relaxed">
                <span className="font-bold">Curbside / ground level only.</span> No stairs.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-base leading-none mt-0.5">⚡</span>
              <p className="text-xs text-gray-800 leading-relaxed">
                <span className="font-bold">AI estimate is preliminary.</span> Final price confirmed at pickup.
              </p>
            </div>
          </div>
        </div>
      </CardContent>

      <div className="p-5 bg-black border-t-2 border-lime-400/30 flex justify-between gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={imageAnalyzing}
          className="h-12 rounded-xl border-2 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white hover:border-white/50 font-display italic uppercase tracking-wide"
          data-testid="cancel-quote-btn"
        >
          Cancel
        </Button>
        <Button
          onClick={onAnalyze}
          disabled={!imageFiles || imageFiles.length === 0 || imageAnalyzing}
          className="h-12 bg-lime-400 hover:bg-lime-300 text-black rounded-xl px-6 font-display italic uppercase tracking-wider shadow-[0_4px_14px_-2px_rgba(190,242,100,0.5)] disabled:opacity-40 disabled:shadow-none flex-1"
          data-testid="get-instant-quote-btn"
        >
          {imageAnalyzing ? (
            <span className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent"></div>
              {analysisStatus || "Analyzing..."}
            </span>
          ) : (
            "Get Quote →"
          )}
        </Button>
      </div>
    </>
  );
}

function QuoteStep({ quote, onContinueToBooking, onCloseAfterQuote, priorityTier, onPriorityChange }) {
  const { fees: priorityFees } = usePriorityConfig();
  const tierMeta = PRIORITY_TIERS.find(t => t.id === priorityTier);
  const priorityFee = priorityTier ? (priorityFees?.[priorityTier] ?? tierMeta?.fee ?? 0) : 0;
  const priorityLabel = tierMeta?.title || "";
  const priorityIcon = tierMeta?.icon || "";
  const totalWithPriority = (quote.total_price || 0) + priorityFee;
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
        <div className="text-5xl font-black text-emerald-700 mb-1" data-testid="quote-total-price">${totalWithPriority}</div>
        <CardDescription className="text-sm font-medium text-emerald-600">
          {priorityFee > 0 ? <>Your total with priority pickup</> : <>Your instant quote</>}
        </CardDescription>
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
        {/* === Price breakdown (always shown when priority selected) === */}
        {priorityFee > 0 && (
          <div
            className="rounded-xl border-2 border-lime-300 bg-lime-50 overflow-hidden"
            data-testid="price-breakdown-card"
          >
            <div className="px-4 py-2 bg-lime-100 border-b border-lime-200">
              <h4 className="font-display italic text-xs text-black uppercase tracking-wider">Price breakdown</h4>
            </div>
            <div className="divide-y divide-lime-200">
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm text-gray-700">Base junk-removal quote</span>
                <span className="text-sm font-bold text-gray-900">${quote.total_price}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5 bg-lime-100/40">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{priorityIcon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-lime-800">+ {priorityLabel}</p>
                    <p className="text-[10px] text-lime-700/80 leading-tight">Priority pickup · non-refundable</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-lime-700">+${priorityFee}</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3 bg-emerald-50">
                <span className="font-display italic text-base text-black uppercase tracking-wider">Total</span>
                <span className="font-display italic text-2xl text-emerald-700">${totalWithPriority}</span>
              </div>
            </div>
          </div>
        )}

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
              Continue to provide your details. Payment is blocked until approval. You&apos;ll hear back within 24 hours.
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
