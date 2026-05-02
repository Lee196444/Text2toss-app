import React from "react";
import { Input } from "../ui/input";
import { useSharedFilter } from "./FilterContext";

/**
 * Shared input bound to the sticky admin filter (context + localStorage).
 * Shows a small "✕ clear" button when a value is present, and a "📌 Sticky"
 * hint so operators know the search term persists across every bucket modal
 * and survives page reloads.
 */
const StickyFilterInput = ({ placeholder = "Search…", testId = "sticky-filter-input", className = "" }) => {
  const [filter, setFilter] = useSharedFilter();
  const hasValue = Boolean(filter && filter.trim());

  return (
    <div className={`relative ${className}`}>
      <Input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full pr-28"
      />
      {hasValue && (
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          <span
            className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full"
            title="This search stays in place across every bucket and browser reload."
          >
            📌 Sticky
          </span>
          <button
            type="button"
            onClick={() => setFilter("")}
            data-testid={`${testId}-clear`}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Clear filter"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default StickyFilterInput;
