import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import usePriorityConfig from "../../hooks/usePriorityConfig";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

// Default fees / metadata — overridden by /api/priority/availability response
const DEFAULT_PRIORITY_TIERS = [
  {
    id: "same_day",
    title: "Same-Day Rush",
    description: "Front of the line — today's first available pickup",
    fee: 75,
    icon: "⚡",
  },
  {
    id: "next_slot",
    title: "Next Available",
    description: "Skip to the next open slot (24-48 hours)",
    fee: 40,
    icon: "⏭",
  },
  {
    id: "emergency",
    title: "Emergency / After-Hours",
    description: "Weekends, evenings, urgent move-outs",
    fee: 100,
    icon: "🚨",
  },
];

// Legacy export — preserved for callers that need static metadata.
const PRIORITY_TIERS = DEFAULT_PRIORITY_TIERS;

/**
 * PriorityPicker — surfaces the optional priority upgrade.
 * Props:
 *   value: current selection (null | tier id)
 *   onChange: (tier id | null) => void
 *   pickupDate: optional YYYY-MM-DD to check availability for that date
 */
const PriorityPicker = ({ value, onChange, pickupDate }) => {
  const { fees: dynamicFees } = usePriorityConfig();
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!!value);
  const [fetchError, setFetchError] = useState(null);

  // Merge DB-driven fees onto static metadata (title/description/icon stay constant)
  const tiers = useMemo(
    () => DEFAULT_PRIORITY_TIERS.map((t) => ({
      ...t,
      fee: dynamicFees?.[t.id] ?? t.fee,
    })),
    [dynamicFees]
  );

  // Defensive: tolerate parent not wiring onChange (shouldn't happen, but
  // keeps the UI alive instead of throwing on click).
  const handleChange = (tier) => {
    if (typeof onChange === "function") {
      onChange(tier);
    } else {
      console.warn("PriorityPicker: onChange prop missing");
    }
  };

  useEffect(() => {
    if (!pickupDate) {
      setAvailability(null);
      setFetchError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setFetchError(null);
    axios
      .get(`${API}/priority/availability`, { params: { date: pickupDate } })
      .then((res) => {
        if (active) setAvailability(res.data);
      })
      .catch((err) => {
        if (active) {
          setAvailability(null);
          setFetchError(err?.response?.data?.detail || "Couldn't check availability");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [pickupDate]);

  const slotsLeft = availability?.available ?? 2;
  const isFull = pickupDate && slotsLeft === 0;
  const nextDate = availability?.next_available_date;

  return (
    <div
      className="rounded-2xl border-2 border-lime-300 bg-gradient-to-br from-lime-50 to-white p-4"
      data-testid="priority-picker"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <div>
            <h3 className="font-display italic text-lg text-black uppercase tracking-tight leading-none">
              Need It Faster?
            </h3>
            <p className="text-xs text-gray-600 mt-1">
              Priority pickup jumps the queue. Non-refundable surcharge.
            </p>
          </div>
        </div>
        {!expanded && !value && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 text-xs font-display italic uppercase tracking-wider text-lime-700 hover:text-lime-800 underline"
            data-testid="priority-picker-expand"
          >
            See options
          </button>
        )}
      </div>

      {(expanded || value) && (
        <>
          {/* "No priority" option */}
          <button
            type="button"
            onClick={() => handleChange(null)}
            className={`w-full mt-4 text-left rounded-xl border-2 p-3 transition-all flex items-center justify-between gap-2 ${
              !value
                ? "border-black bg-white shadow-md"
                : "border-gray-200 bg-white/60 hover:border-gray-300"
            }`}
            data-testid="priority-tier-none"
          >
            <div>
              <p className="font-display italic text-sm text-black uppercase tracking-wider">Standard</p>
              <p className="text-xs text-gray-500">Regular booking — no surcharge</p>
            </div>
            <span className="font-display italic text-base text-black">+$0</span>
          </button>

          {/* Priority tier options */}
          {tiers.map((tier) => {
            const disabled = isFull;
            const selected = value === tier.id;
            return (
              <button
                key={tier.id}
                type="button"
                disabled={disabled}
                onClick={() => handleChange(tier.id)}
                className={`w-full mt-2 text-left rounded-xl border-2 p-3 transition-all flex items-center justify-between gap-2 ${
                  selected
                    ? "border-lime-500 bg-lime-100 shadow-lg ring-2 ring-lime-400/40"
                    : disabled
                    ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
                    : "border-gray-200 bg-white hover:border-lime-400 hover:bg-lime-50"
                }`}
                data-testid={`priority-tier-${tier.id}`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-xl shrink-0">{tier.icon}</span>
                  <div className="min-w-0">
                    <p className="font-display italic text-sm text-black uppercase tracking-wider">{tier.title}</p>
                    <p className="text-xs text-gray-500 leading-snug">{tier.description}</p>
                  </div>
                </div>
                <span className={`font-display italic text-base shrink-0 ${selected ? "text-lime-700" : "text-black"}`}>
                  +${tier.fee}
                </span>
              </button>
            );
          })}

          {/* Availability message */}
          {pickupDate && (
            <div className="mt-3 text-xs">
              {loading ? (
                <p className="text-gray-500">Checking availability…</p>
              ) : fetchError ? (
                <p
                  className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-red-800"
                  data-testid="priority-fetch-error"
                >
                  ⚠ {fetchError}
                </p>
              ) : isFull ? (
                <p
                  className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-800"
                  data-testid="priority-full-message"
                >
                  ⚠ Priority slots full for {pickupDate}.{" "}
                  {nextDate ? (
                    <>
                      Next priority slot available <span className="font-bold">{nextDate}</span>.
                    </>
                  ) : (
                    <>Try a different week.</>
                  )}
                </p>
              ) : (
                <p className="text-gray-500" data-testid="priority-slots-left">
                  {slotsLeft} priority slot{slotsLeft === 1 ? "" : "s"} left for {pickupDate}
                </p>
              )}
            </div>
          )}

          {/* Non-refundable notice */}
          <p className="mt-3 text-[10px] text-gray-500 italic leading-snug">
            Priority fees are non-refundable. They are added on top of your quote and are separate from any dump fees.
          </p>
        </>
      )}
    </div>
  );
};

export default PriorityPicker;
export { PRIORITY_TIERS };
