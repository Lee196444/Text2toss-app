import React, { useState, useMemo } from "react";
import { buildImageUrl } from "./bucketShared";

/**
 * Compact photo carousel for admin bucket cards.
 *
 * - Accepts an array of stored paths (legacy disk OR new storage keys).
 * - Renders one image at a time with left/right arrows, a dot indicator,
 *   and a "N / M" counter badge.
 * - Click/tap the image to open it full-size in a new tab.
 * - Gracefully falls back to a single-image render when only one path is
 *   given, and to a "No photo" placeholder when zero are given.
 * - Same aspect / height as the previous single <img> so the card layout
 *   does not shift.
 */
const PhotoCarousel = ({
  paths,
  alt = "Customer photo",
  heightClass = "h-32",
  testId = "photo-carousel",
}) => {
  const urls = useMemo(
    () => (paths || []).map(buildImageUrl).filter(Boolean),
    [paths],
  );
  const [idx, setIdx] = useState(0);

  if (urls.length === 0) {
    return (
      <div
        className={`w-full ${heightClass} rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-400`}
        data-testid={`${testId}-empty`}
      >
        No photo
      </div>
    );
  }

  const safeIdx = Math.min(idx, urls.length - 1);
  const go = (delta) => setIdx((urls.length + safeIdx + delta) % urls.length);

  return (
    <div className={`relative w-full ${heightClass}`} data-testid={testId}>
      <img
        src={urls[safeIdx]}
        alt={`${alt} ${safeIdx + 1} of ${urls.length}`}
        className={`w-full ${heightClass} object-cover rounded-lg border cursor-pointer hover:opacity-90 transition-opacity`}
        onClick={(e) => {
          e.stopPropagation();
          window.open(urls[safeIdx], "_blank");
        }}
        onError={(e) => {
          e.target.style.visibility = "hidden";
        }}
      />

      {urls.length > 1 && (
        <>
          {/* Prev / Next buttons */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Previous photo"
            data-testid={`${testId}-prev`}
            className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white text-sm flex items-center justify-center shadow-sm"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Next photo"
            data-testid={`${testId}-next`}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white text-sm flex items-center justify-center shadow-sm"
          >
            ›
          </button>

          {/* "N / M" counter */}
          <div className="absolute top-1 right-1 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full pointer-events-none">
            {safeIdx + 1} / {urls.length}
          </div>

          {/* Dot indicator */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
            {urls.map((_, i) => (
              <span
                key={`${testId}-dot-${i}`}
                className={`block w-1.5 h-1.5 rounded-full ${i === safeIdx ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PhotoCarousel;
