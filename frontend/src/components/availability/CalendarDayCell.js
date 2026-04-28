import React from "react";

/** Single day cell — handles all 5 visual states + click. */
export default function CalendarDayCell({ day, dateStr, dateStatus, isSelected, isToday, onClick }) {
  const baseClass = "h-16 sm:h-20 lg:h-24 p-2 border rounded transition-all relative";
  const selectionRing = (() => {
    if (isSelected) return "ring-2 ring-blue-500";
    if (isToday) return "ring-1 ring-blue-300";
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
      <div className={`text-base sm:text-lg lg:text-xl font-semibold ${isToday ? "underline" : ""}`}>
        {day}
      </div>

      {dateStatus.available_count > 0 && (
        <div className="absolute bottom-1 right-1 bg-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-xs sm:text-sm font-bold shadow-sm">
          {dateStatus.available_count}
        </div>
      )}

      {dateStatus.status === "restricted" && (
        <div className="absolute bottom-0 left-0 text-xs">❌</div>
      )}
      {dateStatus.status === "fully_booked" && (
        <div className="absolute bottom-0 left-0 text-xs">🚫</div>
      )}
    </div>
  );
}
