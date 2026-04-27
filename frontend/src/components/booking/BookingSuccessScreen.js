import React from "react";
import { Link } from "react-router-dom";

/** Final confirmation screen shown after a pending-approval booking is submitted. */
export default function BookingSuccessScreen({ onClose }) {
  return (
    <div className="w-full max-w-md mt-12 animate-fade-up">
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden text-center">
        <div className="bg-emerald-600 py-10 px-6">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white" data-testid="booking-success-title">Booking Submitted!</h2>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-gray-700 text-base leading-relaxed">
            Your booking has been submitted successfully. Our team will review your quote and contact you within{" "}
            <strong>24 hours</strong>.
          </p>
          <p className="text-sm text-gray-500">
            Payment will be available once your quote is approved. Check your email for updates.
          </p>
          <Link to="/track" className="block">
            <button
              className="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 py-3 rounded-xl text-sm font-semibold hover:bg-emerald-100 transition-colors"
              data-testid="booking-success-track-btn"
            >
              Track My Booking
            </button>
          </Link>
          <button
            onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl text-base font-bold transition-colors"
            data-testid="booking-success-close-btn"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
