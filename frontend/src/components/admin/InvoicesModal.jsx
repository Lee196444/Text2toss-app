import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { X, Search, Plus, Trash2, FileText, Mail, Download, Save } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL;

const SIZE_OPTIONS = ["small", "medium", "large", "xlarge"];

/**
 * Admin Invoices modal — browse every booking, then edit customer info,
 * pricing, and line items (add/remove/edit) with a live-refreshing preview
 * pane on the right. Everything persists to the same `/invoice-data`
 * endpoint used by the read/write API.
 */
const InvoicesModal = ({ open, onClose }) => {
  const [bookings, setBookings] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [search, setSearch] = useState("");
  const [previewNonce, setPreviewNonce] = useState(0);

  const fetchBookings = async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${API}/api/admin/all-bookings`, { credentials: "include" });
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.bookings || [];
      list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setBookings(list);
    } catch (e) {
      toast.error("Couldn't load bookings");
    } finally {
      setLoadingList(false);
    }
  };

  const fetchInvoice = async (id) => {
    setLoadingInvoice(true);
    try {
      const res = await fetch(`${API}/api/admin/bookings/${id}/invoice-data`, { credentials: "include" });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      // Attach a stable client-side UID to every item so React keys survive
      // reorder / add / remove without losing input focus or state.
      data.items = (data.items || []).map((it) => ({
        _uid: (globalThis.crypto?.randomUUID?.() || `it-${Date.now()}-${Math.random()}`),
        ...it,
      }));
      setInvoice(data);
      setPreviewNonce((n) => n + 1);
    } catch (e) {
      toast.error("Couldn't load invoice");
      setInvoice(null);
    } finally {
      setLoadingInvoice(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchBookings();
      setSelectedId(null);
      setInvoice(null);
      setSearch("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const cust = b.customer_details || {};
      const hay = [
        b.id, b.name, b.email, b.phone, b.address,
        cust.name, cust.email, cust.phone, cust.address,
        b.status, b.payment_status,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [bookings, search]);

  const totalWithFees = useMemo(() => {
    if (!invoice) return 0;
    const p = invoice.pricing || {};
    return (Number(p.base_price) || 0) + (Number(p.priority_fee) || 0) + (Number(p.equipment_fee) || 0) + (Number(p.tip_amount) || 0);
  }, [invoice]);

  const patchField = (path, value) => {
    setInvoice((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] = { ...(cur[parts[i]] || {}) };
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const addItem = () => {
    setInvoice((prev) => ({
      ...prev,
      items: [...(prev.items || []), {
        _uid: (globalThis.crypto?.randomUUID?.() || `it-${Date.now()}-${Math.random()}`),
        name: "", quantity: 1, size: "medium", description: "",
      }],
    }));
  };

  const removeItem = (idx) => {
    setInvoice((prev) => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== idx),
    }));
  };

  const updateItem = (idx, field, value) => {
    setInvoice((prev) => ({
      ...prev,
      items: (prev.items || []).map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }));
  };

  const save = async () => {
    if (!invoice) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/bookings/${invoice.id}/invoice-data`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: invoice.customer,
          pricing: invoice.pricing,
          // Strip the client-side `_uid` before sending — backend never sees it.
          items: (invoice.items || []).map(({ _uid, ...rest }) => rest),
          pickup_date: invoice.pickup_date,
          payment_status: invoice.payment_status,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Invoice updated");
      setPreviewNonce((n) => n + 1);
      fetchBookings(); // refresh list totals in case name/email changed
    } catch (e) {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const emailInvoice = async () => {
    if (!invoice) return;
    setEmailing(true);
    try {
      const res = await fetch(`${API}/api/admin/bookings/${invoice.id}/invoice/email`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Emailed to ${data.to_email}`);
      } else {
        toast.error(data.detail || "Send failed");
      }
    } catch (e) {
      toast.error("Network error");
    } finally {
      setEmailing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose && onClose()}>
      <DialogContent
        className="max-w-[96vw] w-[96vw] h-[92vh] p-0 overflow-hidden flex flex-col bg-white"
        data-testid="invoices-modal"
      >
        <DialogHeader className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-600" /> Invoices
            </DialogTitle>
            <button
              onClick={onClose}
              data-testid="invoices-close-btn"
              className="p-1.5 hover:bg-slate-200 rounded-md"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[280px_1fr_1fr] overflow-hidden">
          {/* LEFT: booking list */}
          <div className="border-r border-slate-200 flex flex-col overflow-hidden bg-slate-50">
            <div className="p-2 border-b border-slate-200 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  data-testid="invoices-search"
                  className="pl-8 h-9 text-sm"
                  placeholder="Search name, email, phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingList ? (
                <p className="text-xs text-slate-400 p-3">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-slate-400 p-3">No bookings match.</p>
              ) : (
                filtered.map((b) => {
                  const cust = b.customer_details || {};
                  const name = cust.name || b.name || cust.email || b.email || "Customer";
                  const price = b.approved_price ?? b.total_price ?? b.adjusted_price ?? b.original_price ?? 0;
                  const isActive = selectedId === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setSelectedId(b.id);
                        fetchInvoice(b.id);
                      }}
                      data-testid={`invoice-list-item-${b.id}`}
                      className={`w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-cyan-50 transition-colors ${isActive ? "bg-cyan-100 border-l-4 border-l-cyan-500" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900 truncate">{name}</span>
                        <span className="text-xs font-mono text-cyan-700 whitespace-nowrap">${Number(price).toFixed(0)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-500 truncate">#{b.id.slice(0, 8).toUpperCase()}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${b.payment_status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{b.payment_status || "unpaid"}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* MIDDLE: editor */}
          <div className="border-r border-slate-200 flex flex-col overflow-hidden">
            {!invoice ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-8 text-center">
                {loadingInvoice ? "Loading…" : "Select an invoice from the list to edit."}
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 mb-2">Customer</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input data-testid="inv-customer-name" placeholder="Name" value={invoice.customer.name} onChange={(e) => patchField("customer.name", e.target.value)} />
                      <Input data-testid="inv-customer-phone" placeholder="Phone" value={invoice.customer.phone} onChange={(e) => patchField("customer.phone", e.target.value)} />
                      <Input data-testid="inv-customer-email" placeholder="Email" value={invoice.customer.email} onChange={(e) => patchField("customer.email", e.target.value)} className="col-span-2" />
                      <Input data-testid="inv-customer-address" placeholder="Address" value={invoice.customer.address} onChange={(e) => patchField("customer.address", e.target.value)} className="col-span-2" />
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 mb-2">Pricing</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-slate-600 col-span-2 flex flex-col gap-1">
                        Base price ($)
                        <Input data-testid="inv-base-price" type="number" step="0.01" value={invoice.pricing.base_price} onChange={(e) => patchField("pricing.base_price", parseFloat(e.target.value) || 0)} />
                      </label>
                      <label className="text-xs text-slate-600 flex flex-col gap-1">
                        Priority fee
                        <Input data-testid="inv-priority-fee" type="number" step="0.01" value={invoice.pricing.priority_fee} onChange={(e) => patchField("pricing.priority_fee", parseFloat(e.target.value) || 0)} />
                      </label>
                      <label className="text-xs text-slate-600 flex flex-col gap-1">
                        Equipment fee
                        <Input data-testid="inv-equipment-fee" type="number" step="0.01" value={invoice.pricing.equipment_fee} onChange={(e) => patchField("pricing.equipment_fee", parseFloat(e.target.value) || 0)} />
                      </label>
                      <label className="text-xs text-slate-600 col-span-2 flex flex-col gap-1">
                        Tip
                        <Input data-testid="inv-tip-amount" type="number" step="0.01" value={invoice.pricing.tip_amount} onChange={(e) => patchField("pricing.tip_amount", parseFloat(e.target.value) || 0)} />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                      <span className="text-xs uppercase font-bold text-slate-500">Grand total</span>
                      <span className="text-lg font-black text-cyan-700 font-mono" data-testid="inv-grand-total">${totalWithFees.toFixed(2)}</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600 mb-2">Watermark</p>
                    <label className="text-xs text-slate-600 flex flex-col gap-1">
                      Show &quot;PAID&quot; watermark across invoice
                      <select
                        data-testid="inv-payment-status"
                        value={invoice.payment_status || "unpaid"}
                        onChange={(e) => patchField("payment_status", e.target.value)}
                        className="h-9 text-sm border border-slate-300 rounded-md px-2 bg-white"
                      >
                        <option value="paid">✓ PAID — show diagonal watermark</option>
                        <option value="unpaid">Unpaid — no watermark</option>
                        <option value="refunded">Refunded — no watermark</option>
                        <option value="cancelled">Cancelled — no watermark</option>
                      </select>
                    </label>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-600">Line items</p>
                      <Button data-testid="inv-add-item-btn" size="sm" variant="outline" onClick={addItem} className="h-7 gap-1 text-xs border-cyan-300 text-cyan-700 hover:bg-cyan-50">
                        <Plus className="w-3.5 h-3.5" /> Add item
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {(invoice.items || []).map((it, idx) => (
                        <div key={it._uid || idx} data-testid={`inv-item-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5">
                          <div className="flex items-start gap-2">
                            <Input data-testid={`inv-item-name-${idx}`} placeholder="Item name" value={it.name} onChange={(e) => updateItem(idx, "name", e.target.value)} className="flex-1 h-8 text-sm" />
                            <Input data-testid={`inv-item-qty-${idx}`} type="number" min="1" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} className="w-16 h-8 text-sm" />
                            <select data-testid={`inv-item-size-${idx}`} value={it.size} onChange={(e) => updateItem(idx, "size", e.target.value)} className="w-24 h-8 text-sm border border-slate-300 rounded-md px-1.5 bg-white">
                              {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button data-testid={`inv-item-remove-${idx}`} onClick={() => removeItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md flex-shrink-0" aria-label="Remove item">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <Input data-testid={`inv-item-desc-${idx}`} placeholder="Description (optional)" value={it.description || ""} onChange={(e) => updateItem(idx, "description", e.target.value)} className="h-7 text-xs" />
                        </div>
                      ))}
                      {(invoice.items || []).length === 0 && (
                        <p className="text-xs text-slate-400 italic text-center py-3">No line items yet — click &quot;Add item&quot; to start.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 p-3 bg-slate-50 flex items-center gap-2 flex-wrap">
                  <Button data-testid="inv-save-btn" onClick={save} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 text-white gap-1">
                    <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save changes"}
                  </Button>
                  <Button data-testid="inv-email-btn" onClick={emailInvoice} disabled={emailing || !invoice.customer.email} variant="outline" className="gap-1 border-cyan-300 text-cyan-700 hover:bg-cyan-50">
                    <Mail className="w-4 h-4" /> {emailing ? "Sending…" : "Email invoice"}
                  </Button>
                  <a data-testid="inv-pdf-btn" href={`${API}/api/admin/bookings/${invoice.id}/invoice.pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md border border-cyan-300 text-cyan-700 hover:bg-cyan-50">
                    <Download className="w-4 h-4" /> PDF
                  </a>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: preview */}
          <div className="hidden md:flex flex-col overflow-hidden bg-slate-100">
            <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Live preview</span>
              {invoice && <span className="text-[10px] text-slate-400">Refreshes after Save</span>}
            </div>
            {invoice ? (
              <iframe
                key={`preview-${invoice.id}-${previewNonce}`}
                title="Invoice preview"
                src={`${API}/api/admin/bookings/${invoice.id}/invoice`}
                className="flex-1 bg-white"
                data-testid="invoice-preview-frame"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select an invoice to preview.</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoicesModal;
