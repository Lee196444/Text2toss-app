import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toast } from "../../lib/toast";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const EMPTY_DRAFT = {
  customer_name: "",
  location: "",
  rating: 5,
  body: "",
  is_published: true,
  display_order: 0,
};

/**
 * ReviewsModal — admin CRUD for landing-page testimonials.
 * Props: { open, onClose }
 */
export default function ReviewsModal({ open, onClose }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/admin/reviews`, { withCredentials: true });
      setReviews(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error("Couldn't load reviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  const startEdit = (r) => {
    setEditingId(r.id);
    setDraft({
      customer_name: r.customer_name || "",
      location: r.location || "",
      rating: r.rating || 5,
      body: r.body || "",
      is_published: r.is_published !== false,
      display_order: r.display_order || 0,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  };

  const save = async () => {
    if (!draft.customer_name.trim() || !draft.body.trim()) {
      toast.error("Customer name and review body are required");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await axios.patch(`${API}/admin/reviews/${editingId}`, draft, { withCredentials: true });
        toast.success("Review updated");
      } else {
        await axios.post(`${API}/admin/reviews`, draft, { withCredentials: true });
        toast.success("Review added");
      }
      cancelEdit();
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (r) => {
    try {
      await axios.patch(
        `${API}/admin/reviews/${r.id}`,
        { is_published: !r.is_published },
        { withCredentials: true },
      );
      await load();
    } catch (e) {
      toast.error("Couldn't update review");
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete review from ${r.customer_name}?`)) return;
    try {
      await axios.delete(`${API}/admin/reviews/${r.id}`, { withCredentials: true });
      toast.success("Review deleted");
      await load();
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-stretch sm:items-start justify-center sm:p-4 sm:pt-8 overflow-y-auto"
      data-testid="reviews-modal"
    >
      <div className="bg-white w-full max-w-3xl rounded-none sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header */}
        <div className="bg-black text-white px-5 py-4 flex items-center justify-between sticky top-0">
          <div>
            <h2 className="text-lg font-display italic uppercase tracking-wider text-lime-400">
              ⭐ Customer Reviews
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Curate testimonials that appear on the landing page.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
            data-testid="reviews-modal-close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-5">
          {/* Editor */}
          <Card className="border-2 border-lime-300">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display italic uppercase tracking-wider text-sm text-gray-700">
                  {editingId ? "Edit review" : "Add a new review"}
                </h3>
                {editingId && (
                  <button
                    onClick={cancelEdit}
                    className="text-xs text-gray-500 hover:text-gray-900 underline"
                    data-testid="reviews-cancel-edit"
                  >
                    Cancel edit
                  </button>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <Input
                  placeholder="Customer name (e.g. Sarah M.)"
                  value={draft.customer_name}
                  onChange={(e) => setDraft({ ...draft, customer_name: e.target.value })}
                  data-testid="reviews-name-input"
                />
                <Input
                  placeholder="Location (e.g. Flagstaff, AZ)"
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  data-testid="reviews-location-input"
                />
              </div>

              <Textarea
                placeholder="What the customer said..."
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={3}
                data-testid="reviews-body-input"
              />

              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Rating</label>
                  <div className="flex gap-1 mt-1" data-testid="reviews-rating-picker">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setDraft({ ...draft, rating: n })}
                        className={`text-2xl leading-none ${
                          n <= draft.rating ? "text-lime-500" : "text-gray-300"
                        }`}
                        data-testid={`reviews-star-${n}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">
                    Display order
                  </label>
                  <Input
                    type="number"
                    value={draft.display_order}
                    onChange={(e) =>
                      setDraft({ ...draft, display_order: parseInt(e.target.value, 10) || 0 })
                    }
                    data-testid="reviews-order-input"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.is_published}
                    onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
                    className="w-4 h-4 accent-lime-500"
                    data-testid="reviews-published-checkbox"
                  />
                  <span className="text-gray-700">Published</span>
                </label>
              </div>

              <Button
                onClick={save}
                disabled={saving}
                className="w-full bg-black text-lime-400 hover:bg-gray-900 font-display italic uppercase tracking-wider"
                data-testid="reviews-save-btn"
              >
                {saving ? "Saving..." : editingId ? "Update review" : "Add review"}
              </Button>
            </CardContent>
          </Card>

          {/* List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display italic uppercase tracking-wider text-sm text-gray-700">
                All reviews ({reviews.length})
              </h3>
              {loading && (
                <span className="text-xs text-gray-400">Loading...</span>
              )}
            </div>

            {!loading && reviews.length === 0 && (
              <p className="text-sm text-gray-500 italic text-center py-6">
                No reviews yet — add your first one above.
              </p>
            )}

            <div className="space-y-3">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className={`border rounded-xl p-4 ${
                    r.is_published ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50 opacity-70"
                  }`}
                  data-testid={`reviews-list-item-${r.id}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">
                          {r.customer_name}
                        </span>
                        {r.location && (
                          <span className="text-xs text-gray-400">
                            · {r.location}
                          </span>
                        )}
                        <span className="text-lime-500 text-sm">
                          {"★".repeat(r.rating)}
                          <span className="text-gray-300">
                            {"★".repeat(5 - r.rating)}
                          </span>
                        </span>
                        {!r.is_published && (
                          <span className="text-[10px] uppercase tracking-wider bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                            Hidden
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{r.body}</p>
                      <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
                        Order: {r.display_order || 0}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(r)}
                      data-testid={`reviews-edit-${r.id}`}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => togglePublish(r)}
                      data-testid={`reviews-toggle-${r.id}`}
                    >
                      {r.is_published ? "Hide" : "Publish"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => remove(r)}
                      className="ml-auto text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                      data-testid={`reviews-delete-${r.id}`}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
