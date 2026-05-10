import React from "react";
import { Link } from "react-router-dom";
import SiteFooter from "../../components/SiteFooter";

/**
 * Shared layout for the three legal pages. Keeps the brand chrome consistent
 * (header + footer) and renders the page body inside a clean, readable column.
 */
const LegalLayout = ({ title, lastUpdated, children }) => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Brand bar */}
      <header className="border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="legal-back-home-link">
            <img src="/apple-touch-icon.png?v=8" alt="Text2toss" className="w-9 h-9 rounded-lg shadow-sm" />
            <span className="font-display italic text-lg text-chrome">Text2toss</span>
          </Link>
          <nav className="flex items-center gap-4 text-xs font-display italic uppercase tracking-wider">
            <Link to="/terms" className="text-gray-600 hover:text-lime-600 transition-colors">Terms</Link>
            <Link to="/privacy" className="text-gray-600 hover:text-lime-600 transition-colors">Privacy</Link>
            <Link to="/refund-policy" className="text-gray-600 hover:text-lime-600 transition-colors">Refund</Link>
          </nav>
        </div>
      </header>

      {/* Page body */}
      <main className="flex-1 max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-14 w-full">
        <h1 className="font-display italic text-3xl sm:text-4xl uppercase tracking-tight text-black mb-2" data-testid="legal-page-title">{title}</h1>
        {lastUpdated && (
          <p className="text-xs text-gray-500 font-display italic uppercase tracking-widest mb-8" data-testid="legal-last-updated">
            Last updated: {lastUpdated}
          </p>
        )}
        <div className="prose prose-sm sm:prose max-w-none legal-content">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default LegalLayout;
