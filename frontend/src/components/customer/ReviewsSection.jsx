import React, { useEffect, useState } from "react";
import axios from "axios";
import SubmitReviewModal from "./SubmitReviewModal";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

/**
 * ReviewsSection — admin-curated customer testimonials shown on the landing page.
 * Loads /api/reviews (public, only published). Hides itself if no reviews exist.
 */
export default function ReviewsSection() {
  const [reviews, setReviews] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API}/reviews`)
      .then((res) => {
        if (!cancelled) setReviews(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!reviews || reviews.length === 0) return null;

  return (
    <section
      id="reviews"
      className="relative py-14 sm:py-20 bg-white overflow-hidden border-t border-gray-100"
      data-testid="reviews-section"
    >
      {/* Soft lime grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #84cc16 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4">
        <div className="text-center mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <svg
                key={i}
                className="w-5 h-5 fill-lime-500"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-black uppercase tracking-tight italic">
            What Arizona&apos;s <span className="text-lime-500">saying</span>
          </h2>
          <p className="mt-2 text-base text-gray-500">
            Real reviews from real neighbors.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>

        <div className="mt-10 text-center flex flex-col sm:flex-row gap-3 justify-center items-center">
          <button
            type="button"
            onClick={() => setShowSubmit(true)}
            className="inline-flex items-center gap-2 bg-lime-400 hover:bg-lime-500 text-black px-6 py-3 rounded-full font-display italic uppercase tracking-wider text-sm shadow-lg shadow-lime-400/30 transition-all active:scale-95"
            data-testid="reviews-share-story-btn"
          >
            <span className="text-base">✍️</span>
            Share your story
          </button>
          <a
            href="https://g.page/r/CaN7_KQsxQCdEAE/review"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-black text-lime-400 hover:bg-gray-900 px-6 py-3 rounded-full font-display italic uppercase tracking-wider text-sm shadow-lg shadow-lime-400/20 transition-all"
            data-testid="reviews-leave-google-btn"
          >
            <svg
              className="w-4 h-4 fill-lime-400"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Leave us a Google review
          </a>
        </div>
      </div>

      <SubmitReviewModal open={showSubmit} onClose={() => setShowSubmit(false)} />
    </section>
  );
}

function ReviewCard({ review }) {
  const initials = (review.customer_name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const stars = Math.max(1, Math.min(5, review.rating || 5));

  return (
    <div
      className="group relative bg-white border-2 border-gray-100 hover:border-lime-300 hover:shadow-xl hover:shadow-lime-400/10 rounded-2xl p-6 transition-all duration-300"
      data-testid={`review-card-${review.id}`}
    >
      {/* Big opening quote */}
      <div className="absolute -top-3 -left-1 text-6xl font-serif text-lime-300 leading-none select-none">
        &ldquo;
      </div>

      <div className="flex items-center gap-1 mb-3 pl-4">
        {[...Array(stars)].map((_, i) => (
          <svg key={i} className="w-4 h-4 fill-lime-500" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>

      <p className="text-gray-700 text-sm sm:text-base leading-relaxed mb-5 pl-4">
        {review.body}
      </p>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
        <div className="w-10 h-10 rounded-full bg-black text-lime-400 flex items-center justify-center font-display italic text-sm">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display italic text-base text-black truncate">
            {review.customer_name}
          </div>
          {review.location && (
            <div className="text-[11px] uppercase tracking-widest text-gray-400 truncate">
              {review.location}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
