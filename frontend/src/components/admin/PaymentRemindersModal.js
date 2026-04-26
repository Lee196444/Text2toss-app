import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";

/**
 * Pending Payment Modal — shows bookings the customer has submitted but
 * not yet paid for. Admin can mark them as paid or reject them.
 */
const PaymentRemindersModal = ({
  open,
  pendingPayments,
  onClose,
  onMarkPaid,
  onReject,
  onRejectAll
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="pending-payments-modal">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-red-500 to-red-600 text-white">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl flex items-center gap-2">
              💳 Pending Payment - {pendingPayments.length} Bookings
            </CardTitle>
            <Button
              onClick={onClose}
              className="bg-white/20 hover:bg-white/30 text-white border-0"
              size="sm"
            >
              Close
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <CardDescription className="text-white/90">
              Customers who booked but haven't paid yet
            </CardDescription>
            {pendingPayments.length > 0 && (
              <Button
                onClick={onRejectAll}
                size="sm"
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30"
                data-testid="reject-all-payments-btn"
              >
                Reject All ({pendingPayments.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-y-auto max-h-[70vh] p-4">
          {pendingPayments.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 text-lg">✅ All bookings are paid</div>
              <p className="text-gray-400 mt-2">No pending payments</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingPayments.map((booking) => (
                <Card key={booking.id} className="border-l-4 border-l-red-400">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          ${booking.quote_details?.total_price || 0} - {booking.pickup_time}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {new Date(booking.pickup_date).toLocaleDateString()} • ID: {booking.id.substring(0, 8)}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => onMarkPaid(booking.id)}
                          className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white"
                          data-testid="mark-paid-btn"
                        >
                          ✅ Mark as Paid
                        </Button>
                        <Button
                          onClick={() => onReject(booking.id)}
                          variant="outline"
                          className="bg-red-50 hover:bg-red-100 text-red-600 border-red-300"
                          data-testid="reject-payment-btn"
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-semibold">Customer:</p>
                        <p className="text-sm">{booking.email || "No email"}</p>
                        <p className="text-sm">{booking.phone}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Address:</p>
                        <p className="text-sm">{booking.address}</p>
                      </div>
                    </div>
                    {booking.quote_details && (
                      <div className="mt-3 p-3 bg-gray-50 rounded">
                        <p className="text-sm font-semibold mb-1">Items:</p>
                        <p className="text-xs text-gray-600">
                          {booking.quote_details.items?.map(
                            (item) => `${item.quantity}x ${item.name} (${item.size})`
                          ).join(", ")}
                        </p>
                      </div>
                    )}
                    <div className="mt-3 p-3 bg-red-50 rounded border border-red-200">
                      <p className="text-sm text-red-800">
                        ⏳ Awaiting Venmo payment - Once received, click "Mark as Paid" to add to calendar
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentRemindersModal;
