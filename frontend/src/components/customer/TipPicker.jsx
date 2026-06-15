import React, { useState, useMemo } from "react";
import axios from "axios";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "../../lib/toast";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

/**
 * TipPicker — lets the customer add a crew tip (15 / 20 / 25 / custom / skip)
 * before paying. PATCHes /api/bookings/:id/tip on selection; parent receives
 * the refreshed `amount_due` via `onTipApplied(newAmount, tipAmount)`.
 *
 * Props:
 *   bookingId   — uuid
 *   baseAmount  — quote + priority + equipment (used to compute percentages)
 *   currentTip  — persisted tip (0 = not yet selected)
 *   disabled    — hide UI once already-paid / cancelled
 *   onTipApplied(amountDue, tipAmount)
 */
export default function TipPicker({
  bookingId,
  baseAmount,
  currentTip = 0,
  disabled = false,
  onTipApplied,
}) {
  const safeBase = Math.max(0, Number(baseAmount) || 0);
  const presets = useMemo(
    () => [
      { pct: 15, label: "15%" },
      { pct: 20, label: "20%" },
      { pct: 25, label: "25%" },
    ],
    [],
  );
  // "mode" lets us track which chip is selected ("15"|"20"|"25"|"custom"|"skip"|null)
  const initialMode = useMemo(() => {
    if (!currentTip || currentTip <= 0) return null;
    const match = presets.find(
      (p) => Math.abs((safeBase * p.pct) / 100 - currentTip) < 0.01,
    );
    return match ? String(match.pct) : "custom";
  }, [currentTip, presets, safeBase]);

  const [mode, setMode] = useState(initialMode);
  const [customValue, setCustomValue] = useState(
    initialMode === "custom" ? String(currentTip) : "",
  );
  const [submitting, setSubmitting] = useState(false);

  const applyTip = async (tip, newMode) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data } = await axios.patch(`${API}/bookings/${bookingId}/tip`, {
        tip_amount: Number(tip),
      });
      setMode(newMode);
      onTipApplied?.(data.amount_due, data.tip_amount);
      if (Number(tip) > 0) {
        toast.success(`Tip added — thank you! 🙏`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't update tip");
    } finally {
      setSubmitting(false);
    }
  };

  const onPresetClick = (pct) => {
    const tip = Math.round(safeBase * pct) / 100;
    applyTip(tip, String(pct));
  };

  const onCustomBlur = () => {
    const n = parseFloat(customValue);
    if (Number.isNaN(n) || n < 0) {
      setCustomValue("");
      return;
    }
    applyTip(Math.min(n, 500), "custom");
  };

  const onSkip = () => applyTip(0, "skip");

  if (disabled) return null;

  return (
    <Card
      className="border-2 border-lime-400 bg-black overflow-hidden"
      data-testid="tip-picker-card"
    >
      <CardContent className="p-5 space-y-4">
        <div className="text-center">
          <div className="text-3xl mb-1">🙌</div>
          <h3 className="text-lg font-display italic uppercase tracking-wider text-lime-400">
            Tip the Crew
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Optional — 100% goes to the guys doing the heavy lifting.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {presets.map((p) => {
            const isActive = mode === String(p.pct);
            const tipDollars = ((safeBase * p.pct) / 100).toFixed(2);
            return (
              <button
                key={p.pct}
                type="button"
                onClick={() => onPresetClick(p.pct)}
                disabled={submitting}
                data-testid={`tip-preset-${p.pct}`}
                className={`rounded-xl py-3 px-2 border-2 transition-all ${
                  isActive
                    ? "bg-lime-400 border-lime-400 text-black shadow-[0_0_18px_rgba(190,242,100,0.6)]"
                    : "bg-black border-gray-700 text-gray-100 hover:border-lime-400"
                } disabled:opacity-50`}
              >
                <div className="font-display italic text-lg leading-none">
                  {p.label}
                </div>
                <div
                  className={`text-[10px] mt-1 ${
                    isActive ? "text-black/70" : "text-gray-500"
                  }`}
                >
                  +${tipDollars}
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
          <Input
            type="number"
            step="1"
            min="0"
            max="500"
            placeholder="Custom $"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onBlur={onCustomBlur}
            onFocus={() => setMode("custom")}
            disabled={submitting}
            data-testid="tip-custom-input"
            className={`bg-black border-2 text-lime-400 placeholder:text-gray-600 font-display italic ${
              mode === "custom" ? "border-lime-400" : "border-gray-700"
            }`}
          />
          <Button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            variant="ghost"
            data-testid="tip-skip-btn"
            className={`px-4 rounded-xl font-display italic uppercase tracking-wider text-sm ${
              mode === "skip"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            Skip
          </Button>
        </div>

        {currentTip > 0 && (
          <div
            className="text-center text-sm text-lime-400 font-bold"
            data-testid="tip-applied-amount"
          >
            ✅ Tip added: ${Number(currentTip).toFixed(2)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
