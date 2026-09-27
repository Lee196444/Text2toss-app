import React from "react";

/** Single day cell — handles all 5 visual states + click. */
export default function CalendarDayCell({ day, dateStr, dateStatus, isSelected, isToday, onClick }) {
  const baseClass = "h-14 sm:h-20 lg:h-24 p-2 border rounded-lg transition-colors duration-150 relative";
  const selectionRing = (() => {
    if (isSelected) return "ring-2 ring-cyan-500 bg-cyan-50";
    if (isToday) return "ring-1 ring-cyan-300";
    return "";
  })();

  return (
    <div
      key={day}
      data-testid={`calendar-day-${dateStr}`}
      className={`${baseClass} ${dateStatus.className} ${selectionRing}`}
      onClick={onClick}
      title={dateStatus.tooltip}
    >
      <div className={`text-sm sm:text-lg lg:text-xl font-semibold ${isToday ? "text-cyan-600" : ""}`}>
        {day}
      </div>

      {dateStatus.available_count > 0 && (
        <div className="absolute bottom-1 right-1.5 text-[10px] sm:text-xs font-medium text-cyan-600 whitespace-nowrap">
          {dateStatus.available_count}<span className="hidden sm:inline"> open</span>
        </div>
      )}


      {dateStatus.status === "fully_booked" && (
        <div className="absolute bottom-1 right-1 text-[10px] text-slate-300">full</div>
      )}
    </div>
  );
}
