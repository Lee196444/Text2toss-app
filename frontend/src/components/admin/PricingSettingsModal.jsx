import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { X, Fuel, Save, Calculator } from "lucide-react";
import TravelBreakdown from "./TravelBreakdown";

const API = process.env.REACT_APP_BACKEND_URL;

const NUM_FIELDS = [
  ["tow_mpg", "Tow MPG", "0.1"],
  ["gas_price_per_gallon", "Gas price / gallon ($)", "0.01"],
  ["maintenance_pct", "Maintenance reserve (%)", "0.1"],
  ["processing_pct", "Payment processing (%)", "0.01"],
  ["processing_fixed_fee", "Processing fixed fee ($)", "0.01"],
  ["default_disposal_fee", "Default disposal fee ($)", "0.01"],
  ["rounding_increment", "Round final price UP to ($)", "0.01"],
  ["max_service_miles", "Max service radius, one-way mi (0 = none)", "1"],
];

const PricingSettingsModal = ({ open, onClose }) => {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState({ address: "", base_price: 250, result: null, loading: false });

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/api/admin/pricing/settings`, { credentials: "include" })
      .then((r) => r.json()).then(setS)
      .catch(() => toast.error("Couldn't load pricing settings"));
  }, [open]);

  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/pricing/settings`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(s),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const { success, ...saved } = data;
      setS(saved);
      toast.success("Pricing settings saved — applies to new quotes only");
    } catch (e) {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    setPreview((p) => ({ ...p, loading: true, result: null }));
    try {
      const res = await fetch(`${API}/api/admin/pricing/preview`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: preview.address, base_price: Number(preview.base_price) || 0, settings: s }),
      });
      const data = res.ok ? await res.json() : { status: "manual_review", reason: "Request failed" };
      setPreview((p) => ({ ...p, loading: false, result: data }));
    } catch (e) {
      setPreview((p) => ({ ...p, loading: false, result: { status: "manual_review", reason: "Network error" } }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose && onClose()}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[92vh] p-0 overflow-hidden flex flex-col bg-white" data-testid="pricing-settings-modal">
        <DialogHeader className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <Fuel className="w-5 h-5 text-cyan-600" /> Travel &amp; Pricing Settings
            </DialogTitle>
            <button onClick={onClose} data-testid="pricing-settings-close-btn" className="p-1.5 hover:bg-slate-200 rounded-md" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
        </DialogHeader>

        {!s ? <p className="p-6 text-sm text-slate-400">Loading…</p> : (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" data-testid="ps-enabled" checked={!!s.travel_pricing_enabled} onChange={(e) => set("travel_pricing_enabled", e.target.checked)} className="w-4 h-4 accent-cyan-600" />
              Add route-based travel cost to every new quote (Base → Pickup → Disposal → Base)
            </label>

            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 mb-2">Addresses</p>
              <div className="grid gap-2">
                <label className="text-xs text-slate-600 flex flex-col gap-1">Text2Toss base address
                  <Input data-testid="ps-base-address" value={s.base_address} onChange={(e) => set("base_address", e.target.value)} /></label>
                <label className="text-xs text-slate-600 flex flex-col gap-1">Default disposal-site address
                  <Input data-testid="ps-disposal-address" value={s.disposal_address} onChange={(e) => set("disposal_address", e.target.value)} /></label>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 mb-2">Cost inputs</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {NUM_FIELDS.map(([k, label, step]) => (
                  <label key={k} className="text-xs text-slate-600 flex flex-col gap-1">{label}
                    <Input data-testid={`ps-${k}`} type="number" step={step} value={s[k]} onChange={(e) => set(k, e.target.value)} /></label>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" data-testid="ps-recover-fees" checked={!!s.recover_processing_fees} onChange={(e) => set("recover_processing_fees", e.target.checked)} className="w-4 h-4 accent-cyan-600" />
                Gross-up quotes so the NET after card processing fees equals the internal price
              </label>
              <label className="mt-3 text-xs text-slate-600 flex flex-col gap-1">
                "Call us" message shown when a pickup is beyond the service radius
                <textarea data-testid="ps-out-of-area-message" rows={2} maxLength={500} value={s.out_of_area_message || ""} onChange={(e) => set("out_of_area_message", e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 bg-white resize-y focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </label>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 mb-2">Manual-review alerts</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="text-xs text-slate-600 flex flex-col gap-1">Text me at (mobile #)
                  <Input data-testid="ps-alert-phone" type="tel" placeholder="+1 928 555 0100" value={s.alert_phone || ""} onChange={(e) => set("alert_phone", e.target.value)} /></label>
                <label className="text-xs text-slate-600 flex flex-col gap-1">Also email (blank = admin BCC address)
                  <Input data-testid="ps-alert-email" type="email" placeholder="you@example.com" value={s.alert_email || ""} onChange={(e) => set("alert_email", e.target.value)} /></label>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Fires the moment a booking lands in manual review or outside the service radius, with the customer's phone so you can call right away.</p>
              <p className="text-[11px] text-slate-400 mt-1">Changes apply to new quotes only — every booking keeps a frozen copy of the inputs used.</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2 flex items-center gap-1"><Calculator className="w-3 h-3" /> Try it — preview a quote</p>
              <div className="grid grid-cols-[1fr_110px_auto] gap-2 items-end">
                <label className="text-xs text-slate-600 flex flex-col gap-1">Pickup address
                  <Input data-testid="ps-preview-address" placeholder="123 Main St, Flagstaff, AZ" value={preview.address} onChange={(e) => setPreview((p) => ({ ...p, address: e.target.value }))} /></label>
                <label className="text-xs text-slate-600 flex flex-col gap-1">AI base ($)
                  <Input data-testid="ps-preview-base" type="number" value={preview.base_price} onChange={(e) => setPreview((p) => ({ ...p, base_price: e.target.value }))} /></label>
                <Button data-testid="ps-preview-btn" onClick={runPreview} disabled={preview.loading || preview.address.length < 5} variant="outline" className="border-cyan-300 text-cyan-700 hover:bg-cyan-50 h-9">{preview.loading ? "Routing…" : "Calculate"}</Button>
              </div>
              {preview.result && <div className="mt-3"><TravelBreakdown travel={preview.result} defaultOpen /></div>}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 p-3 bg-slate-50 flex items-center gap-2">
          <Button data-testid="ps-save-btn" onClick={save} disabled={saving || !s} className="bg-cyan-600 hover:bg-cyan-700 text-white gap-1"><Save className="w-4 h-4" /> {saving ? "Saving…" : "Save settings"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PricingSettingsModal;
