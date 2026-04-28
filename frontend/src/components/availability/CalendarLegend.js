import React from "react";

/** Color legend + helper text shown under the calendar grid. */
export default function CalendarLegend() {
  const items = [
    { color: "bg-green-100 border-green-300", label: "Available" },
    { color: "bg-yellow-100 border-yellow-300", label: "Limited" },
    { color: "bg-red-100 border-red-300", label: "Fully Booked" },
    { color: "bg-gray-100 border-gray-300", label: "Unavailable" },
  ];
  return (
    <>
      <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs">
        {items.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-3 h-3 ${color} border rounded`}></div>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-center text-xs text-gray-600">
        Numbers show available time slots • Click green/yellow dates to select
      </div>
    </>
  );
}
