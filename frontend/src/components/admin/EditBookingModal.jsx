import React, { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toast } from "../../lib/toast";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

/**
 * EditBookingModal — full-edit dialog for a pending booking (before payment).
 * Lets admin update customer info + adjusted price in one shot.
 *
 * Props:
 *   open      — boolean
 *   booking   — the full booking object (must include id, name, email, phone,
 *               address, pickup_date, pickup_time, quote_details)
 *   onClose   — fn()
 *   onSaved   — fn() called after a successful save (parent refetches list)
 */
export default function EditBookingModal({ open, booking, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !booking) return;
    const currentPrice =
      booking.quote_details?.approved_price ??
      booking.quote_details?.total_price ??
      booking.amount_due ??
      0;
    // Normalise pickup_date — Mongo sometimes stores ISO datetime like
    // "2026-07-25T00:00:00" but <input type="date"> requires "YYYY-MM-DD".
    const rawDate = booking.pickup_date || "";
    const normalizedDate =
      typeof rawDate === "string" && rawDate.length >= 10
        ? rawDate.slice(0, 10)
        : "";
    setForm({
      name: booking.name || "",
      email: booking.email || "",
      phone: booking.phone || "",
      address: booking.address || "",
      pickup_date: normalizedDate,
      pickup_time: booking.pickup_time || "",
      new_price: String(currentPrice),
      reason: "",
      notify_customer: false,
    });
  }, [open, booking]);

  if (!open || !booking || !form) return null;

  const isPaid = booking.payment_status === "paid";

  const save = async () => {
    const priceNum = parseFloat(form.new_price);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast.error("Enter a valid price");
      return;
    }
    setSaving(true);
    try {
      const { data } = await axios.patch(
        `${API}/admin/bookings/${booking.id}/quote-price`,
        {
          new_price: priceNum,
          name: form.name,
          email: form.email,
          phone: form.phone,
          address: form.address,
          pickup_date: form.pickup_date,
          pickup_time: form.pickup_time,
          reason: form.reason,
          notify_customer: form.notify_customer,
        },
        { withCredentials: true },
      );
      if (form.notify_customer) {
        const nr = data?.notify_result || {};
        const channels = [
          nr.sent_email ? "email" : null,
          nr.sent_sms ? "SMS" : null,
        ].filter(Boolean);
        if (channels.length > 0) {
          toast.success(`Booking updated — customer notified by ${channels.join(" + ")}`);
        } else {
          toast.success(
            "Booking updated — but the customer notification could NOT be sent (no email/phone on file, or the send failed). Check backend logs.",
          );
        }
      } else {
        toast.success("Booking updated");
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch sm:items-start justify-center sm:p-4 sm:pt-8 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      data-testid="edit-booking-modal"
    >
      <div className="bg-white w-full max-w-lg rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header */}
        <div className="bg-black text-white px-5 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-display italic uppercase tracking-wider text-lime-400">
              ✏️ Edit Booking
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">
              #{booking.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none px-2"
            data-testid="edit-booking-close"
          >
            ×
          </button>
        </div>

        {isPaid ? (
          <div className="p-6 text-center text-sm text-red-700 bg-red-50">
            This booking is already paid — cannot be edited.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {/* Price */}
            <Card className="border-2 border-lime-300">
              <CardContent className="p-4">
                <label className="text-xs text-gray-500 uppercase tracking-wider">
                  Price ($) — adjusted total
                </label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={form.new_price}
                  onChange={(e) => setForm({ ...form, new_price: e.target.value })}
                  className="mt-1 text-2xl font-bold font-display italic h-14"
                  data-testid="edit-booking-price"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Customer sees this instantly on their pay page. Also updates
                  the Venmo + Stripe checkout amounts.
                </p>
              </CardContent>
            </Card>

            {/* Contact */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">
                  Customer name
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="edit-booking-name"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">
                  Phone
                </label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+19285551234"
                  data-testid="edit-booking-phone"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">
                Email
              </label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                data-testid="edit-booking-email"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">
                Address
              </label>
              <Textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                data-testid="edit-booking-address"
                className="mt-1"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">
                  Pickup date
                </label>
                <Input
                  type="date"
                  value={form.pickup_date}
                  onChange={(e) =>
                    setForm({ ...form, pickup_date: e.target.value })
                  }
                  data-testid="edit-booking-date"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">
                  Pickup time
                </label>
                <Input
                  value={form.pickup_time}
                  onChange={(e) =>
                    setForm({ ...form, pickup_time: e.target.value })
                  }
                  placeholder="08:00-10:00"
                  data-testid="edit-booking-time"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">
                Reason (optional — for your records)
              </label>
              <Input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. added mattress on-site, price adjustment agreed by phone"
                data-testid="edit-booking-reason"
                className="mt-1"
              />
            </div>

            {/* Notify toggle — SMS + email if enabled */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                form.notify_customer
                  ? "border-lime-400 bg-lime-50"
                  : "border-gray-200 bg-gray-50"
              }`}
              data-testid="edit-booking-notify-label"
            >
              <input
                type="checkbox"
                checked={form.notify_customer}
                onChange={(e) =>
                  setForm({ ...form, notify_customer: e.target.checked })
                }
                className="mt-1 w-5 h-5 accent-lime-500"
                data-testid="edit-booking-notify-toggle"
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900">
                  📣 Notify customer of the change
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {form.notify_customer
                    ? "Will email + SMS the customer with the new price, reason, and pay link on save."
                    : "The change will be silent — the customer won't be told."}
                </div>
              </div>
            </label>

            <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-1">
              <Button
                onClick={onClose}
                variant="outline"
                disabled={saving}
                data-testid="edit-booking-cancel"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                data-testid="edit-booking-save"
                className="flex-1 bg-lime-400 hover:bg-lime-500 text-black font-display italic uppercase tracking-wider shadow-lg shadow-lime-400/30"
              >
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
