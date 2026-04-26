import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";

/**
 * Helper: build the public URL for a quote photo path.
 */
const buildQuoteImageUrl = (tempPath) => {
  if (!tempPath) return "";
  if (tempPath.startsWith("http")) return tempPath;
  const filename = tempPath.split("/").pop();
  const folder = filename.startsWith("quote_")
    ? "quote_images"
    : filename.startsWith("approval_")
    ? "approval_quotes"
    : "temp_uploads";
  return `${process.env.REACT_APP_BACKEND_URL}/api/images/${folder}/${filename}`;
};

const PendingApprovalsModal = ({
  open,
  pendingQuotes,
  approvalStats,
  failedQuoteImages,
  onMarkImageFailed,
  onApprove,
  onReject,
  onClose
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4" data-testid="quote-approval-modal">
      <Card className="w-full max-w-4xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden mx-2 sm:mx-0 my-4 sm:my-0">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg sm:text-2xl flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span className="flex items-center gap-2">
                📋 Quote Approval
                {pendingQuotes.length > 0 && (
                  <Badge variant="destructive" className="text-xs">{pendingQuotes.length}</Badge>
                )}
              </span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-1">
              Review high-value quotes (Scale 9-20) before payment
            </CardDescription>
          </div>
          <Button
            onClick={onClose}
            className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium text-sm self-end sm:self-auto"
          >
            <span className="mr-1 sm:mr-2">✕</span>Close
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto max-h-[70vh]">
          {pendingQuotes.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 text-lg">✅ No quotes pending approval</div>
              <p className="text-gray-400 mt-2">All high-value quotes have been reviewed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(pendingQuotes || []).map((quote) => {
                const imgUrl = buildQuoteImageUrl(quote.temp_image_path);
                return (
                  <Card key={quote.id} className="border-l-4 border-l-orange-400">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            Quote ${quote.total_price}
                            <Badge variant="outline">Scale {quote.scale_level}</Badge>
                            <Badge className="bg-orange-100 text-orange-800">Pending Review</Badge>
                          </CardTitle>
                          <CardDescription className="text-sm">
                            Created: {new Date(quote.created_at).toLocaleDateString()} • ID: {quote.id}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-semibold mb-2">Job Description:</h4>
                          <p className="text-sm text-gray-700 mb-3">{quote.description}</p>

                          {quote.items && quote.items.length > 0 && (
                            <>
                              <h4 className="font-semibold mb-2">Items:</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                                {quote.items.map((item, index) => (
                                  <div
                                    key={`${item.name}-${item.size}-${index}`}
                                    className="text-sm bg-white p-2 rounded border"
                                  >
                                    {item.quantity}x {item.name} ({item.size})
                                  </div>
                                ))}
                              </div>
                            </>
                          )}

                          {quote.ai_explanation && (
                            <div>
                              <h4 className="font-semibold mb-2">AI Analysis:</h4>
                              <p className="text-sm text-gray-600">{quote.ai_explanation}</p>
                            </div>
                          )}

                          <div className="mt-4">
                            <h4 className="font-semibold mb-2 flex items-center gap-2">
                              Customer Photo:
                              {quote.temp_image_path ? (
                                <Badge className="bg-blue-100 text-blue-800" data-testid="photo-uploaded-badge">Uploaded</Badge>
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600">No Photo</Badge>
                              )}
                            </h4>
                            {quote.temp_image_path ? (
                              <div className="bg-white border-2 border-gray-200 rounded-lg p-3">
                                {failedQuoteImages.has(quote.id) ? (
                                  <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 text-center">
                                    <p className="text-sm font-semibold text-yellow-800 mb-2">Photo No Longer Available</p>
                                    <p className="text-xs text-yellow-700">Only the last 30 quote photos are retained.</p>
                                  </div>
                                ) : (
                                  <>
                                    <img
                                      src={imgUrl}
                                      alt="Customer uploaded photo for quote"
                                      className="max-w-full h-auto max-h-64 rounded-lg border border-gray-300 cursor-pointer hover:opacity-90 transition-opacity"
                                      data-testid="quote-photo-img"
                                      onClick={() => window.open(imgUrl, "_blank")}
                                      onError={() => onMarkImageFailed(quote.id)}
                                    />
                                    <div className="mt-2 text-xs text-gray-500 text-center">
                                      Click image to view full size
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : (
                              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 text-center">
                                <div className="text-3xl mb-2">📷</div>
                                <p className="text-sm text-gray-600">No photo uploaded for this quote</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                          <div className="flex-1">
                            <Label className="text-sm font-medium">Adjust Price (Optional)</Label>
                            <Input
                              type="number"
                              placeholder={quote.total_price}
                              id={`price-${quote.id}`}
                              className="mt-1"
                              step="0.01"
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-sm font-medium">Admin Notes</Label>
                            <Input
                              placeholder="Optional notes for customer"
                              id={`notes-${quote.id}`}
                              className="mt-1"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                          {quote.temp_image_path && (
                            <Button
                              data-testid="view-full-photo-btn"
                              onClick={() => window.open(imgUrl, "_blank")}
                              variant="outline"
                              className="border-blue-400 text-blue-700 hover:bg-blue-50 py-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium"
                            >
                              <span className="mr-2">🔍</span>View Full Photo
                            </Button>
                          )}
                          <Button
                            onClick={() => {
                              const adjustedPrice = document.getElementById(`price-${quote.id}`).value;
                              const notes = document.getElementById(`notes-${quote.id}`).value;
                              onApprove(
                                quote.id,
                                notes,
                                adjustedPrice ? parseFloat(adjustedPrice) : null
                              );
                            }}
                            className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white flex-1 py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                          >
                            <span className="mr-2">✅</span>Approve Quote
                          </Button>
                          <Button
                            onClick={() => {
                              const notes = document.getElementById(`notes-${quote.id}`).value;
                              onReject(quote.id, notes || "Quote rejected by admin");
                            }}
                            className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white flex-1 py-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-medium"
                          >
                            <span className="mr-2">❌</span>Reject Quote
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="mt-4 sm:mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 pt-4 sm:pt-6 border-t">
            <div className="bg-orange-50 p-2 sm:p-3 rounded-lg text-center">
              <div className="text-lg sm:text-xl font-bold text-orange-600">{approvalStats.pending_approval || 0}</div>
              <div className="text-xs text-orange-800">Pending</div>
            </div>
            <div className="bg-green-50 p-2 sm:p-3 rounded-lg text-center">
              <div className="text-lg sm:text-xl font-bold text-green-600">{approvalStats.approved || 0}</div>
              <div className="text-xs text-green-800">Approved</div>
            </div>
            <div className="bg-red-50 p-2 sm:p-3 rounded-lg text-center">
              <div className="text-lg sm:text-xl font-bold text-red-600">{approvalStats.rejected || 0}</div>
              <div className="text-xs text-red-800">Rejected</div>
            </div>
            <div className="bg-blue-50 p-2 sm:p-3 rounded-lg text-center">
              <div className="text-lg sm:text-xl font-bold text-blue-600">{approvalStats.auto_approved || 0}</div>
              <div className="text-xs text-blue-800">Auto-Approved</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApprovalsModal;
