import React, { useState } from "react";
import { BadgeDollarSign, CheckCircle2 } from "lucide-react";
import { toast } from "../../lib/toast";

const API = process.env.REACT_APP_BACKEND_URL;

// One-tap "set final price & notify" for manual-review / out-of-area bookings.
const ApproveWithPrice = ({ booking }) => {
  const suggested = booking?.quote_details?.approved_price || booking?.quote_details?.total_price || booking?.approved_price || booking?.total_price || "";
  const [price, setPrice] = useState(suggested ? String(Math.round(Number(suggested))) : "");
  const [agreed, setAgreed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  if (!booking?.quote_id) return null;
  if (done) {
    return (
      <p className="mt-2 text-xs font-semibold text-emerald-700 flex items-center gap-1" data-testid={`approved-price-${booking.id}`}>
        <CheckCircle2 className="w-3.5 h-3.5" /> Final price ${done} set — customer notified with pay link
      </p>
    );
  }

  const submit = async () => {
    const value = Number(price);
    if (!value || value <= 0) { toast.error("Enter the final price first"); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/admin/quotes/${booking.quote_id}/approve`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", approved_price: value, customer_agreed: agreed,
          admin_notes: agreed ? "Final price confirmed with customer by phone" : "Final price set after manual review" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not set price");
      setDone(value);
      toast.success(`$${value} locked in — ${agreed ? "pay link emailed" : "customer asked to approve by text"}`);
    } catch (e) {
      toast.error(e.message || "Could not set price");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-md bg-white/70 border border-slate-200 p-2 space-y-1.5" onClick={(e) => e.stopPropagation()} data-testid={`approve-with-price-${booking.id}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500 text-sm font-bold">$</span>
        <input
          data-testid={`approve-price-input-${booking.id}`}
          type="number" min="1" step="1" inputMode="numeric" value={price}
          onChange={(e) => setPrice(e.target.value)} placeholder="Final price"
          className="w-24 h-8 text-sm border border-slate-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        />
        <button
          type="button" onClick={submit} disabled={busy}
          data-testid={`approve-price-btn-${booking.id}`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-xs font-display italic uppercase tracking-wider"
        >
          <BadgeDollarSign className="w-3.5 h-3.5" /> {busy ? "Sending…" : "Set final price & notify"}
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="w-3.5 h-3.5 accent-cyan-600" data-testid={`approve-agreed-${booking.id}`} />
        Customer already agreed by phone — email the pay link now (skip SMS re-approval)
      </label>
    </div>
  );
};

export default ApproveWithPrice;
