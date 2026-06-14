import React, { useState } from "react";
import axios from "axios";
import { Button } from "../ui/button";

const API = process.env.REACT_APP_BACKEND_URL + "/api";
const EQUIPMENT_FEE = 150;

/**
 * Heavy-pile equipment modal — only shown when the AI flags `heavy_pile=true`
 * on the quote (i.e. ≥70% of the photo is dirt, sandbags, concrete, rock,
 * gravel, wood chips, or mulch).
 *
 * Props
 *   quote   — the quote object returned from /api/quotes/image
 *   onDone  — called with the updated quote payload after the customer picks
 *   onSkip  — called when the customer says "No equipment needed"
 */
const formatMaterial = (raw) => {
  if (!raw) return "heavy materials";
  return raw.replace(/_/g, " ").replace(/\+/g, " + ");
};

export default function HeavyPileEquipmentModal({ quote, onDone, onSkip }) {
  const [submitting, setSubmitting] = useState(null); // "yes" | "no" | null
  const material = formatMaterial(quote?.heavy_material_type);
  const baseTotal = quote?.total_price ?? 0;
  const combinedTotal = baseTotal + EQUIPMENT_FEE;

  const respond = async (needsEquipment) => {
    if (submitting) return;
    setSubmitting(needsEquipment ? "yes" : "no");
    try {
      const { data } = await axios.patch(
        `${API}/quotes/${quote.id}/equipment`,
        { equipment_required: needsEquipment }
      );
      onDone({
        ...quote,
        equipment_required: data.equipment_required,
        equipment_fee: data.equipment_fee,
      });
    } catch (err) {
      // Network/server failure — let the customer continue without locking up.
      // Treat as "no" so the flow doesn't deadlock.
      if (typeof onSkip === "function") onSkip();
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      data-testid="heavy-pile-modal"
    >
      <div className="w-full max-w-md bg-black border-2 border-lime-400 rounded-2xl shadow-[0_20px_60px_-10px_rgba(190,242,100,0.5)] overflow-hidden">
        {/* Header */}
        <div className="relative bg-black px-6 py-5 border-b border-lime-400/30 overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-lime-400/15 rounded-full blur-3xl pointer-events-none"></div>
          <div className="relative text-center">
            <div className="text-4xl mb-2">🚜</div>
            <p className="text-[11px] font-display italic uppercase tracking-widest text-lime-400 mb-1">
              Heavy Pile Detected
            </p>
            <h2 className="font-display italic text-2xl uppercase tracking-tight text-white leading-tight">
              Need <span className="text-lime-400">equipment</span> to load?
            </h2>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 bg-gray-950 text-gray-200 space-y-4">
          <p className="text-sm leading-relaxed">
            Our AI spotted a pile of <span className="font-bold text-lime-400 capitalize">{material}</span>.
            Piles like this usually need a <strong className="text-white">dolly, ramp, or skid steer</strong> to safely load.
          </p>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs leading-relaxed">
            <p className="text-gray-400">
              <strong className="text-white">No equipment needed?</strong> Choose &ldquo;I&apos;ll have it ready&rdquo; if the material is already bagged or curbside-accessible.
            </p>
          </div>

          {/* Yes — needs equipment */}
          <button
            type="button"
            onClick={() => respond(true)}
            disabled={!!submitting}
            data-testid="heavy-pile-yes-btn"
            className="w-full rounded-xl bg-lime-400 hover:bg-lime-300 text-black p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50 shadow-[0_4px_14px_-2px_rgba(190,242,100,0.5)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-display italic uppercase tracking-wider text-base leading-none">
                  Yes, bring equipment
                </p>
                <p className="text-[11px] mt-1.5 text-black/75">
                  We&apos;ll load it safely — final total ${combinedTotal}
                </p>
              </div>
              <span className="font-display italic text-2xl leading-none flex-shrink-0">
                +${EQUIPMENT_FEE}
              </span>
            </div>
          </button>

          {/* No — already accessible */}
          <Button
            variant="outline"
            type="button"
            onClick={() => respond(false)}
            disabled={!!submitting}
            data-testid="heavy-pile-no-btn"
            className="w-full h-12 rounded-xl border-2 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white hover:border-white/50 font-display italic uppercase tracking-wide"
          >
            {submitting === "no" ? "Saving..." : "I'll have it ready at curb"}
          </Button>

          <p className="text-[10px] text-gray-500 text-center leading-relaxed">
            Final equipment requirement is confirmed at pickup. If the pile turns out to be larger or harder to access than the photo showed, an additional fee may apply.
          </p>
        </div>
      </div>
    </div>
  );
}
