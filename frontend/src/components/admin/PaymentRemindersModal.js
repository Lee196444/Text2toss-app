import React, { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { buildImageUrl, STATUS_BADGE, formatDate } from "./bucketShared";
import { useSharedFilter } from "./FilterContext";
import StickyFilterInput from "./StickyFilterInput";

/**
 * Pending Payment Modal — bookings the customer submitted but hasn't paid
 * for yet. Same visual language as the other admin "buckets" — search bar,
 * two-column grid, photo thumbnails, customer details, action buttons.
 */
const PaymentRemindersModal = ({
  open,
  pendingPayments,
  onClose,
  onMarkPaid,
  onReject,
  onRejectAll,
}) => {
  const [filter] = useSharedFilter();

  const totalDue = useMemo(
    () => (pendingPayments || []).reduce((s, b) => s + (b.quote_details?.total_price || 0), 0),
    [pendingPayments],
  );

  const visibleBookings = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pendingPayments || [];
    return (pendingPayments || []).filter((b) => {
      const haystack = [
        b.id,
        b.address,
        b.phone,
        b.email,
        ...(b.quote_details?.items || []).map((i) => `${i.name} ${i.size}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [pendingPayments, filter]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4"
      data-testid="pending-payments-modal"
    >
      <Card className="w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-rose-500 to-rose-600 text-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-2xl flex items-center gap-2 flex-wrap">
                💳 Pending Payments
                <Badge className="bg-white/20 text-white border-0">
                  {(pendingPayments || []).length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-white/85 text-xs sm:text-sm mt-1">
                Customers who booked but haven't paid yet ·
                Total awaiting: <strong>${totalDue.toFixed(2)}</strong>
              </CardDescription>
            </div>
            <div className="flex gap-2 self-end sm:self-auto">
              {(pendingPayments || []).length > 0 && (
                <Button
                  size="sm"
                  onClick={onRejectAll}
                  data-testid="reject-all-payments-btn"
                  className="bg-white/20 hover:bg-white/30 text-white border border-white/30"
                >
                  Reject All
                </Button>
              )}
              <Button
                size="sm"
                onClick={onClose}
                className="bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <span className="mr-1">✕</span>Close
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto max-h-[78vh] p-3 sm:p-4">
          <div className="mb-3 sm:mb-4">
            <StickyFilterInput
              placeholder="Search by item, address, phone, email…"
              testId="pending-payments-search-input"
            />
          </div>

          {visibleBookings.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-gray-500">
                {(pendingPayments || []).length === 0
                  ? "No pending payments — every booking is paid."
                  : "No bookings match your search."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {visibleBookings.map((booking) => {
                const imgUrl = buildImageUrl(booking.image_path);
                const items = booking.quote_details?.items || [];
                return (
                  <Card
                    key={booking.id}
                    className="border-l-4 border-l-rose-400"
                    data-testid={`pending-payment-card-${booking.id}`}
                  >
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-bold text-emerald-600">
                          ${booking.quote_details?.total_price || 0}
                        </span>
                        {booking.quote_details?.scale_level !== undefined && (
                          <Badge variant="outline">Scale {booking.quote_details.scale_level}</Badge>
                        )}
                        <Badge className={STATUS_BADGE.pending_payment}>AWAITING VENMO</Badge>
                        <span className="ml-auto text-xs text-gray-500">
                          {formatDate(booking.pickup_date)}
                          {booking.pickup_time ? ` · ${booking.pickup_time}` : ""}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt="Customer items"
                              className="w-full h-32 object-cover rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => window.open(imgUrl, "_blank")}
                              onError={(e) => { e.target.style.display = "none"; }}
                            />
                          ) : (
                            <div className="w-full h-32 rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                              No photo
                            </div>
                          )}
                        </div>
                        <div className="sm:col-span-2 space-y-1 text-xs sm:text-sm">
                          {items.length > 0 ? (
                            <ul className="space-y-0.5">
                              {items.slice(0, 6).map((item, idx) => (
                                <li key={`${item.name}-${idx}`} className="text-gray-700">
                                  • {item.quantity || 1}× <span className="font-medium">{item.name}</span>
                                  {item.size ? <span className="text-gray-500"> ({item.size})</span> : null}
                                </li>
                              ))}
                              {items.length > 6 && (
                                <li className="text-gray-400 italic">+{items.length - 6} more…</li>
                              )}
                            </ul>
                          ) : (
                            <p className="text-gray-500 italic">No item list available.</p>
                          )}
                        </div>
                      </div>

                      <div className="border-t pt-2 text-xs sm:text-sm text-gray-700 space-y-0.5">
                        <p>📍 {booking.address || "—"}</p>
                        <p>📞 {booking.phone || "—"}{booking.email ? `   ✉️ ${booking.email}` : ""}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                        <Button
                          size="sm"
                          onClick={() => onMarkPaid(booking.id)}
                          data-testid={`mark-paid-btn-${booking.id}`}
                          className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                        >
                          <span className="mr-1">✅</span>Mark as Paid
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReject(booking.id)}
                          data-testid={`reject-payment-btn-${booking.id}`}
                          className="bg-red-50 hover:bg-red-100 text-red-600 border-red-300 text-xs font-medium px-3 py-2 rounded-lg"
                        >
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentRemindersModal;
