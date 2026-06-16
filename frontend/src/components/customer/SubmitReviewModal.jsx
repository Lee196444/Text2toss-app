import React, { useState } from "react";
import axios from "axios";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toast } from "../../lib/toast";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const EMPTY = {
  customer_name: "",
  location: "",
  email: "",
  rating: 5,
  body: "",
};

/**
 * SubmitReviewModal — public customer testimonial form.
 * Posts to /api/reviews/submit (review lands in admin queue, unpublished).
 * Props: { open, onClose }
 */
export default function SubmitReviewModal({ open, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const reset = () => {
    setForm(EMPTY);
    setDone(false);
  };

  const close = () => {
    onClose?.();
    setTimeout(reset, 250);
  };

  const submit = async () => {
    if (!form.customer_name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    if (form.body.trim().length < 10) {
      toast.error("Please write at least 10 characters");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/reviews/submit`, {
        customer_name: form.customer_name,
        location: form.location || null,
        rating: form.rating,
        body: form.body,
        email: form.email || null,
      });
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Submission failed — try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch sm:items-center justify-center sm:p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && close()}
      data-testid="submit-review-modal"
    >
      <div className="bg-white w-full max-w-lg rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header */}
        <div className="bg-black text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display italic uppercase tracking-wider text-lime-400">
              Leave a Review
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Share your experience — we&apos;ll review it before posting.
            </p>
          </div>
          <button
            onClick={close}
            className="text-gray-400 hover:text-white text-2xl leading-none px-2"
            data-testid="submit-review-close"
          >
            ×
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-4 flex-1 flex flex-col items-center justify-center">
            <div className="text-6xl">🙌</div>
            <h3 className="text-2xl font-display italic text-black">
              Thanks for the kind words!
            </h3>
            <p className="text-gray-600 text-sm max-w-sm">
              Your review is queued for our team to look over. Once approved,
              it&apos;ll appear on the landing page for everyone to see.
            </p>
            <Button
              onClick={close}
              className="bg-black text-lime-400 hover:bg-gray-900 font-display italic uppercase tracking-wider mt-2"
              data-testid="submit-review-done-btn"
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
            {/* Star picker — big and tappable */}
            <div className="text-center">
              <label className="text-xs text-gray-500 uppercase tracking-wider">
                Your rating
              </label>
              <div className="flex justify-center gap-2 mt-2" data-testid="submit-rating-picker">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm({ ...form, rating: n })}
                    className={`text-4xl leading-none transition-transform active:scale-90 ${
                      n <= form.rating ? "text-lime-500" : "text-gray-300 hover:text-lime-200"
                    }`}
                    data-testid={`submit-star-${n}`}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">
                  Your name *
                </label>
                <Input
                  placeholder="Sarah M."
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="mt-1"
                  data-testid="submit-review-name"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider">
                  Location
                </label>
                <Input
                  placeholder="Flagstaff, AZ"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="mt-1"
                  data-testid="submit-review-location"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">
                Email (private — for follow-up only)
              </label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1"
                data-testid="submit-review-email"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">
                Your review *
              </label>
              <Textarea
                rows={5}
                placeholder="How did the crew do? What stood out?"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="mt-1"
                maxLength={1000}
                data-testid="submit-review-body"
              />
              <div className="text-[10px] text-gray-400 text-right mt-1">
                {form.body.length}/1000
              </div>
            </div>

            <Button
              onClick={submit}
              disabled={submitting}
              className="w-full bg-lime-400 hover:bg-lime-500 text-black font-display italic uppercase tracking-wider text-base py-6 shadow-lg shadow-lime-400/30"
              data-testid="submit-review-btn"
            >
              {submitting ? "Sending..." : "Submit Review"}
            </Button>

            <p className="text-[11px] text-gray-400 text-center">
              By submitting, you agree your first name + initial may be shown on
              our website. Email stays private.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
