import React from "react";
import { Check } from "lucide-react";

// Tappable header steps for the booking form: Date → Contact → Pay.
const STEPS = [
  { key: "schedule", short: "Date", id: "bk-schedule" },
  { key: "contact", short: "Contact", id: "bk-contact" },
  { key: "requirements", short: "Pay", id: "bk-pay" },
];

export const scrollToSection = (scrollRef, id, highlight = true) => {
  const el = document.getElementById(id);
  const container = scrollRef?.current;
  if (!el || !container) return;
  container.scrollTo({ top: Math.max(0, el.offsetTop - container.offsetTop - 8), behavior: "smooth" });
  if (highlight) {
    el.classList.add("ring-2", "ring-cyan-400", "rounded-xl");
    setTimeout(() => el.classList.remove("ring-2", "ring-cyan-400", "rounded-xl"), 1400);
  }
};

const StepDots = ({ stepStatus, activeKey, scrollRef }) => (
  <nav className="flex items-center gap-1 text-white" aria-label="Booking steps" data-testid="booking-step-dots">
    {STEPS.map((s, i) => {
      const done = !!stepStatus[s.key];
      const active = s.key === activeKey;
      return (
        <React.Fragment key={s.key}>
          {i > 0 && <div className={`w-3 h-0.5 ${stepStatus[STEPS[i - 1].key] ? "bg-cyan-400" : "bg-white/25"}`} />}
          <button
            type="button"
            data-testid={`step-dot-${s.key}`}
            onClick={() => scrollToSection(scrollRef, s.id)}
            className={`group flex items-center gap-1 rounded-full pl-0.5 pr-2 py-0.5 transition-colors hover:bg-white/10 ${active ? "bg-white/10" : ""}`}
            aria-current={active ? "step" : undefined}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
              done ? "bg-cyan-400 text-black" : active ? "bg-black text-cyan-400 ring-2 ring-cyan-400" : "bg-white/15 text-white/70 ring-1 ring-white/30"
            }`}>
              {done ? <Check className="w-3 h-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`text-[10px] font-display italic uppercase tracking-wider ${active || done ? "text-cyan-400" : "text-white/60"}`}>{s.short}</span>
          </button>
        </React.Fragment>
      );
    })}
  </nav>
);

export default StepDots;
