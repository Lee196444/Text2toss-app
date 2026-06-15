import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { toast } from "../lib/toast";
import BookingJourneyProgress from "../components/customer/BookingJourneyProgress";
import SiteFooter from "../components/SiteFooter";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

/**
 * Public payment page reachable from the "Complete Payment Now" email button.
 *
 * Flow:
 *   GET /api/bookings/:bookingId/payment-info  (no auth — uuid is unguessable)
 *   → renders Venmo QR + amount due + booking details
 *   → "Open Venmo App" deep-link + manual instructions
 *   → if already paid / cancelled, show friendly status instead of QR
 */
export default function PayBookingPage() {
  const { bookingId } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stripeStatus, setStripeStatus] = useState(null); // null | "polling" | "paid" | "cancelled" | "failed"

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API}/bookings/${bookingId}/payment-info`);
      setInfo(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError("We couldn't find this booking. The link may be expired or incorrect.");
      } else {
        setError("Unable to load booking info. Please try again or use Track Booking.");
      }
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  // === Stripe return-from-checkout flow ====================================
  // After Stripe redirects the customer back, the URL contains either
  // `?session_id=cs_xxx` (success path) or `?stripe=cancelled` (cancel path).
  // Poll the backend until the status flips to "paid", then refresh booking info.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe") === "cancelled") {
      setStripeStatus("cancelled");
      toast.error("Card payment cancelled. You can try again below or use Venmo.");
      // Clean URL so refreshing the page doesn't re-show the message
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    const sessionId = params.get("session_id");
    if (!sessionId) return;

    setStripeStatus("polling");
    let attempts = 0;
    const MAX_ATTEMPTS = 8;          // ~40s total
    const INTERVAL_MS = 5000;

    const poll = async () => {
      attempts += 1;
      try {
        const { data } = await axios.get(`${API}/payments/checkout-status/${sessionId}`);
        if (data.payment_status === "paid") {
          setStripeStatus("paid");
          toast.success("✅ Payment received — your pickup is locked in!");
          await loadInfo();
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
        if (data.status === "expired") {
          setStripeStatus("failed");
          toast.error("That payment session expired. Please start again.");
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
        if (attempts >= MAX_ATTEMPTS) {
          setStripeStatus("polling-timeout");
          return;
        }
        setTimeout(poll, INTERVAL_MS);
      } catch {
        if (attempts >= MAX_ATTEMPTS) {
          setStripeStatus("polling-timeout");
          return;
        }
        setTimeout(poll, INTERVAL_MS);
      }
    };
    poll();
  }, [loadInfo]);

  const startCardPayment = async () => {
    try {
      const { data } = await axios.post(
        `${API}/bookings/${bookingId}/stripe-checkout`,
        { booking_id: bookingId, origin_url: window.location.origin }
      );
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Couldn't start card payment. Please try Venmo.");
      }
    } catch {
      toast.error("Couldn't start card payment. Please try Venmo.");
    }
  };

  const shortId = bookingId?.substring(0, 8) || "";

  const openVenmoApp = () => {
    if (!info) return;
    const venmoDeep = `venmo://paycharge?txn=pay&recipients=Text2toss&amount=${info.amount_due}&note=Text2toss%20Booking%20${shortId}`;
    window.location.href = venmoDeep;
    // Web fallback in case the app isn't installed
    setTimeout(() => {
      window.open(
        `https://venmo.com/?txn=pay&recipients=Text2toss&amount=${info.amount_due}&note=Booking%20${shortId}`,
        "_blank",
      );
    }, 1000);
  };

  const copyBookingId = () => {
    const text = shortId;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast.success("Booking ID copied!"),
        () => toast.error(`Copy failed. ID: ${text}`),
      );
    } else {
      toast.info(`Booking ID: ${text}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="pay-booking-page">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex justify-between items-center h-14">
            <Link to="/" className="flex items-center gap-2" data-testid="pay-page-home-link">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T2T</span>
              </div>
              <span className="text-lg font-extrabold tracking-tight text-gray-900">Text2toss</span>
            </Link>
            <Link to="/track">
              <Button variant="outline" size="sm" className="rounded-full border-gray-200 text-sm" data-testid="pay-page-track-link">
                Track Booking
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {loading && (
          <Card className="border border-gray-100">
            <CardContent className="p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-500">Loading your booking...</p>
            </CardContent>
          </Card>
        )}

        {!loading && error && (
          <Card className="border border-red-100">
            <CardContent className="p-8 text-center">
              <div className="text-5xl mb-3">😕</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Booking not found</h2>
              <p className="text-gray-600 mb-6" data-testid="pay-page-error">{error}</p>
              <Link to="/track">
                <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl">
                  Look up by email instead
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {!loading && !error && info && (
          <>
            {/* Journey progress (shown for all states except 404) */}
            <div className="mb-4">
              <BookingJourneyProgress
                status={info.status}
                paymentStatus={info.payment_status}
              />
            </div>

            {/* Stripe return banner */}
            {stripeStatus === "polling" && info.payment_status !== "paid" && (
              <Card className="border border-lime-400 bg-black mb-4" data-testid="stripe-polling-banner">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-lime-400 border-t-transparent flex-shrink-0"></div>
                  <p className="text-sm text-lime-400 font-display italic uppercase tracking-wide">
                    Confirming card payment with Stripe...
                  </p>
                </CardContent>
              </Card>
            )}
            {stripeStatus === "polling-timeout" && info.payment_status !== "paid" && (
              <Card className="border border-amber-400 bg-amber-50 mb-4">
                <CardContent className="p-4">
                  <p className="text-sm text-amber-900">
                    Stripe is taking longer than usual — refresh in a minute, or call us if you see this for over 5 min.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Already paid */}
            {info.payment_status === "paid" && (
              <Card className="border border-emerald-200 bg-emerald-50">
                <CardContent className="p-8 text-center">
                  <div className="text-5xl mb-3">✅</div>
                  <h2 className="text-2xl font-bold text-emerald-800 mb-2">Payment received</h2>
                  <p className="text-emerald-700" data-testid="pay-page-paid-msg">
                    Thanks {info.customer_name}! Your booking #{shortId} is confirmed.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Cancelled */}
            {info.status === "cancelled" && (
              <Card className="border border-red-200 bg-red-50">
                <CardContent className="p-8 text-center">
                  <div className="text-5xl mb-3">⚠️</div>
                  <h2 className="text-2xl font-bold text-red-800 mb-2">Booking cancelled</h2>
                  <p className="text-red-700">
                    This booking has been cancelled. Please reach out at 928-853-9619 if this is unexpected.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Active payment */}
            {info.payment_status !== "paid" && info.status !== "cancelled" && (
              <Card className="border-0 shadow-xl overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 text-center text-white">
                  <div className="text-5xl mb-2">💳</div>
                  <h1 className="text-2xl font-bold mb-1">Complete your payment</h1>
                  <p className="text-emerald-50 text-sm">Booking #{shortId}</p>
                </div>

                <CardContent className="p-6 space-y-5">
                  {/* Summary */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2 text-emerald-900">
                    <div className="flex justify-between items-baseline">
                      <span className="font-medium">Amount due</span>
                      <span className="font-bold text-3xl" data-testid="pay-page-amount">
                        ${info.amount_due?.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Customer</span>
                      <span className="font-semibold">{info.customer_name}</span>
                    </div>
                    {info.address && (
                      <div className="flex justify-between text-sm">
                        <span>Pickup address</span>
                        <span className="font-semibold text-right max-w-[60%]">{info.address}</span>
                      </div>
                    )}
                    {info.pickup_date && (
                      <div className="flex justify-between text-sm">
                        <span>Pickup</span>
                        <span className="font-semibold">
                          {(() => {
                            try {
                              const d = new Date(info.pickup_date);
                              const pretty = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                              return info.pickup_time ? `${pretty} · ${info.pickup_time}` : pretty;
                            } catch (_) {
                              return info.pickup_date;
                            }
                          })()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* QR */}
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 mb-3">📱 Scan with your Venmo app</p>
                    <div className="inline-block p-3 bg-white border-4 border-gray-200 rounded-2xl shadow-sm">
                      <img
                        src={info.venmo_qr_url}
                        alt="Text2toss Venmo QR"
                        className="w-44 h-44 sm:w-48 sm:h-48"
                        data-testid="pay-page-venmo-qr"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Opens directly to payment</p>
                  </div>

                  {/* OR */}
                  <div className="flex items-center gap-3 text-gray-400">
                    <hr className="flex-1 border-gray-200" />
                    <span className="text-xs font-semibold">OR</span>
                    <hr className="flex-1 border-gray-200" />
                  </div>

                  {/* Manual */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 space-y-2">
                    <p className="font-bold">Pay manually:</p>
                    <p>
                      1. Send <span className="font-bold">${info.amount_due?.toFixed(2)}</span> to{" "}
                      <span className="font-bold">@Text2toss</span>
                    </p>
                    <p className="flex items-center gap-2 flex-wrap">
                      2. Include this booking ID in the note:
                      <span className="font-mono font-bold bg-blue-200 px-2 py-0.5 rounded">{shortId}</span>
                      <button
                        onClick={copyBookingId}
                        className="text-blue-700 hover:text-blue-900 underline font-semibold text-xs"
                        data-testid="pay-page-copy-id-btn"
                      >
                        Copy
                      </button>
                    </p>
                    <p>3. We&apos;ll confirm by text once payment lands.</p>
                  </div>

                  {/* Actions — Card first, Venmo second */}
                  <Button
                    onClick={startCardPayment}
                    className="w-full bg-lime-400 hover:bg-lime-300 text-black py-4 rounded-xl text-base font-display italic uppercase tracking-wider shadow-[0_4px_14px_-2px_rgba(190,242,100,0.5)]"
                    data-testid="pay-page-card-btn"
                  >
                    💳 Pay with Card · ${info.amount_due}
                  </Button>
                  <Button
                    onClick={openVenmoApp}
                    className="w-full bg-black hover:bg-gray-900 text-lime-400 border-2 border-lime-400 py-4 rounded-xl text-base font-display italic uppercase tracking-wider"
                    data-testid="pay-page-open-venmo-btn"
                  >
                    📱 Pay with Venmo · ${info.amount_due}
                  </Button>

                  {/* Disclaimer */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                    <span className="font-bold">Note:</span> Pickup is confirmed once payment is received. Questions? Call 928-853-9619.
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
