import React, { useState } from "react";
import { Route, ChevronDown, ChevronUp, AlertTriangle, MapPinOff } from "lucide-react";

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

// Admin-only internal breakdown of a route-based travel quote (booking.travel_pricing)
const TravelBreakdown = ({ travel, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  if (!travel || travel.status === "disabled") return null;

  if (travel.status === "out_of_area") {
    return (
      <div data-testid="travel-out-of-area" className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 flex items-start gap-1.5">
        <MapPinOff className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span><b>Outside service area</b> — customer was shown the "call us" message. {travel.reason}</span>
      </div>
    );
  }

  if (travel.status === "manual_review") {
    return (
      <div data-testid="travel-manual-review" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span><b>Manual review needed</b> — travel cost not auto-priced. {travel.reason}</span>
      </div>
    );
  }

  const b = travel.breakdown || {};
  const rows = [
    ["AI / base junk-removal price", b.base_price],
    [`Fuel · ${b.route_miles} mi ÷ ${b.inputs?.tow_mpg} mpg = ${b.gallons} gal × $${b.inputs?.gas_price_per_gallon}`, b.fuel_cost],
    ["Heavy-item fees", b.heavy_item_fees],
    ["Disposal fees", b.disposal_fees],
    ["Subtotal", b.subtotal, true],
    [`Maintenance reserve (${b.inputs?.maintenance_pct}%)`, b.maintenance_reserve],
    ["Internal price", b.internal_price, true],
    [b.inputs?.recover_processing_fees ? `Payment-processing allowance (${b.inputs?.processing_pct}% + $${b.inputs?.processing_fixed_fee})` : "Payment-processing allowance (off)", b.processing_allowance],
    [`Rounded up to $${b.inputs?.rounding_increment}`, b.final_price - b.pre_rounding_price],
  ];

  return (
    <div data-testid="travel-breakdown" className="rounded-md border border-cyan-200 bg-cyan-50/60 text-xs overflow-hidden">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} data-testid="travel-breakdown-toggle" className="w-full flex items-center justify-between px-2.5 py-1.5 text-cyan-900 hover:bg-cyan-100/60">
        <span className="flex items-center gap-1.5 font-semibold"><Route className="w-3.5 h-3.5" /> Route {b.route_miles} mi · Final customer price <b className="font-mono">{money(b.final_price)}</b></span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-2.5 pb-2 space-y-0.5 border-t border-cyan-200 pt-1.5">
          {rows.map(([label, val, strong]) => (
            <div key={label} className={`flex justify-between gap-3 ${strong ? "font-semibold text-slate-900 border-t border-cyan-200/70 pt-0.5" : "text-slate-700"}`}>
              <span className="truncate">{label}</span><span className="font-mono whitespace-nowrap">{money(val)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-3 font-black text-cyan-800 border-t-2 border-cyan-300 pt-1 mt-1">
            <span>Final customer price</span><span className="font-mono" data-testid="travel-final-price">{money(b.final_price)}</span>
          </div>
          {travel.route?.legs && (
            <p className="text-[10px] text-slate-500 pt-1">
              {travel.route.legs.map((l, i) => <span key={i}>{i === 0 ? "Base" : i === 1 ? "Pickup" : "Disposal"} → {l.miles} mi{i < 2 ? " · " : ""}</span>)}
              {" · "}locked {String(b.computed_at || "").slice(0, 10)}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TravelBreakdown;
