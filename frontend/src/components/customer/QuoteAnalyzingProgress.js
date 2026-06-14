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

// Status helpers — keep classNames + visuals out of the JSX where they
// were nested 2-3 ternaries deep.
const stepRowClass = ({ isDone, isActive }) => {
  const base = "flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-300";
  if (isActive) return `${base} bg-lime-400/10 border border-lime-400 shadow-sm`;
  if (isDone) return `${base} bg-white/5 border border-white/10`;
  return `${base} bg-white/[0.02] border border-white/5`;
};

const stepLabelClass = ({ isDone, isActive }) => {
  const base = "flex-1 text-sm font-medium transition-colors";
  if (isActive) return `${base} text-lime-300`;
  if (isDone) return `${base} text-gray-200`;
  return `${base} text-gray-500`;
};

function StepStatusIcon({ isDone, isActive, icon }) {
  if (isDone) {
    return (
      <div className="w-7 h-7 rounded-full bg-lime-400 text-black flex items-center justify-center shadow-[0_0_10px_-2px_rgba(190,242,100,0.55)]">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (isActive) {
    return (
      <div className="relative">
        <div className="w-7 h-7 rounded-full border-2 border-lime-400 border-t-transparent animate-spin"></div>
        <span className="absolute inset-0 flex items-center justify-center text-base">{icon}</span>
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-white/10 text-gray-500 flex items-center justify-center text-sm">
      {icon}
    </div>
  );
}

export default function QuoteAnalyzingProgress({ quote, error, onDone }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Step timer — speeds up if the API response is already back. If we reach
  // the last step but the quote isn't in yet, HOLD on it until the response
  // lands (otherwise the overlay fires onDone with pendingQuote=null and the
  // parent has no data to advance with — the user sees nothing happen and
  // clicks Get Quote again, which used to be the "press twice" bug).
  useEffect(() => {
    if (done || error) return;
    if (activeIdx >= STEP_IDS.length) {
      if (quote) setDone(true);
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-black rounded-2xl shadow-[0_20px_60px_-10px_rgba(190,242,100,0.4)] overflow-hidden border-2 border-lime-400/40">
        {/* Header — black with lime accent stripe */}
        <div className="bg-black px-6 py-5 text-center border-b border-lime-400/30 relative overflow-hidden">
          {/* Lime glow corner */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-lime-400/20 rounded-full blur-2xl pointer-events-none"></div>
          <div className="relative flex items-center justify-center gap-2 mb-1.5">
            <span className="text-2xl">🧠</span>
            <h2 className="font-display italic text-xl uppercase tracking-tight text-white">
              AI is <span className="text-lime-400">reviewing</span> your photo
            </h2>
          </div>
          <p className="text-xs uppercase tracking-wider text-gray-400 font-medium">
            {done ? "DONE — your quote is ready!" : "Hang tight — usually 1-3 seconds"}
          </p>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 bg-gray-950">
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-2">
              <span>Progress</span>
              <span className="text-lime-400" data-testid="analyze-pct">{totalProgress}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-lime-400 to-lime-300 rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(190,242,100,0.6)]"
                style={{ width: `${totalProgress}%` }}
              ></div>
            </div>
          </div>

          {/* Steps list */}
          <ul className="space-y-2" data-testid="analyze-steps">
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
                  className={stepRowClass({ isDone, isActive })}
                >
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    <StepStatusIcon isDone={isDone} isActive={isActive} icon={step.icon} />
                  </div>

                  <span className={stepLabelClass({ isDone, isActive })}>
                    {step.label}
                    {isActive && <span className="ml-1 inline-block animate-pulse">…</span>}
                  </span>

                  {/* Real values shown once the step is done */}
                  {value && (
                    <span
                      className="text-xs font-black text-black bg-lime-400 px-2 py-0.5 rounded-full font-display italic"
                      data-testid={`analyze-step-${id}-value`}
                    >
                      {value}
                    </span>
                  )}
                  {!value && isDone && (
                    <span className="text-[10px] uppercase tracking-widest text-lime-400 font-display italic">Done</span>
                  )}
                  {isPending && (
                    <span className="text-[10px] uppercase tracking-widest text-gray-600 font-display italic">Queued</span>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Rotating tip */}
          {!error && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-300 font-medium" data-testid="analyze-tip">
                💡 {TIPS[tipIdx]}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-3 text-center">
              <p className="text-sm text-red-300 font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-3 text-center border-t transition-colors ${
            done ? "bg-lime-400 border-lime-300" : "bg-black border-lime-400/20"
          }`}
        >
          {done ? (
            <p className="font-display italic uppercase tracking-wider text-sm text-black">✅ Your quote is ready!</p>
          ) : (
            <p className="text-[11px] text-gray-500 leading-relaxed">
              We&apos;re using AI vision to scan, count, and price every item. No surprises later.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
