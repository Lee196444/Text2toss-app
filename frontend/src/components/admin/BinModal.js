import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  buildImageUrl,
  STATUS_BADGE,
  STATUS_BORDER,
  BIN_GRADIENT,
  formatDate,
  formatStatus,
} from "./bucketShared";

const BIN_TITLE = {
  new: "🆕 New Jobs",
  upcoming: "📅 Upcoming Jobs",
  inProgress: "🚛 Jobs In Progress",
  completed: "✅ Completed Jobs",
  details: "📋 Job Details",
};

const BIN_SUBTITLE = {
  new: "Just-scheduled jobs that haven't started yet.",
  upcoming: "Future scheduled pickups.",
  inProgress: "Currently in progress — out for pickup.",
  completed: "Finished jobs.",
};

/**
 * Action buttons rendered per booking based on its current status. Behaviour
 * is unchanged from the previous version — only layout is refreshed.
 */
const ActionButtons = ({
  booking,
  startRoute,
  notifyCustomer,
  updateBookingStatus,
  handleCompleteWithPhoto,
  handleViewCustomerPhoto,
  testSmsPhoto,
}) => (
  <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
    <Button
      size="sm"
      onClick={() => startRoute(booking)}
      data-testid={`route-btn-${booking.id}`}
      className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
    >
      <span className="mr-1">🗺️</span>Route
    </Button>

    {booking.image_path && (
      <Button
        size="sm"
        onClick={() => handleViewCustomerPhoto(booking)}
        data-testid={`view-photo-btn-${booking.id}`}
        className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
      >
        <span className="mr-1">📷</span>View Photo
      </Button>
    )}

    {booking.status === "scheduled" && (
      <>
        <Button
          size="sm"
          onClick={() => updateBookingStatus(booking.id, "in_progress")}
          data-testid={`start-job-btn-${booking.id}`}
          className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          <span className="mr-1">▶️</span>Start Job
        </Button>
        <Button
          size="sm"
          onClick={() => updateBookingStatus(booking.id, "completed")}
          data-testid={`complete-job-btn-${booking.id}`}
          className="bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          <span className="mr-1">✅</span>Complete
        </Button>
        <Button
          size="sm"
          onClick={() => handleCompleteWithPhoto(booking)}
          data-testid={`complete-photo-btn-${booking.id}`}
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          <span className="mr-1">📸</span>+ Photo
        </Button>
      </>
    )}

    {booking.status === "in_progress" && (
      <>
        <Button
          size="sm"
          onClick={() => updateBookingStatus(booking.id, "completed")}
          className="bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          <span className="mr-1">✅</span>Complete
        </Button>
        <Button
          size="sm"
          onClick={() => handleCompleteWithPhoto(booking)}
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          <span className="mr-1">📸</span>+ Photo
        </Button>
      </>
    )}

    {booking.status === "completed" && (
      <>
        {!booking.completion_photo_path && (
          <Button
            size="sm"
            onClick={() => handleCompleteWithPhoto(booking)}
            className="bg-white border-2 border-green-400 text-green-700 hover:bg-green-50 text-xs font-medium px-3 py-2 rounded-lg shadow-sm transition-all duration-200"
          >
            <span className="mr-1">📸</span>Add Photo
          </Button>
        )}
        {booking.completion_photo_path && (
          <>
            <Button
              size="sm"
              onClick={() => notifyCustomer(booking.id)}
              className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
            >
              <span className="mr-1">📱</span>SMS Customer
            </Button>
            <Button
              size="sm"
              onClick={() => testSmsPhoto(booking.id)}
              className="bg-white border-2 border-blue-400 text-blue-700 hover:bg-blue-50 text-xs font-medium px-3 py-2 rounded-lg shadow-sm transition-all duration-200"
            >
              <span className="mr-1">🧪</span>Test
            </Button>
          </>
        )}
      </>
    )}
  </div>
);

