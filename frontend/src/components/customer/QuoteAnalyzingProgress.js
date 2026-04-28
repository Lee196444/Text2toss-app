import React, { useEffect, useState, useRef } from "react";

/**
 * Multi-step "AI is reviewing your photo" progress overlay shown while the
 * /api/quotes/image request is in flight.
 *
 * The actual call is a single round-trip (~1-3s on Gemini), but we animate
 * the steps to make the wait feel purposeful AND we surface the real numbers
 * (item count, cubic feet, price) on the relevant steps once the response
 * lands. If the response arrives before the animation completes, we let the
 * remaining steps tick through quickly so the customer always sees all four
 * values populate before the modal closes.
 *
 * Props:
 *   - quote: the resolved quote object once axios finishes (null while pending)
 *   - error: optional error string to surface
 *   - onDone: called once the closing animation finishes (parent then advances
 *             to the quote screen)
 */

// Step ids must match the order we surface real values.
const STEP_IDS = ["inspect", "items", "volume", "price", "finalize"];
const STEP_DEFAULTS = {
  inspect:  { label: "Inspecting your photo",     icon: "🔍", duration: 600 },
  items:    { label: "Identifying each item",     icon: "📦", duration: 900 },
  volume:   { label: "Estimating cubic volume",   icon: "📐", duration: 800 },
  price:    { label: "Calculating fair price",    icon: "💵", duration: 700 },
  finalize: { label: "Finalizing your quote",     icon: "✨", duration: 500 },
};

const TIPS = [
  "Did you know? We've helped Flagstaff residents toss 2,400+ items.",
  "Pro tip: clearer photos = sharper quotes. Natural daylight works best.",
  "Curbside & ground level only — saves you money on labor.",
  "Booked Mon-Thu? Your slot is usually confirmed within 24 hours.",
];

export default function QuoteAnalyzingProgress({ quote, error, onDone }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Step timer — speeds up if the API response is already back.
  useEffect(() => {
    if (done || error) return;
    if (activeIdx >= STEP_IDS.length) {
      setDone(true);
      return;
    }
    const id = STEP_IDS[activeIdx];
    // If the quote response is already back, race through the rest faster.
    const speedFactor = quote ? 0.35 : 1;
    const t = setTimeout(() => setActiveIdx((s) => s + 1), STEP_DEFAULTS[id].duration * speedFactor);
    return () => clearTimeout(t);
  }, [activeIdx, done, quote, error]);

  // Once `done` flips on, give the customer ~700ms to see the "your quote is
  // ready!" banner before transitioning to step 2.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => onDoneRef.current?.(), 700);
    return () => clearTimeout(t);
  }, [done]);

  // Rotating tip
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 2200);
    return () => clearInterval(t);
  }, [done]);

  // Bubble error up immediately
  useEffect(() => {
    if (error) onDoneRef.current?.();
  }, [error]);

  const realValueFor = (stepId) => {
    if (!quote) return null;
    if (stepId === "items") {
      const count = quote.items?.length ?? 0;
      return `${count} item${count === 1 ? "" : "s"}`;
    }
    if (stepId === "volume") {
      const cf = quote.breakdown?.cubic_feet;
      if (cf == null) return null;
      return `~${Math.round(cf)} cu ft`;
    }
    if (stepId === "price") {
      return `$${Number(quote.total_price).toFixed(0)}`;
    }
    return null;
  };

  const totalSteps = STEP_IDS.length;
  const totalProgress = done ? 100 : Math.round((activeIdx / totalSteps) * 100);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5 text-white text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-2xl">🧠</span>
            <h2 className="text-lg font-bold">AI is reviewing your photo</h2>
          </div>
          <p className="text-sm text-emerald-50/90">
            {done ? "Done — your quote is ready!" : "Hang tight — usually 1-3 seconds"}
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2">
              <span>Progress</span>
              <span data-testid="analyze-pct">{totalProgress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${totalProgress}%` }}
              ></div>
            </div>
          </div>

          {/* Steps list */}
          <ul className="space-y-2.5" data-testid="analyze-steps">
            {STEP_IDS.map((id, idx) => {
              const step = STEP_DEFAULTS[id];
              const isDone = idx < activeIdx || done;
              const isActive = idx === activeIdx && !done;
              const isPending = idx > activeIdx && !done;
              const value = isDone ? realValueFor(id) : null;
              return (
                <li
                  key={id}
                  data-testid={`analyze-step-${id}`}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                    isActive
                      ? "bg-emerald-50 border border-emerald-200 shadow-sm"
                      : isDone
                      ? "bg-white"
                      : "bg-gray-50/50"
                  }`}
                >
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    {isDone ? (
                      <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="relative">
                        <div className="w-7 h-7 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
                        <span className="absolute inset-0 flex items-center justify-center text-base">{step.icon}</span>
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-sm">
                        {step.icon}
                      </div>
                    )}
                  </div>

                  <span
                    className={`flex-1 text-sm font-medium transition-colors ${
                      isActive
                        ? "text-emerald-900"
                        : isDone
                        ? "text-gray-700"
                        : "text-gray-400"
                    }`}
                  >
                    {step.label}
                    {isActive && <span className="ml-1 inline-block animate-pulse">…</span>}
                  </span>

                  {/* Real values shown once the step is done */}
                  {value && (
                    <span
                      className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full"
                      data-testid={`analyze-step-${id}-value`}
                    >
                      {value}
                    </span>
                  )}
                  {!value && isDone && (
                    <span className="text-[10px] uppercase tracking-wide text-emerald-600 font-bold">Done</span>
                  )}
                  {isPending && (
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">Queued</span>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Rotating tip */}
          {!error && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-xs text-amber-800 font-medium" data-testid="analyze-tip">
                💡 {TIPS[tipIdx]}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`border-t px-6 py-3 text-center transition-colors ${
            done ? "bg-emerald-50 border-emerald-100" : "bg-gray-50 border-gray-100"
          }`}
        >
          {done ? (
            <p className="text-sm font-bold text-emerald-700">✅ Your quote is ready!</p>
          ) : (
            <p className="text-xs text-gray-500">
              We're using AI vision to scan, count, and price every item. No surprises later.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
