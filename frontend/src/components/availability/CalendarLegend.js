import React from "react";

/** Color legend + helper text shown under the calendar grid. */
export default function CalendarLegend() {
  const items = [
    { color: "bg-cyan-50 border-cyan-300", label: "Available" },
    { color: "bg-amber-50 border-amber-300", label: "Limited" },
    { color: "bg-rose-50 border-rose-200", label: "Fully Booked" },
    { color: "bg-slate-50 border-slate-200", label: "Unavailable" },
  ];
  return (
    <>
      <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs text-gray-600">
        {items.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-3 h-3 ${color} border-2 rounded`}></div>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-xs text-gray-600">
        Numbers show open time slots • Tap a blue or amber date to select
      </div>
    </>
  );
}
