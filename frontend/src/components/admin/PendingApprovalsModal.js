import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { buildImageUrl, formatDate, collectImagePaths } from "./bucketShared";
import { useSharedFilter } from "./FilterContext";
import StickyFilterInput from "./StickyFilterInput";
import PhotoCarousel from "./PhotoCarousel";

/**
 * Pending Quote Approval modal — matches the new admin "bucket" visual
 * language. Preserves inline price-adjust + admin-notes + approve/reject
 * controls; only the layout/styling has changed.
 */
const PendingApprovalsModal = ({
  open,
  pendingQuotes,
  approvalStats,
  failedQuoteImages,
  onMarkImageFailed,
  onApprove,
  onReject,
  onClose,
}) => {
  const [filter] = useSharedFilter();
  const [draftPrices, setDraftPrices] = useState({});
  const [draftNotes, setDraftNotes] = useState({});

  const visibleQuotes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pendingQuotes || [];
    return (pendingQuotes || []).filter((quote) => {
      const haystack = [
        quote.id,
        quote.description,
        quote.ai_explanation,
        ...(quote.items || []).map((i) => `${i.name} ${i.size}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [pendingQuotes, filter]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4"
      data-testid="quote-approval-modal"
    >
      <Card className="w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-2xl flex items-center gap-2 flex-wrap">
                📋 Quote Approval
                <Badge className="bg-white/20 text-white border-0">
                  {(pendingQuotes || []).length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-white/85 text-xs sm:text-sm mt-1">
                Review high-value quotes (Scale 9–20) before they reach payment.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={onClose}
              data-testid="approval-close-btn"
              className="bg-white/20 hover:bg-white/30 text-white border-0 self-end sm:self-auto"
            >
              <span className="mr-1">✕</span>Close
            </Button>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto max-h-[78vh] p-3 sm:p-4">
          <div className="mb-3 sm:mb-4">
            <StickyFilterInput
              placeholder="Search items / description / quote ID…"
              testId="approval-search-input"
            />
          </div>

          {visibleQuotes.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-gray-500">
                {(pendingQuotes || []).length === 0
                  ? "No quotes pending approval."
                  : "No quotes match your search."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {visibleQuotes.map((quote) => {
                const imagePaths = collectImagePaths(quote);
                const primaryUrl = buildImageUrl(imagePaths[0]);
                const imageFailed = failedQuoteImages?.has?.(quote.id);
                return (
                  <Card
                    key={quote.id}
                    className="border-l-4 border-l-orange-400"
                    data-testid={`pending-approval-card-${quote.id}`}
                  >
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-bold text-emerald-600">
                          ${quote.total_price}
                        </span>
                        <Badge variant="outline">Scale {quote.scale_level}</Badge>
                        <Badge className="bg-orange-100 text-orange-800">Pending Review</Badge>
                        {imagePaths.length > 1 && (
                          <Badge variant="outline" className="text-blue-600">
                            📸 {imagePaths.length} Photos
                          </Badge>
                        )}
                        <span className="ml-auto text-xs text-gray-500">{formatDate(quote.created_at)}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                          {imagePaths.length === 0 ? (
                            <div className="w-full h-32 rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                              No photo
                            </div>
                          ) : imageFailed ? (
                            <div className="w-full h-32 rounded-lg border bg-yellow-50 border-yellow-300 flex flex-col items-center justify-center text-center px-2">
                              <p className="text-xs font-semibold text-yellow-800">Photo unavailable</p>
                              <p className="text-[10px] text-yellow-700 mt-1">Only the latest 30 photos are kept.</p>
                            </div>
                          ) : (
                            <PhotoCarousel
                              paths={imagePaths}
                              alt="Customer items"
                              testId={`pending-approval-photos-${quote.id}`}
                            />
                          )}
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
                                <li className="text-gray-400 italic">+{(quote.items || []).length - 6} more…</li>
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
                          {quote.ai_explanation && (
                            <p className="text-gray-500 mt-1 break-words">
                              <span className="font-medium">AI:</span> {quote.ai_explanation}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Admin controls */}
                      <div className="border-t pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs font-medium">Adjust Price (optional)</Label>
                          <Input
                            type="number"
                            placeholder={String(quote.total_price)}
                            value={draftPrices[quote.id] ?? ""}
                            onChange={(e) =>
                              setDraftPrices((prev) => ({ ...prev, [quote.id]: e.target.value }))
                            }
                            step="0.01"
                            className="mt-1"
                            data-testid={`adjust-price-${quote.id}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-medium">Admin Notes</Label>
                          <Input
                            placeholder="Optional notes for customer"
                            value={draftNotes[quote.id] ?? ""}
                            onChange={(e) =>
                              setDraftNotes((prev) => ({ ...prev, [quote.id]: e.target.value }))
                            }
                            className="mt-1"
                            data-testid={`admin-notes-${quote.id}`}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                        {imagePaths.length > 0 && !imageFailed && primaryUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(primaryUrl, "_blank")}
                            data-testid="view-full-photo-btn"
                            className="border-blue-400 text-blue-700 hover:bg-blue-50 text-xs font-medium px-3 py-2 rounded-lg"
                          >
                            <span className="mr-1">🔍</span>View Full{imagePaths.length > 1 ? " (1st)" : ""}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => {
                            const adjusted = draftPrices[quote.id];
                            const notes = draftNotes[quote.id] || "";
                            onApprove(
                              quote.id,
                              notes,
                              adjusted ? parseFloat(adjusted) : null,
                            );
                          }}
                          data-testid={`approve-btn-${quote.id}`}
                          className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-xs font-medium px-3 py-2 rounded-lg flex-1 min-w-[120px]"
                        >
                          <span className="mr-1">✅</span>Approve
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            const notes = draftNotes[quote.id] || "Quote rejected by admin";
                            onReject(quote.id, notes);
                          }}
                          data-testid={`reject-btn-${quote.id}`}
                          className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs font-medium px-3 py-2 rounded-lg flex-1 min-w-[120px]"
                        >
                          <span className="mr-1">❌</span>Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Stats footer */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 pt-4 border-t">
            <div className="bg-orange-50 p-2 sm:p-3 rounded-lg text-center">
              <div className="text-lg sm:text-xl font-bold text-orange-600">
                {approvalStats?.pending_approval || 0}
              </div>
              <div className="text-xs text-orange-800">Pending</div>
            </div>
            <div className="bg-green-50 p-2 sm:p-3 rounded-lg text-center">
              <div className="text-lg sm:text-xl font-bold text-green-600">
                {approvalStats?.approved || 0}
              </div>
              <div className="text-xs text-green-800">Approved</div>
            </div>
            <div className="bg-red-50 p-2 sm:p-3 rounded-lg text-center">
              <div className="text-lg sm:text-xl font-bold text-red-600">
                {approvalStats?.rejected || 0}
              </div>
              <div className="text-xs text-red-800">Rejected</div>
            </div>
            <div className="bg-blue-50 p-2 sm:p-3 rounded-lg text-center">
              <div className="text-lg sm:text-xl font-bold text-blue-600">
                {approvalStats?.auto_approved || 0}
              </div>
              <div className="text-xs text-blue-800">Auto-approved</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApprovalsModal;
