import React, { useEffect, useState } from "react";

/**
 * Standalone preview of the proposed multi-step "Analyzing your photo" UX.
 * Visit /loading-demo to see it. Not linked from anywhere — for design review only.
 */

const STEPS = [
  { id: 1, label: "Inspecting your photo", icon: "🔍", duration: 3000 },
  { id: 2, label: "Identifying each item", icon: "📦", duration: 7000 },
  { id: 3, label: "Estimating cubic volume", icon: "📐", duration: 6000 },
  { id: 4, label: "Calculating fair price", icon: "💵", duration: 5000 },
  { id: 5, label: "Finalizing your quote", icon: "✨", duration: 4000 },
];

const TIPS = [
  "Did you know? We've helped Flagstaff residents toss 2,400+ items.",
  "Pro tip: clearer photos = sharper quotes. Natural daylight works best.",
  "Curbside & ground level only — saves you money on labor.",
  "Booked Mon-Thu? Your slot is usually confirmed within 24 hours.",
  "Already have a quote? Track its approval status anytime via 'Track Booking'.",
];

export default function LoadingDemoPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [done, setDone] = useState(false);

  // Step progression
  useEffect(() => {
    if (done) return;
    if (activeStep >= STEPS.length) {
      setDone(true);
      return;
    }
    const t = setTimeout(() => setActiveStep((s) => s + 1), STEPS[activeStep].duration);
    return () => clearTimeout(t);
  }, [activeStep, done]);

  // Tip rotation
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4000);
    return () => clearInterval(t);
  }, [done]);

  const restart = () => {
    setActiveStep(0);
    setDone(false);
    setTipIndex(0);
  };

  const totalProgress = done
    ? 100
    : Math.round((activeStep / STEPS.length) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* "Modal" container styled to match LandingPage quote modal */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5 text-white text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-2xl">🧠</span>
              <h2 className="text-lg font-bold">AI is reviewing your photo</h2>
            </div>
            <p className="text-sm text-emerald-50/90">
              {done ? "Done — your quote is ready!" : "Hang tight — usually 20-30 seconds"}
            </p>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2">
                <span>Progress</span>
                <span data-testid="loading-pct">{totalProgress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${totalProgress}%` }}
                ></div>
              </div>
            </div>

            {/* Steps list */}
            <ul className="space-y-2.5">
              {STEPS.map((step, idx) => {
                const isDone = idx < activeStep;
                const isActive = idx === activeStep && !done;
                const isPending = idx > activeStep && !done;
                return (
                  <li
                    key={step.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                      isActive
                        ? "bg-emerald-50 border border-emerald-200 shadow-sm"
                        : isDone
                        ? "bg-white"
                        : "bg-gray-50/50"
                    }`}
                  >
                    {/* Status icon */}
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                      {isDone || done ? (
                        <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : isActive ? (
                        <div className="relative">
                          <div className="w-7 h-7 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
                          <span className="absolute inset-0 flex items-center justify-center text-base">
                            {step.icon}
                          </span>
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
                          : isDone || done
                          ? "text-gray-700"
                          : "text-gray-400"
                      }`}
                    >
                      {step.label}
                      {isActive && <span className="ml-1 inline-block animate-pulse">…</span>}
                    </span>

                    {isDone && (
                      <span className="text-[10px] uppercase tracking-wide text-emerald-600 font-bold">
                        Done
                      </span>
                    )}
                    {isPending && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
                        Queued
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Rotating tip */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-xs text-amber-800 font-medium" data-testid="rotating-tip">
                💡 {TIPS[tipIndex]}
              </p>
            </div>
          </div>

          {/* Footer */}
          {done ? (
            <div className="bg-emerald-50 border-t border-emerald-100 px-6 py-4 text-center">
              <p className="text-sm font-bold text-emerald-700 mb-3">
                ✅ Your quote is ready!
              </p>
              <button
                onClick={restart}
                className="text-emerald-600 hover:text-emerald-700 text-sm font-semibold underline"
              >
                Replay demo
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 border-t border-gray-100 px-6 py-3 text-center">
              <p className="text-xs text-gray-500">
                We're using AI vision to scan, count, and price every item. No surprises later.
              </p>
            </div>
          )}
        </div>

        {/* Footer note (preview only) */}
        <p className="mt-4 text-center text-xs text-gray-400">
          DESIGN PREVIEW — not linked from the live site
        </p>
      </div>
    </div>
  );
}
