import React from "react";
import { ArrowDown, Check } from "lucide-react";

// Compact "what's next" footer shown until the form is complete; then the
// parent swaps in the consent + pay buttons. Keeps the mobile view uncluttered.
export const BOOKING_STEPS = [
  { key: "schedule", label: "Pick a date & time", id: "bk-schedule" },
  { key: "contact", label: "Add your address & phone", id: "bk-contact" },
  { key: "requirements", label: "Confirm items are curbside", id: "bk-requirements" },
];

export const bookingStepStatus = (bookingData) => {
  const digits = (bookingData.phone || "").replace(/\D/g, "");
  return {
    schedule: !!(bookingData.pickup_date && bookingData.pickup_time),
    contact: (bookingData.address || "").trim().length >= 8 && digits.length >= 10,
    requirements: !!bookingData.curbside_confirmed,
  };
};

const GuidedFooter = ({ bookingData, scrollRef, onCancel }) => {
  const status = bookingStepStatus(bookingData);
  const next = BOOKING_STEPS.find((s) => !status[s.key]);
  if (!next) return null;
  const doneCount = BOOKING_STEPS.filter((s) => status[s.key]).length;

  const jump = () => {
    const el = document.getElementById(next.id);
    const container = scrollRef?.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - container.offsetTop - 8, behavior: "smooth" });
      el.classList.add("ring-2", "ring-cyan-400", "rounded-xl");
      setTimeout(() => el.classList.remove("ring-2", "ring-cyan-400", "rounded-xl"), 1400);
    }
  };

  return (
    <div className="px-4 pt-3 pb-3 sm:pb-4" data-testid="guided-footer">
      <div className="flex items-center gap-1.5 mb-2" aria-label={`${doneCount} of ${BOOKING_STEPS.length} steps done`}>
        {BOOKING_STEPS.map((s) => (
          <div key={s.key} className={`h-1.5 flex-1 rounded-full transition-colors ${status[s.key] ? "bg-cyan-400" : "bg-gray-200"}`} />
        ))}
        <span className="text-[10px] text-gray-500 ml-1 whitespace-nowrap">{doneCount}/{BOOKING_STEPS.length}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={jump}
          data-testid="guided-next-btn"
          className="flex-1 h-12 rounded-xl bg-black text-cyan-400 border-2 border-cyan-400 font-display italic uppercase tracking-wider text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
        >
          {doneCount > 0 && <Check className="w-4 h-4 text-emerald-400" />}
          Next: {next.label} <ArrowDown className="w-4 h-4 animate-bounce" />
        </button>
        <button type="button" onClick={onCancel} data-testid="guided-cancel-btn" className="h-12 px-4 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-gray-400 text-center mt-1.5">Payment options appear once these are filled in</p>
    </div>
  );
};

export default GuidedFooter;
