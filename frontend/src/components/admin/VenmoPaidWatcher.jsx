import { useEffect, useRef } from "react";
import { toast } from "../../lib/toast";
import { playCashChime } from "../../lib/chime";

const API = process.env.REACT_APP_BACKEND_URL;
const POLL_MS = 20000;

// Polls for bookings the Venmo webhook flipped to paid and toasts each one once.
const VenmoPaidWatcher = ({ onPayment }) => {
  const sinceRef = useRef(new Date().toISOString());
  const seenRef = useRef(new Set());
  const onPaymentRef = useRef(onPayment);
  onPaymentRef.current = onPayment;

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/admin/venmo-payments/recent?since=${encodeURIComponent(sinceRef.current)}`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const fresh = (data.payments || []).filter((p) => !seenRef.current.has(p.booking_id));
        if (fresh.length) {
          playCashChime();
          fresh.forEach((p) => {
            seenRef.current.add(p.booking_id);
            const who = p.customer_name || p.sender || "a customer";
            toast.success(`💸 Venmo payment received: $${Number(p.amount || 0).toFixed(2)} from ${who} — Invoice #${p.invoice_number} marked PAID`);
          });
          sinceRef.current = fresh.reduce((m, p) => (p.paid_at > m ? p.paid_at : m), sinceRef.current);
          onPaymentRef.current?.(fresh);
        }
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.debug("venmo poll skipped", e);
      }
    };
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return null;
};

export default VenmoPaidWatcher;
