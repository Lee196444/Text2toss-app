import React, { useState } from "react";
import { Phone, PhoneCall } from "lucide-react";
import { toast } from "../../lib/toast";

const API = process.env.REACT_APP_BACKEND_URL;

const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch (e) { return iso; }
};

// One-tap "Call customer": opens the dialer and logs the outreach on the booking.
const CallCustomerButton = ({ booking }) => {
  const [log, setLog] = useState(booking?.callback_log || []);
  const phone = (booking?.customer_details?.phone || booking?.phone || "").trim();
  if (!phone) return null;
  const tel = phone.replace(/[^\d+]/g, "");
  const last = log.length ? log[log.length - 1] : null;

  const logCall = async () => {
    try {
      const res = await fetch(`${API}/api/admin/bookings/${booking.id}/callback-log`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (res.ok) {
        const data = await res.json();
        setLog(data.callback_log || []);
        toast.success(`Logged: called ${phone}`);
      }
    } catch (e) { /* best effort */ }
  };

  return (
    <div className="flex items-center justify-between gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
      <a
        href={`tel:${tel}`}
        onClick={logCall}
        data-testid={`call-customer-btn-${booking.id}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black text-cyan-400 border border-cyan-400 text-xs font-display italic uppercase tracking-wider hover:bg-gray-900"
      >
        <PhoneCall className="w-3.5 h-3.5" /> Call customer · {phone}
      </a>
      <span className="text-[10px] text-slate-600 flex items-center gap-1" data-testid={`callback-status-${booking.id}`}>
        <Phone className="w-3 h-3" />
        {last ? `Called ${log.length}× · last ${fmt(last.at)}${last.by ? ` by ${last.by}` : ""}` : "Not called yet"}
      </span>
    </div>
  );
};

export default CallCustomerButton;
