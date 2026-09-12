import React, { useState } from "react";
import { Badge } from "../ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Repeat, History } from "lucide-react";
import { formatDate } from "./bucketShared";

const API = process.env.REACT_APP_BACKEND_URL;

// Amber "returning customer" tag; tap to peek at that customer's past jobs.
const ReturningCustomerBadge = ({ booking, className = "" }) => {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const rc = booking?.returning_customer;
  if (!rc || !rc.previous_jobs) return null;
  const n = rc.previous_jobs;
  const cd = booking.customer_details || {};
  const email = cd.email || booking.email || "";
  const phone = cd.phone || booking.phone || "";

  const load = async () => {
    if (history || loading) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ email, phone, exclude: booking.id });
      const res = await fetch(`${API}/api/admin/customers/history?${qs}`, { credentials: "include" });
      setHistory(res.ok ? await res.json() : { jobs: [], error: true });
    } catch (e) {
      setHistory({ jobs: [], error: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          data-testid={`returning-badge-${booking.id}`}
          title={`${rc.first_name || "This customer"} has booked ${n} time${n === 1 ? "" : "s"} before — tap to see past jobs`}
          className="inline-flex focus:outline-none"
        >
          <Badge className={`bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 cursor-pointer gap-1 ${className}`}>
            <Repeat className="w-3 h-3" />
            Returning{rc.first_name ? ` · ${rc.first_name}` : ""} · {n} prior job{n === 1 ? "" : "s"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        onClick={(e) => e.stopPropagation()}
        className="z-[10000] w-80 p-0 bg-white"
        data-testid={`customer-history-popover-${booking.id}`}
      >
        <div className="px-3 py-2 border-b border-amber-200 bg-amber-50 rounded-t-md">
          <p className="text-[10px] uppercase tracking-widest font-bold text-amber-700 flex items-center gap-1">
            <History className="w-3 h-3" /> {rc.first_name ? `${rc.first_name}'s` : "Customer"} history
          </p>
          {history && !history.error && (
            <p className="text-xs text-slate-700 mt-0.5" data-testid={`customer-history-summary-${booking.id}`}>
              {history.job_count} past job{history.job_count === 1 ? "" : "s"} · <b>${Number(history.lifetime_paid).toFixed(2)}</b> paid lifetime
            </p>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {loading || !history ? (
            <p className="text-xs text-slate-400 p-3">Loading…</p>
          ) : history.error ? (
            <p className="text-xs text-red-500 p-3">Couldn't load history.</p>
          ) : history.jobs.length === 0 ? (
            <p className="text-xs text-slate-400 p-3">No past jobs found.</p>
          ) : (
            history.jobs.map((j) => (
              <div key={j.id} data-testid={`customer-history-job-${j.id}`} className="px-3 py-2 border-b border-slate-100 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{formatDate(j.pickup_date) || "—"}</span>
                  <span className="font-mono font-bold text-emerald-700">${Number(j.total).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5 text-[10px]">
                  <span className="text-slate-500 truncate">#{j.invoice_number}{j.address ? ` · ${j.address}` : ""}</span>
                  <span className={`px-1.5 py-0.5 rounded uppercase font-bold ${j.payment_status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {j.payment_status || "unpaid"}{j.payment_status === "paid" && j.paid_via === "venmo_webhook" ? " · venmo" : ""}
                  </span>
                </div>
                {j.items.length > 0 && <p className="text-slate-600 mt-1 truncate">{j.items.join(", ")}</p>}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ReturningCustomerBadge;
