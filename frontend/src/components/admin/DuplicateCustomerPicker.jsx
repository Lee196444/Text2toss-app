import React, { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Input } from "../ui/input";
import { ChevronDown, Search, UserPlus } from "lucide-react";

const norm = (v) => String(v || "").trim().toLowerCase();

// Collapse bookings to one row per customer (email → phone → name), newest first.
export const uniqueCustomers = (bookings) => {
  const seen = new Set();
  const out = [];
  for (const b of bookings) {
    const c = b.customer_details || {};
    const name = c.name || b.name || "";
    const email = c.email || b.email || "";
    const phone = c.phone || b.phone || "";
    const address = c.address || b.address || "";
    if (!name && !email && !phone) continue;
    const key = norm(email) || norm(phone) || norm(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ bookingId: b.id, name, email, phone, address, lastDate: (b.pickup_date || b.created_at || "").slice(0, 10) });
  }
  return out;
};

const DuplicateCustomerPicker = ({ bookings, disabled, onPick }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const customers = useMemo(() => uniqueCustomers(bookings), [bookings]);
  const filtered = useMemo(() => {
    const needle = norm(q);
    if (!needle) return customers.slice(0, 50);
    return customers.filter((c) => [c.name, c.email, c.phone, c.address].some((f) => norm(f).includes(needle))).slice(0, 50);
  }, [customers, q]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="duplicate-customer-trigger"
          disabled={disabled}
          aria-label="Duplicate from customer"
          className="h-8 px-1.5 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white border-l border-cyan-400/60 disabled:opacity-50"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[60] w-80 p-0 bg-white" data-testid="duplicate-customer-popover">
        <div className="p-2 border-b border-slate-200">
          <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 mb-1.5 flex items-center gap-1">
            <UserPlus className="w-3 h-3" /> Duplicate from customer
          </p>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              data-testid="duplicate-customer-search"
              className="pl-7 h-8 text-sm"
              placeholder="Search past customers…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-400 p-3 text-center">No matching customers.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.bookingId}
                type="button"
                data-testid={`duplicate-customer-option-${c.bookingId}`}
                onClick={() => { setOpen(false); setQ(""); onPick(c.bookingId); }}
                className="w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-cyan-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-slate-900 truncate">{c.name || c.email || c.phone}</span>
                  {c.lastDate && <span className="text-[10px] text-slate-400 whitespace-nowrap">{c.lastDate}</span>}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
                {c.address && <div className="text-[11px] text-slate-400 truncate">{c.address}</div>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DuplicateCustomerPicker;
