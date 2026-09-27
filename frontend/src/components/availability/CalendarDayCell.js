import React from "react";

/** Single day cell — handles all 5 visual states + click. */
export default function CalendarDayCell({ day, dateStr, dateStatus, isSelected, isToday, onClick }) {
  const baseClass = "h-16 sm:h-20 lg:h-24 p-2 border-2 rounded-xl transition-all duration-150 relative";
  const selectionRing = (() => {
    if (isSelected) return "ring-2 ring-cyan-500 ring-offset-1";
    if (isToday) return "ring-2 ring-cyan-400/60";
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
      <div className={`text-base sm:text-lg lg:text-xl font-display italic ${isToday ? "underline decoration-cyan-400 decoration-2" : ""}`}>
        {day}
      </div>

      {dateStatus.available_count > 0 && (
        <div className="absolute bottom-1 right-1 bg-black text-cyan-400 rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-xs sm:text-sm font-bold shadow-sm">
          {dateStatus.available_count}
        </div>
      )}


      {dateStatus.status === "fully_booked" && (
        <div className="absolute bottom-1 left-1 text-[9px] font-bold uppercase tracking-wider text-rose-400">Full</div>
      )}
    </div>
  );
}
