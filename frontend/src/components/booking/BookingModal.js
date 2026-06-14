import React, { useState } from "react";
import axios from "axios";
import QRCode from "qrcode";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import AvailabilityCalendar from "../AvailabilityCalendar";
import { toast } from "../../lib/toast";

import BookingSuccessScreen from "./BookingSuccessScreen";
import SchedulePicker from "./SchedulePicker";
import ContactFields from "./ContactFields";
import RequirementsSection from "./RequirementsSection";
import PriorityPicker, { PRIORITY_TIERS } from "../customer/PriorityPicker";
import usePriorityConfig from "../../hooks/usePriorityConfig";
import { logger } from "../../utils/logger";


const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helpers — kept module-local so we don't pollute the booking namespace
const isDateAllowed = (dateString) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 4; // Mon-Thu
};

const buildMissingFields = (bookingData) => {
  const errors = {};
  const missing = [];
  const required = [
    ["pickup_date", "Pickup Date", (v) => !v],
    ["pickup_time", "Pickup Time", (v) => !v],
    ["address", "Service Address", (v) => !v || v.trim() === ""],
    ["phone", "Phone Number", (v) => !v || v.trim() === ""],
    ["email", "Email Address", (v) => !v || v.trim() === ""],
    ["curbside_confirmed", "Curbside Confirmation", (v) => !v],
  ];
  required.forEach(([key, label, isMissing]) => {
    if (isMissing(bookingData[key])) {
      errors[key] = true;
      missing.push(label);
    }
  });
  return { errors, missing };
};

