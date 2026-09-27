import React, { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Save, RotateCcw, PencilLine } from "lucide-react";
import { toast } from "../../lib/toast";

const API = process.env.REACT_APP_BACKEND_URL;

// Edit a template's wording (headline, sub-headline, key lines) — no code changes.
const EmailTextEditor = ({ template, onSaved }) => {
  const [fields, setFields] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFields(null);
    fetch(`${API}/api/admin/emails/editable?template=${encodeURIComponent(template)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((d) => setFields(d.fields || []))
      .catch(() => setFields([]));
  }, [template]);

  if (fields === null) return <p className="text-xs text-slate-400 p-3">Loading text…</p>;
  if (fields.length === 0) return <p className="text-xs text-slate-400 p-3" data-testid="email-text-none">This template has no editable text (admin-only alert).</p>;

  const set = (k, v) => setFields((fs) => fs.map((f) => (f.key === k ? { ...f, value: v } : f)));

  const save = async (reset = false) => {
    setSaving(true);
    try {
      const values = reset ? {} : Object.fromEntries(fields.map((f) => [f.key, f.value]));
      const res = await fetch(`${API}/api/admin/emails/editable`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, values }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Save failed");
      if (reset) setFields((fs) => fs.map((f) => ({ ...f, value: "" })));
      toast.success(reset ? "Reset to default wording" : "Wording saved — preview refreshed");
      onSaved?.();
    } catch (e) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 space-y-3" data-testid="email-text-editor">
      <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 flex items-center gap-1"><PencilLine className="w-3.5 h-3.5" /> Edit wording</p>
      {fields.map((f) => (
        <label key={f.key} className="block text-xs text-slate-600">
          <span className="font-semibold">{f.label}</span>
          <textarea
            data-testid={`email-text-${f.key}`}
            rows={f.default.length > 80 ? 3 : 1}
            placeholder={f.default}
            value={f.value}
            onChange={(e) => set(f.key, e.target.value)}
            className="mt-1 w-full text-sm border border-slate-300 rounded-md px-2.5 py-1.5 bg-white resize-y focus:outline-none focus:ring-2 focus:ring-cyan-400 placeholder:text-slate-400"
          />
        </label>
      ))}
      <div className="flex gap-2">
        <Button data-testid="email-text-save-btn" size="sm" onClick={() => save(false)} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 text-white gap-1 flex-1">
          <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save wording"}
        </Button>
        <Button data-testid="email-text-reset-btn" size="sm" variant="outline" onClick={() => save(true)} disabled={saving} className="gap-1">
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </div>
      <p className="text-[10px] text-slate-400">Blank = use the default text shown in grey.</p>
    </div>
  );
};

export default EmailTextEditor;
