import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { buildImageUrl, STATUS_BADGE, formatDate, collectImagePaths } from "./bucketShared";
import { useSharedFilter } from "./FilterContext";
import StickyFilterInput from "./StickyFilterInput";
import PhotoCarousel from "./PhotoCarousel";

/**
 * Read-only review modal for auto-approved quotes.
 *
 * Shows the AI's price, the item list, the customer photo, and links each
 * quote to its booking (if any) so the operator can spot-check that the
 * AI is auto-approving correctly. No approve/reject controls — these are
 * already approved by definition.
 */

const AutoApprovedQuotesModal = ({
  open,
  quotes,
  loading,
  onClose,
  onRefresh,
  onDismissQuote,
  onDismissAll,
}) => {
  const [filter] = useSharedFilter();
  const [bookedOnly, setBookedOnly] = useState(false);

  const visibleQuotes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (quotes || []).filter((quote) => {
      if (bookedOnly && !quote.has_booking) return false;
      if (!q) return true;
      const haystack = [
        quote.id,
        quote.description,
        quote.ai_explanation,
        quote.booking?.address,
        quote.booking?.phone,
        quote.booking?.email,
        ...(quote.items || []).map((i) => `${i.name} ${i.size}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [quotes, filter, bookedOnly]);

  const totalRevenue = useMemo(
    () => visibleQuotes.filter((q) => q.has_booking).reduce((s, q) => s + (q.total_price || 0), 0),
    [visibleQuotes],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4"
      data-testid="auto-approved-quotes-modal"
    >
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden mx-2 sm:mx-0">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b">
          <div className="min-w-0">
            <CardTitle className="text-lg sm:text-2xl flex items-center gap-2">
              <span>⚡</span> Auto-Approved Quotes
              <Badge className="bg-blue-100 text-blue-800" data-testid="auto-approved-count-badge">
                {(quotes || []).length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1">
              30 most recent AI auto-approved quotes. Older ones auto-roll off — find any past booking via <strong>All Jobs History</strong>.
              Booked revenue in view: <strong>${totalRevenue.toFixed(2)}</strong>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              onClick={onRefresh}
              data-testid="auto-approved-refresh-btn"
              className="text-sm"
            >
              <span className="mr-1">🔄</span>Refresh
            </Button>
            <Button
              onClick={onClose}
              data-testid="auto-approved-close-btn"
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm"
            >
              <span className="mr-1">✕</span>Close
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto max-h-[75vh] p-3 sm:p-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3 sm:mb-4">
            <div className="flex-1">
              <StickyFilterInput
                placeholder="Search by item, address, phone, email…"
                testId="auto-approved-search-input"
              />
            </div>
            <Button
              variant={bookedOnly ? "default" : "outline"}
              onClick={() => setBookedOnly((v) => !v)}
              data-testid="auto-approved-booked-only-toggle"
              className="text-sm whitespace-nowrap"
            >
              {bookedOnly ? "✓ Booked only" : "Booked only"}
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading auto-approved quotes…</div>
          ) : visibleQuotes.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-gray-500">
                {(quotes || []).length === 0
                  ? "No auto-approved quotes yet."
                  : "No quotes match your search."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {visibleQuotes.map((quote) => {
                const imagePaths = collectImagePaths(quote);
                const booking = quote.booking;
                return (
                  <Card
                    key={quote.id}
                    className="border-l-4 border-l-blue-400"
                    data-testid={`auto-approved-card-${quote.id}`}
                  >
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      {/* Header row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-bold text-emerald-600">
                          ${quote.total_price}
                        </span>
                        <Badge variant="outline">Scale {quote.scale_level}</Badge>
                        <Badge className="bg-blue-100 text-blue-800">Auto-approved</Badge>
                        {imagePaths.length > 1 && (
                          <Badge variant="outline" className="text-blue-600">
                            📸 {imagePaths.length} Photos
                          </Badge>
                        )}
                        {booking ? (
                          <Badge className={STATUS_BADGE[booking.status] || "bg-gray-100 text-gray-700"}>
                            {(booking.status || "").replace("_", " ")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">No booking</Badge>
                        )}
                        <span className="ml-auto text-xs text-gray-500">
                          {formatDate(quote.created_at)}
                        </span>
                      </div>

                      {/* Photo + items grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                          <PhotoCarousel
                            paths={imagePaths}
                            alt="Customer items"
                            testId={`auto-approved-photos-${quote.id}`}
                          />
                        </div>
                        <div className="sm:col-span-2 space-y-1 text-xs sm:text-sm">
                          {(quote.items || []).length > 0 ? (
                            <ul className="space-y-0.5">
                              {(quote.items || []).slice(0, 6).map((item, idx) => (
                                <li key={`${item.name}-${idx}`} className="text-gray-700">
                                  • {item.quantity || 1}× <span className="font-medium">{item.name}</span>
                                  {item.size ? <span className="text-gray-500"> ({item.size})</span> : null}
                                </li>
                              ))}
                              {(quote.items || []).length > 6 && (
                                <li className="text-gray-400 italic">
                                  +{(quote.items || []).length - 6} more…
                                </li>
                              )}
                            </ul>
                          ) : (
                            <p className="text-gray-500 italic">No item list on this quote.</p>
                          )}
                          {quote.description && (
                            <p className="text-gray-500 mt-2 break-words">
                              <span className="font-medium">Description:</span> {quote.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Booking details (if any) */}
                      {booking ? (
                        <div className="border-t pt-2 text-xs sm:text-sm text-gray-700 space-y-0.5">
                          <p>📍 {booking.address || "—"}</p>
                          <p>📞 {booking.phone || "—"}{booking.email ? `   ✉️ ${booking.email}` : ""}</p>
                          <p>📅 Pickup: {formatDate(booking.pickup_date)} {booking.pickup_time || ""}</p>
                        </div>
                      ) : (
                        <div className="border-t pt-2 text-xs text-gray-500 italic">
                          Customer got this quote but didn't book.
                        </div>
                      )}

                      {/* Dismiss button */}
                      <div className="pt-2 border-t border-gray-100 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDismissQuote?.(quote.id)}
                          data-testid={`dismiss-quote-${quote.id}`}
                          className="text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 border-gray-200"
                        >
                          <span className="mr-1">🗑️</span>Dismiss
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

export default AutoApprovedQuotesModal;