const BinModal = ({
  open,
  selectedBin,
  binBookings,
  formatPrice,
  formatTime,
  closeBin,
  startRoute,
  notifyCustomer,
  updateBookingStatus,
  handleCompleteWithPhoto,
  handleViewCustomerPhoto,
  testSmsPhoto,
}) => {
  const [filter, setFilter] = useState("");

  const sortedBookings = useMemo(
    () => [...binBookings].sort((a, b) => new Date(b.pickup_date) - new Date(a.pickup_date)),
    [binBookings],
  );

  const totalRevenue = useMemo(
    () => binBookings.reduce((sum, b) => sum + (b.quote_details?.total_price || 0), 0),
    [binBookings],
  );

  const visibleBookings = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sortedBookings;
    return sortedBookings.filter((b) => {
      const haystack = [
        b.id,
        b.address,
        b.phone,
        b.email,
        b.special_instructions,
        ...(b.quote_details?.items || []).map((i) => `${i.name} ${i.size}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sortedBookings, filter]);

  if (!open) return null;

  const gradient = BIN_GRADIENT[selectedBin] || "from-gray-500 to-gray-600";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-2 sm:p-4">
      <Card className="w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        <CardHeader className={`bg-gradient-to-r ${gradient} text-white px-4 py-3 sm:px-6 sm:py-4`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-2xl flex items-center gap-2 flex-wrap">
                {BIN_TITLE[selectedBin] || "📋 Jobs"}
                <Badge className="bg-white/20 text-white border-0">{binBookings.length}</Badge>
              </CardTitle>
              <CardDescription className="text-white/85 text-xs sm:text-sm mt-1">
                {BIN_SUBTITLE[selectedBin] || ""} · Total revenue: <strong>{formatPrice(totalRevenue)}</strong>
              </CardDescription>
            </div>
            <Button
              onClick={closeBin}
              data-testid="bin-modal-close-btn"
              className="bg-white/20 hover:bg-white/30 text-white border-0 self-end sm:self-auto"
              size="sm"
            >
              <span className="mr-1">✕</span>Close
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto max-h-[78vh] p-3 sm:p-4">
          {/* Search */}
          <div className="mb-3 sm:mb-4">
            <Input
              type="text"
              placeholder="Search by item, address, phone, email…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              data-testid="bin-search-input"
              className="w-full"
            />
          </div>

          {visibleBookings.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-gray-500">
                {binBookings.length === 0 ? "No jobs in this bucket yet." : "No jobs match your search."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {visibleBookings.map((booking) => {
                const imgUrl = buildImageUrl(booking.image_path);
                const completionUrl = buildImageUrl(booking.completion_photo_path);
                const items = booking.quote_details?.items || [];

                return (
                  <Card
                    key={booking.id}
                    className={`border-l-4 ${STATUS_BORDER[booking.status] || "border-l-gray-300"}`}
                    data-testid={`bin-card-${booking.id}`}
                  >
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      {/* Header row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-bold text-emerald-600">
                          ${booking.quote_details?.total_price || 0}
                        </span>
                        {booking.quote_details?.scale_level !== undefined && (
                          <Badge variant="outline">Scale {booking.quote_details.scale_level}</Badge>
                        )}
                        <Badge className={STATUS_BADGE[booking.status] || "bg-gray-100 text-gray-700"}>
                          {formatStatus(booking.status)}
                        </Badge>
                        {booking.image_path && (
                          <Badge variant="outline" className="text-blue-600">📸 Photo</Badge>
                        )}
                        <span className="ml-auto text-xs text-gray-500">
                          {formatDate(booking.pickup_date)}
                          {booking.pickup_time ? ` · ${formatTime(booking.pickup_time)}` : ""}
                        </span>
                      </div>

                      {/* Photo + items grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1 space-y-2">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                              alt="Customer items"
                              className="w-full h-32 object-cover rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => window.open(imgUrl, "_blank")}
                              onError={(e) => { e.target.style.display = "none"; }}
                              data-testid={`bin-photo-${booking.id}`}
                            />
                          ) : (
                            <div className="w-full h-32 rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                              No photo
                            </div>
                          )}
                          {completionUrl && (
                            <div>
                              <p className="text-[10px] uppercase font-semibold text-green-700 mb-1">Completion</p>
                              <img
                                src={completionUrl}
                                alt="Completed job"
                                className="w-full h-20 object-cover rounded border cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(completionUrl, "_blank")}
                                onError={(e) => { e.target.style.display = "none"; }}
                              />
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
                          {booking.special_instructions && (
                            <p className="text-gray-500 mt-2 break-words">
                              <span className="font-medium">Notes:</span> {booking.special_instructions}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Customer details */}
                      <div className="border-t pt-2 text-xs sm:text-sm text-gray-700 space-y-0.5">
                        <p>📍 {booking.address || "—"}</p>
                        <p>📞 {booking.phone || "—"}{booking.email ? `   ✉️ ${booking.email}` : ""}</p>
                      </div>

                      {/* Actions */}
                      <ActionButtons
                        booking={booking}
                        startRoute={startRoute}
                        notifyCustomer={notifyCustomer}
                        updateBookingStatus={updateBookingStatus}
                        handleCompleteWithPhoto={handleCompleteWithPhoto}
                        handleViewCustomerPhoto={handleViewCustomerPhoto}
                        testSmsPhoto={testSmsPhoto}
                      />
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

export default BinModal;
