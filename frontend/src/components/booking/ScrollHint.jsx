import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

// Translucent bouncing arrow that tells people the form continues below.
// Hides itself once the scroll container is (nearly) at the bottom or can't scroll.
export default function ScrollHint({ scrollRef, label = "Scroll for address & contact info" }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const check = () => setShow(el.scrollHeight - el.clientHeight - el.scrollTop > 48);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); };
  }, [scrollRef]);

  if (!show) return null;
  return (
    <button
      type="button"
      data-testid="booking-scroll-hint"
      aria-label="Scroll down to continue"
      onClick={() => { const el = scrollRef.current; if (el) el.scrollTop += el.clientHeight * 0.8; }}
      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-2 z-20 flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-black/50 text-cyan-300 backdrop-blur-sm shadow-lg hover:bg-black/70 focus:outline-none transition-colors"
    >
      <span className="text-[10px] font-display italic uppercase tracking-widest leading-none">{label}</span>
      <ChevronDown className="w-5 h-5 animate-bounce" strokeWidth={3} />
    </button>
  );
}
