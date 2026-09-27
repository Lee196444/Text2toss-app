import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Mail, Send, Eye } from "lucide-react";
import { toast } from "../../lib/toast";
import EmailTextEditor from "./EmailTextEditor";

const API = process.env.REACT_APP_BACKEND_URL;

// Preview any email template exactly as customers receive it, and fire a test to your inbox.
const EmailPreviewModal = ({ open, onClose }) => {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState("quote_under_review");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/api/admin/emails/templates`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => { setTemplates(d.templates || []); if (!to && d.default_to) setTo(d.default_to); })
      .catch(() => setTemplates([]));
  }, [open]);

  const sendTest = async () => {
    setSending(true);
    try {
      const res = await fetch(`${API}/api/admin/emails/test`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: selected, to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Send failed");
      toast.success(`Test email sent to ${data.to}`);
    } catch (e) {
      toast.error(e.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const previewUrl = `${API}/api/admin/emails/preview?template=${encodeURIComponent(selected)}&n=${nonce}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="email-preview-modal" className="max-w-5xl w-[96vw] h-[92vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-4 pb-3 border-b bg-gradient-to-r from-cyan-600 to-cyan-500 text-white">
          <DialogTitle className="flex items-center gap-2 text-white"><Mail className="w-5 h-5" /> Email Templates — preview &amp; test send</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 min-h-0">
          <aside className="w-72 border-r bg-slate-50 overflow-y-auto flex flex-col">
            <div className="p-2 space-y-1">
              {templates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  data-testid={`email-template-${t.key}`}
                  onClick={() => setSelected(t.key)}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs ${selected === t.key ? "bg-cyan-600 text-white font-semibold" : "hover:bg-cyan-50 text-slate-700"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="border-t mt-1">
              <EmailTextEditor template={selected} onSaved={() => setNonce((n) => n + 1)} />
            </div>
          </aside>
          <section className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-2 p-3 border-b bg-white">
              <Input data-testid="email-test-to" type="email" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} className="max-w-xs h-9" />
              <Button data-testid="email-test-send-btn" onClick={sendTest} disabled={sending || !to} size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white gap-1">
                <Send className="w-4 h-4" /> {sending ? "Sending…" : "Send test to my inbox"}
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setNonce((n) => n + 1)} data-testid="email-preview-refresh-btn">
                <Eye className="w-4 h-4" /> Refresh preview
              </Button>
              <span className="text-[11px] text-slate-400 ml-auto">Sample data · rendered exactly as sent (logo, colors, greeting, footer)</span>
            </div>
            <iframe title="email preview" data-testid="email-preview-frame" src={previewUrl} className="flex-1 w-full bg-slate-100" />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmailPreviewModal;
