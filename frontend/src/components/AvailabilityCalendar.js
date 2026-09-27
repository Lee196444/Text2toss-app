import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

import CalendarDayCell from "./availability/CalendarDayCell";
import CalendarLegend from "./availability/CalendarLegend";
import {
  getDaysInMonth,
  getFirstDayOfWeek,
  formatDateKey,
  getDateStatus,
  isUnselectableStatus,
} from "./availability/calendarHelpers";
import { logger } from "../utils/logger";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AvailabilityCalendar = ({ selectedDate, onDateSelect, onClose }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availabilityData, setAvailabilityData] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchAvailabilityData = useCallback(async () => {
    setLoading(true);
    try {
      // Two months at a time: the rest of this month + all of next month.
      const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0);
      const startDate = formatDateKey(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate());
      const endDate = formatDateKey(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate());
      const response = await axios.get(
        `${API}/availability-range?start_date=${startDate}&end_date=${endDate}`,
      );
      setAvailabilityData(response.data);
    } catch (error) {
      logger.error("Error fetching availability:", error);
    }
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => {
    fetchAvailabilityData();
  }, [fetchAvailabilityData]);

  const changeMonth = (direction) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  };

  const handleDateClick = (dateStr, dateStatus) => {
    if (isUnselectableStatus(dateStatus.status)) return;
    onDateSelect(dateStr);
    onClose();
  };

  const localToday = () => {
    const d = new Date();
    return formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const isCurrentOrPastMonth =
    currentMonth.getFullYear() < new Date().getFullYear() ||
    (currentMonth.getFullYear() === new Date().getFullYear() && currentMonth.getMonth() <= new Date().getMonth());

  const renderCalendar = (month) => {
    const daysInMonth = getDaysInMonth(month);
    const firstDayOfWeek = getFirstDayOfWeek(month);
    const today = localToday();
    const cells = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ key: `empty-${i}`, past: true, node: null });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateKey(month.getFullYear(), month.getMonth(), day);
      if (dateStr < today) {
        // Past dates are never bookable — render an invisible spacer instead of a greyed-out box.
        cells.push({ key: `past-${day}`, past: true, node: null });
        continue;
      }
      const dateStatus = getDateStatus(dateStr, availabilityData);
      cells.push({
        key: day,
        past: false,
        node: (
          <CalendarDayCell
            key={day}
            day={day}
            dateStr={dateStr}
            dateStatus={dateStatus}
            isSelected={dateStr === selectedDate}
            isToday={dateStr === today}
            onClick={() => handleDateClick(dateStr, dateStatus)}
          />
        ),
      });
    }

    // Drop whole leading weeks that are entirely in the past so the grid starts
    // at the week containing the first bookable day.
    const firstFuture = cells.findIndex((c) => !c.past);
    const startRow = firstFuture === -1 ? cells.length : Math.floor(firstFuture / 7) * 7;
    const visible = cells.slice(startRow);
    if (!visible.length) return null;
    return visible.map((c) => c.node ?? <div key={c.key} aria-hidden="true" className="h-16 sm:h-20 lg:h-24" />);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl sm:max-w-4xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg sm:text-xl">Select Pickup Date</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {currentMonth.toLocaleDateString("en-US", { month: "short" })} – {new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => changeMonth(-1)} disabled={loading || isCurrentOrPastMonth} data-testid="calendar-prev-month">←</Button>
            <Button variant="outline" size="sm" onClick={() => changeMonth(1)} disabled={loading} data-testid="calendar-next-month">→</Button>
            <Button variant="outline" size="sm" onClick={onClose}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading availability...</div>
          ) : (
            [currentMonth, new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)].map((month, idx) => {
              const cells = renderCalendar(month);
              if (!cells) return null;
              const label = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
              return (
                <section key={label} data-testid={`calendar-month-${idx}`} className={idx > 0 ? "mt-6 pt-4 border-t border-cyan-100" : ""}>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-cyan-700 mb-2">{label}</h3>
                  <div className="grid grid-cols-7 gap-2 mb-2">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                      <div key={day} className="py-1 text-center font-semibold text-gray-500 text-xs sm:text-sm">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">{cells}</div>
                </section>
              );
            })
          )}

          <CalendarLegend />
        </CardContent>
      </Card>
    </div>
  );
};

export default AvailabilityCalendar;
