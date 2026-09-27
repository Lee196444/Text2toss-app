/**
 * Pure helpers for AvailabilityCalendar.
 *
 * Kept date-string-based (not Date objects) so we never accidentally shift
 * across timezones — calendar UI is local-day, not UTC.
 */

export const getDaysInMonth = (date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

export const getFirstDayOfWeek = (date) =>
  new Date(date.getFullYear(), date.getMonth(), 1).getDay();

export const formatDateKey = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const PAST_CLASS = "bg-gray-100 text-gray-400 cursor-not-allowed";
const RESTRICTED_CLASS = "bg-slate-50 text-slate-300 cursor-not-allowed border-slate-100";
const FULL_CLASS = "bg-rose-50 text-rose-400 cursor-not-allowed border-rose-200";
const LIMITED_CLASS = "bg-amber-50 text-amber-800 cursor-pointer border-amber-300 hover:bg-amber-100";
const AVAILABLE_CLASS = "bg-cyan-50 text-cyan-900 cursor-pointer border-cyan-300 hover:bg-cyan-100 hover:border-cyan-500 hover:-translate-y-0.5 hover:shadow-md";
const LOADING_CLASS = "bg-gray-50";

/** Decide visual state + clickability for a given calendar cell. */
export const getDateStatus = (dateStr, availabilityData) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse as local time so the cell never shifts across timezones.
  const [year, month, day] = dateStr.split("-").map(Number);
  const checkDate = new Date(year, month - 1, day);

  if (checkDate < today) {
    return { status: "past", available_count: 0, className: PAST_CLASS };
  }

  const availability = availabilityData[dateStr];
  if (!availability) {
    return { status: "loading", available_count: 0, className: LOADING_CLASS };
  }

  if (availability.is_restricted) {
    return {
      status: "restricted",
      available_count: 0,
      className: RESTRICTED_CLASS,
      tooltip: "Not available on weekends",
    };
  }

  if (availability.status === "fully_booked") {
    return {
      status: "fully_booked",
      available_count: 0,
      className: FULL_CLASS,
      tooltip: "Fully booked",
    };
  }

  if (availability.status === "limited") {
    return {
      status: "limited",
      available_count: availability.available_count,
      className: LIMITED_CLASS,
      tooltip: `${availability.available_count} slots available`,
    };
  }

  return {
    status: "available",
    available_count: availability.available_count,
    className: AVAILABLE_CLASS,
    tooltip: `${availability.available_count} slots available`,
  };
};

/** Date-string-based comparison so we don't allocate Date objects. */
export const isUnselectableStatus = (status) =>
  status === "past" || status === "restricted" || status === "fully_booked";
