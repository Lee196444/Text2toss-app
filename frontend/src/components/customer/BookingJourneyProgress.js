import React from "react";

/**
 * Visual progress indicator showing where a customer is in the
 * Quote → Book → Pay → Pickup journey.
 *
 * Props:
 *   - status: booking.status ("pending_customer_approval" | "pending_payment" |
 *             "scheduled" | "in_progress" | "completed" | "cancelled")
 *   - paymentStatus: booking.payment_status ("pending" | "paid" | "cancelled")
 *   - approvalStatus: optional quote_details.approval_status
 *   - compact: true → smaller layout for cards (default false)
 */

const STAGES = [
  { id: "quote",   label: "Quote",   icon: "💬" },
  { id: "book",    label: "Book",    icon: "📅" },
  { id: "pay",     label: "Pay",     icon: "💳" },
  { id: "pickup",  label: "Pickup",  icon: "🚚" },
];

// Map a (status, paymentStatus, approvalStatus) tuple to:
//   - currentIdx: 0..3 — the stage they're CURRENTLY in
//   - completedThrough: 0..4 — how many stages are fully done
function deriveProgress({ status, paymentStatus, approvalStatus }) {
  if (status === "cancelled") {
    return { currentIdx: -1, completedThrough: 0, percent: 0, cancelled: true };
  }
  if (status === "completed") {
    return { currentIdx: 3, completedThrough: 4, percent: 100 };
  }
  // Money still owed → block at "Pay" stage regardless of scheduled-ness
  if (paymentStatus === "pending" || status === "pending_payment") {
    // If admin hasn't approved the quote yet, they're still at "Book"
    if (approvalStatus === "pending_customer_approval" || status === "pending_customer_approval") {
      return { currentIdx: 1, completedThrough: 1, percent: 25 };
    }
    return { currentIdx: 2, completedThrough: 2, percent: 50 };
  }
  if (status === "in_progress" || status === "scheduled") {
    // Booked + paid + scheduled → at "pickup" stage
    return { currentIdx: 3, completedThrough: 3, percent: 90 };
  }
  if (status === "pending_customer_approval" || approvalStatus === "pending_customer_approval") {
    return { currentIdx: 1, completedThrough: 1, percent: 25 };
  }
  // Default — they have a quote but haven't booked
  return { currentIdx: 0, completedThrough: 0, percent: 10 };
}

function summaryFor(prog) {
  if (prog.cancelled) return { headline: "Booking cancelled", sub: "Reach out at 928-853-9619 to reschedule." };
  if (prog.percent >= 100) return { headline: "All done — pickup complete!", sub: "Thanks for choosing Text2toss." };
  if (prog.percent >= 90)  return { headline: "Almost there!", sub: "Pickup is scheduled — our team is on the way." };
  if (prog.percent >= 50)  return { headline: "Halfway there!", sub: "Complete payment to lock in your pickup." };
  if (prog.percent >= 25)  return { headline: "Booking submitted", sub: "Hold tight — we're reviewing your quote (usually <24h)." };
  return { headline: "Quote received", sub: "Continue to booking when you're ready." };
}

export default function BookingJourneyProgress({
  status,
  paymentStatus,
  approvalStatus,
  compact = false,
}) {
  const prog = deriveProgress({ status, paymentStatus, approvalStatus });
  const summary = summaryFor(prog);

  return (
    <div
      className={`bg-white rounded-2xl border ${
        prog.cancelled ? "border-red-200" : "border-emerald-100"
      } ${compact ? "p-3" : "p-4 sm:p-5"} shadow-sm`}
      data-testid="booking-journey-progress"
    >
      {/* Headline + percent */}
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className={`font-bold ${compact ? "text-sm" : "text-base"} ${prog.cancelled ? "text-red-700" : "text-gray-900"}`}>
            {summary.headline}
          </p>
          {!compact && <p className="text-xs text-gray-500 mt-0.5">{summary.sub}</p>}
        </div>
        {!prog.cancelled && (
          <span
            className={`font-black ${compact ? "text-xl" : "text-3xl"} text-emerald-600 tabular-nums`}
            data-testid="booking-journey-percent"
          >
            {prog.percent}%
          </span>
        )}
      </div>

      {/* Bar + steps */}
      <div className="relative">
        {/* Track */}
        <div className="absolute top-4 left-4 right-4 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              prog.cancelled ? "bg-red-300" : "bg-gradient-to-r from-emerald-400 to-emerald-600"
            }`}
            style={{ width: `${prog.percent}%` }}
          ></div>
        </div>

        {/* Step dots */}
        <div className="relative grid grid-cols-4">
          {STAGES.map((stage, idx) => {
            const isDone = idx < prog.completedThrough && !prog.cancelled;
            const isActive = idx === prog.currentIdx && !prog.cancelled && prog.percent < 100;
            const isComplete = prog.percent >= 100 && idx === 3;
            return (
              <div
                key={stage.id}
                className="flex flex-col items-center"
                data-testid={`journey-stage-${stage.id}`}
              >
                <div
                  className={`relative z-10 ${compact ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm"} rounded-full border-2 flex items-center justify-center font-bold transition-colors ${
                    prog.cancelled
                      ? "bg-gray-100 border-gray-200 text-gray-400"
                      : isDone || isComplete
                      ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                      : isActive
                      ? "bg-white border-emerald-500 text-emerald-600 ring-4 ring-emerald-100"
                      : "bg-white border-gray-200 text-gray-300"
                  }`}
                >
                  {isDone || isComplete ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="leading-none">{stage.icon}</span>
                  )}
                  {/* Active pulse */}
                  {isActive && (
                    <span className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-50"></span>
                  )}
                </div>
                <span
                  className={`mt-2 ${compact ? "text-[10px]" : "text-xs"} font-semibold transition-colors ${
                    prog.cancelled
                      ? "text-gray-400"
                      : isDone || isComplete
                      ? "text-emerald-700"
                      : isActive
                      ? "text-emerald-900"
                      : "text-gray-400"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
