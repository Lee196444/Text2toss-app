import { useEffect, useState } from "react";

// Operating window: Mon-Thu, 7am - 6pm Arizona time (MST, no DST).
// Pickup is Mon-Thu only (matches backend), but quoting/messaging is
// available the same hours.
const AZ_OFFSET_HOURS = -7; // MST = UTC-7 year-round (Arizona doesn't observe DST)
const OPEN_HOUR_LOCAL = 7;
const CLOSE_HOUR_LOCAL = 18;
const OPEN_WEEKDAYS = [1, 2, 3, 4]; // Mon-Thu (0 = Sunday)

function computeOpen(now = new Date()) {
  // Compute Arizona-local hour/day from current UTC time, regardless of
  // the visitor's device timezone.
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const az = new Date(utcMs + AZ_OFFSET_HOURS * 60 * 60_000);
  const day = az.getDay();
  const hour = az.getHours();
  const isOpenDay = OPEN_WEEKDAYS.includes(day);
  const isOpenHour = hour >= OPEN_HOUR_LOCAL && hour < CLOSE_HOUR_LOCAL;
  return { isOpen: isOpenDay && isOpenHour, hour, day };
}

/**
 * Returns whether the business is currently open (Mon-Thu, 7am-6pm AZ).
 * Re-evaluates every minute so the "ONLINE" indicator flips automatically.
 */
export default function useBusinessHours() {
  const [state, setState] = useState(() => computeOpen());

  useEffect(() => {
    const tick = () => setState(computeOpen());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return state;
}
