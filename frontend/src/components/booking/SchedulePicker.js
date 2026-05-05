import React from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";

const TIME_SLOTS = [
  { value: "08:00-10:00", label: "Morning (8-10 AM)" },
  { value: "10:00-12:00", label: "Late Morning (10 AM-12 PM)" },
  { value: "12:00-14:00", label: "Afternoon (12-2 PM)" },
  { value: "14:00-16:00", label: "Mid Afternoon (2-4 PM)" },
  { value: "16:00-18:00", label: "Evening (4-6 PM)" },
];

/** Date button (opens calendar) + time-window dropdown for booking pickup. */
export default function SchedulePicker({
  bookingData,
  setBookingData,
  bookedTimeSlots,
  checkingAvailability,
  onOpenCalendar,
}) {
  const renderSelectedDate = () => {
    if (!bookingData.pickup_date) return "Choose your pickup date";
    // Parse as local time so we don't shift across timezones
    const [year, month, day] = bookingData.pickup_date.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const timePlaceholder = (() => {
    if (checkingAvailability) return "Checking...";
    if (!bookingData.pickup_date) return "Select date first";
    return "Choose time window";
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b-2 border-emerald-500">
        <span className="text-2xl">📅</span>
        <h3 className="text-xl font-bold text-gray-800">Schedule Pickup</h3>
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label className="text-base font-semibold text-gray-700">Select Date</Label>
        <Button
          variant="outline"
          onClick={onOpenCalendar}
          className="w-full justify-between text-left h-14 border-2 border-gray-200 hover:border-emerald-400 text-gray-700 hover:bg-emerald-50 font-medium text-base"
          data-testid="pickup-date-button"
        >
          <span>{renderSelectedDate()}</span>
          <span className="text-2xl">📅</span>
        </Button>
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full"></span> Available
          <span className="mx-2">•</span>
          <span className="w-2 h-2 bg-red-500 rounded-full"></span> Booked
          <span className="mx-2">•</span>
          Mon-Thu only
        </p>
      </div>

      {/* Time */}
      <div className="space-y-2">
        <Label className="text-base font-semibold text-gray-700">Select Time Window</Label>
        <div className="relative">
          <select
            value={bookingData.pickup_time || ""}
            onChange={(e) => setBookingData({ ...bookingData, pickup_time: e.target.value })}
            disabled={!bookingData.pickup_date || checkingAvailability}
            className="w-full h-14 border-2 border-gray-200 rounded-lg px-4 text-base bg-white appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
            data-testid="pickup-time-select"
          >
            <option value="" disabled>{timePlaceholder}</option>
            {TIME_SLOTS.map((slot) => {
              const isBooked = bookedTimeSlots.includes(slot.value);
              return (
                <option key={slot.value} value={slot.value} disabled={isBooked}>
                  {slot.label}{isBooked ? " (Booked)" : ""}
                </option>
              );
            })}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