const BookingModal = ({ quote, onClose, onSuccess, onVenmoPayment, priorityTier, onPriorityChange }) => {
  const [bookingData, setBookingData] = useState({
    pickup_date: "",
    pickup_time: "",
    address: "",
    phone: "",
    email: "",
    special_instructions: "",
    curbside_confirmed: false,
    email_notifications: true,
  });
  const [bookingSubmitted, setBookingSubmitted] = useState(false);
  const [bookedTimeSlots, setBookedTimeSlots] = useState([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [legalConsent, setLegalConsent] = useState(false);
  const [payInPerson, setPayInPerson] = useState(false);

  // Dynamic priority fees (admin-configurable). Falls back to PRIORITY_TIERS values.
  const { fees: priorityFees } = usePriorityConfig();
  const priorityFeeAmount = priorityTier
    ? (priorityFees?.[priorityTier] ?? PRIORITY_TIERS.find(t => t.id === priorityTier)?.fee ?? 0)
    : 0;
  const totalWithPriority = (quote.total_price || 0) + priorityFeeAmount;

  const checkAvailableTimeSlots = async (selectedDate) => {
    if (!selectedDate || !isDateAllowed(selectedDate)) {
      setBookedTimeSlots([]);
      return;
    }
    setCheckingAvailability(true);
    try {
      const res = await axios.get(`${API}/availability/${selectedDate}`);
      if (res.data.blocked_day) {
        toast.error(res.data.reason);
        setBookedTimeSlots([]);
        return;
      }
      setBookedTimeSlots(res.data.booked_slots || []);
      if (res.data.available_count === 0) {
        toast.warning("All time slots are booked for this date. Please choose another day.");
      }
    } catch (err) {
      logger.error("Failed to check availability:", err);
      setBookedTimeSlots([]);
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleDateChange = (selectedDate) => {
    if (!isDateAllowed(selectedDate)) {
      toast.error("Pickup is not available on weekends or Fridays. Please select Monday-Thursday.");
      return;
    }
    setBookingData({ ...bookingData, pickup_date: selectedDate, pickup_time: "" });
    checkAvailableTimeSlots(selectedDate);
    setShowCalendar(false);
  };

  const handleVenmoBooking = async () => {
    setFieldErrors({});
    const { errors, missing } = buildMissingFields(bookingData);

    if (missing.length > 0) {
      setFieldErrors(errors);
      toast.error(`Please complete the following required fields: ${missing.join(", ")}`);
      setTimeout(() => {
        const firstError = document.querySelector(".border-red-500");
        if (firstError) {
          firstError.scrollIntoView({ behavior: "smooth", block: "center" });
          firstError.focus();
        }
      }, 100);
      return;
    }

    if (!isDateAllowed(bookingData.pickup_date)) {
      toast.error("Selected date is not available for pickup");
      return;
    }
    if (bookedTimeSlots.includes(bookingData.pickup_time)) {
      toast.error("Selected time slot is already booked. Please choose another time.");
      return;
    }
    if (!legalConsent) {
      toast.error("Please agree to the Terms of Service and Refund Policy to continue.");
      return;
    }

    try {
      const res = await axios.post(`${API}/bookings`, {
        quote_id: quote.id,
        ...bookingData,
        priority_tier: priorityTier || null,
        consent_accepted: legalConsent,
        pay_in_person: payInPerson,
        payment_method: payInPerson ? "cash" : "venmo",
      });
      const bookingId = res.data.id;

      if (quote.requires_approval) {
        setBookingSubmitted(true);
        setTimeout(() => {
          setBookingSubmitted(false);
          onSuccess();
        }, 7000);
        return;
      }

      // Pay-in-person customers skip the Venmo step — the job is already
      // on the admin calendar as "scheduled".
      if (payInPerson) {
        toast.success("✅ Booking confirmed! We'll see you on pickup day — please have cash or card ready.", {
          duration: 5000,
          style: { background: "#10b981", color: "#ffffff", fontSize: "16px", fontWeight: "600", padding: "16px" },
        });
        setBookingSubmitted(true);
        setTimeout(() => {
          setBookingSubmitted(false);
          onSuccess();
        }, 3500);
        return;
      }

      toast.success("✅ Booking Successfully Submitted! Please complete payment to confirm.", {
        duration: 4000,
        style: { background: "#10b981", color: "#ffffff", fontSize: "16px", fontWeight: "600", padding: "16px" },
      });

      const venmoUrl = `https://venmo.com/code?user_id=Text2toss&amount=${totalWithPriority}&note=Text2toss%20Booking%20${bookingId.substring(0, 8)}`;
      const qrCodeDataUrl = await QRCode.toDataURL(venmoUrl, {
        width: 256,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      onVenmoPayment(bookingId, qrCodeDataUrl);
    } catch (err) {
      toast.error("Failed to create booking");
    }
  };

  if (bookingSubmitted) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-stretch sm:items-start justify-center sm:p-4 sm:pt-8 overflow-y-auto">
        <BookingSuccessScreen onClose={() => { setBookingSubmitted(false); onSuccess(); }} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-stretch sm:items-start justify-center sm:p-4 sm:pt-8">
      <Card className="w-full max-w-2xl shadow-2xl border-0 sm:mb-8 rounded-none sm:rounded-lg h-screen sm:h-auto sm:max-h-[calc(100vh-4rem)] flex flex-col">
        {/* Compact sticky header — title + price + step indicator on 2 rows */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-t-lg flex-shrink-0">
          <div className="px-4 py-2 flex items-center justify-between gap-3 border-b border-white/20">
            {/* Compact step pills */}
            <div className="flex items-center gap-1.5 text-white">
              <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[10px] font-bold">✓</div>
              <div className="w-3 h-0.5 bg-white/30"></div>
              <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[10px] font-bold">✓</div>
              <div className="w-3 h-0.5 bg-white/30"></div>
              <div className="w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center text-[10px] font-bold ring-2 ring-white/40">3</div>
              <span className="text-xs text-white font-semibold ml-1">Book & Pay</span>
            </div>
            <button
              onClick={onClose}
              data-testid="modal-close-x"
              className="text-white/80 hover:text-white text-xl leading-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="px-4 py-2.5 flex items-center justify-between gap-3 text-white">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-white/80 leading-none mb-0.5">Complete Your Booking</p>
              {priorityTier && (
                <p className="text-[10px] text-white/80 truncate">
                  +${priorityFeeAmount} priority surcharge
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-2xl font-black leading-none">${totalWithPriority}</span>
              <Badge className="bg-white/20 text-white border-0 text-[10px] px-1.5 py-0.5">💳 Venmo</Badge>
            </div>
          </div>
        </div>

        {/* Body — takes all remaining vertical space */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <CardContent className="p-4 sm:p-6 space-y-6 sm:space-y-7">
            {quote.requires_approval && (
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-lg p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">⏳</span>
                  <div>
                    <p className="text-base font-bold text-yellow-900 mb-2">Quote Pending Admin Approval</p>
                    <p className="text-sm text-yellow-800 mb-2">
                      Please fill out your booking information below. Your booking will be held as <strong>pending</strong> until your quote is approved.
                    </p>
                    <p className="text-xs text-yellow-700">
                      ✓ No payment will be processed until quote is approved<br />
                      ✓ We&apos;ll contact you within 24 hours with approval<br />
                      ✓ You can then complete payment to confirm your booking
                    </p>
                  </div>
                </div>
              </div>
            )}

            <SchedulePicker
              bookingData={bookingData}
              setBookingData={setBookingData}
              bookedTimeSlots={bookedTimeSlots}
              checkingAvailability={checkingAvailability}
              onOpenCalendar={() => setShowCalendar(true)}
            />

            <PriorityPicker
              value={priorityTier}
              onChange={onPriorityChange}
              pickupDate={bookingData.pickup_date}
            />

            <ContactFields
              bookingData={bookingData}
              setBookingData={setBookingData}
              fieldErrors={fieldErrors}
              setFieldErrors={setFieldErrors}
            />

            <RequirementsSection
              bookingData={bookingData}
              setBookingData={setBookingData}
              fieldErrors={fieldErrors}
              setFieldErrors={setFieldErrors}
            />

            <div className={`rounded-xl p-4 border-2 transition-colors ${
              payInPerson
                ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-400"
                : "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300"
            }`}>
              <div className="text-center mb-3">
                <p className={`text-base font-bold mb-1 ${payInPerson ? "text-emerald-900" : "text-blue-900"}`}>
                  {payInPerson ? "💵 Pay In Person on Pickup Day" : "💰 Payment via Venmo"}
                </p>
                <p className={`text-sm ${payInPerson ? "text-emerald-800" : "text-blue-800"}`}>
                  {payInPerson
                    ? <>Have <strong>cash or card</strong> ready when the crew arrives. Your booking is locked in immediately.</>
                    : <>After booking, you&apos;ll get payment instructions for <strong>@Text2toss</strong></>}
                </p>
              </div>
              <label className="flex items-center justify-center gap-2 cursor-pointer bg-white/70 hover:bg-white rounded-lg py-2 px-3 border border-current/20">
                <input
                  type="checkbox"
                  checked={payInPerson}
                  onChange={(e) => setPayInPerson(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-gray-300 text-emerald-500 focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                  data-testid="pay-in-person-checkbox"
                />
                <span className="text-sm font-semibold text-gray-800">
                  I&apos;ll pay in person (cash or card on pickup day)
                </span>
              </label>
            </div>
          </CardContent>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 rounded-b-lg">
          {/* Legal consent — required before submission */}
          <label className="flex items-start gap-3 px-4 pt-3 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={legalConsent}
              onChange={(e) => setLegalConsent(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 text-lime-500 focus:ring-2 focus:ring-lime-400 cursor-pointer flex-shrink-0"
              data-testid="legal-consent-checkbox"
            />
            <span className="text-xs text-gray-700 leading-snug">
              I agree to the{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-lime-600 hover:text-lime-700 font-semibold underline"
                data-testid="consent-terms-link"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="/refund-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-lime-600 hover:text-lime-700 font-semibold underline"
                data-testid="consent-refund-link"
              >
                Refund Policy
              </a>
              . I understand that the price shown is an AI-generated estimate and may be adjusted at pickup based on actual volume.
            </span>
          </label>

          <div className="p-4 pt-2 pb-20 sm:pb-4 flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="cancel-booking-btn"
              className="flex-1 h-12 border-2 text-base font-semibold"
            >
              Cancel
            </Button>
            {quote.requires_approval ? (
              <Button
                onClick={handleVenmoBooking}
                disabled={!legalConsent}
                data-testid="venmo-booking-btn"
                className="flex-1 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white text-base font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📝 Submit Booking (Pending Approval)
              </Button>
            ) : (
              <Button
                onClick={handleVenmoBooking}
                disabled={!legalConsent}
                data-testid="venmo-booking-btn"
                className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-base font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {payInPerson ? "💵 Confirm Booking (Pay on Pickup)" : "📱 Confirm & Pay via Venmo"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {showCalendar && (
        <AvailabilityCalendar
          selectedDate={bookingData.pickup_date}
          onDateSelect={handleDateChange}
          onClose={() => setShowCalendar(false)}
        />
      )}
    </div>
  );
};

export default BookingModal;
