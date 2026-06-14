import React from "react";
import { Link } from "react-router-dom";

/**
 * Lightweight footer shown on every public page (landing, payment, tracking,
 * legal pages). Provides Stripe-compliant legal links + brand sign-off.
 */
const SiteFooter = ({ variant = "light" }) => {
  const isDark = variant === "dark";
  const wrap = isDark
    ? "bg-black border-t-2 border-lime-400/30 text-white/80"
    : "bg-gray-900 border-t-2 border-lime-400/20 text-white/80";

  return (
    <footer className={`${wrap} pt-8 pb-24 sm:pb-12`} data-testid="site-footer">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src="/apple-touch-icon.png?v=8" alt="Text2toss" className="w-8 h-8 rounded-md" />
          <span className="font-display italic text-white text-sm uppercase tracking-tight">Text2toss</span>
          <span className="ml-1 inline-flex items-center bg-lime-400 text-black text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">#1 AZ</span>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-display italic uppercase tracking-wider">
          <Link to="/terms" className="hover:text-lime-400 transition-colors" data-testid="footer-terms-link">Terms of Service</Link>
          <span className="text-white/30">|</span>
          <Link to="/privacy" className="hover:text-lime-400 transition-colors" data-testid="footer-privacy-link">Privacy Policy</Link>
          <span className="text-white/30">|</span>
          <Link to="/refund-policy" className="hover:text-lime-400 transition-colors" data-testid="footer-refund-link">Refund Policy</Link>
        </nav>

        <div className="text-xs text-white/50 text-center sm:text-right">
          © {new Date().getFullYear()} Text2toss · Flagstaff, AZ
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
