import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

// Sticky filter shared across every admin "bucket" modal. The current search
// term lives in React context and is mirrored to localStorage so it survives
// reloads. Type a phone number once and every modal you open filters on it.

const STORAGE_KEY = "text2toss:admin:shared-filter";

const FilterContext = createContext(null);

const readInitial = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

export const FilterProvider = ({ children }) => {
  const [filter, setFilterState] = useState(readInitial);

  const setFilter = useCallback((next) => {
    // Accept either a string or an updater function (same contract as useState).
    setFilterState((prev) => {
      const value = typeof next === "function" ? next(prev) : next || "";
      try {
        window.localStorage.setItem(STORAGE_KEY, value);
      } catch (err) {
        // storage may be unavailable (private mode) — non-fatal
        console.debug("FilterContext localStorage.setItem failed:", err);
      }
      return value;
    });
  }, []);

  // Sync across tabs in case the operator has the admin open in two windows.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === STORAGE_KEY) setFilterState(e.newValue || "");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <FilterContext.Provider value={{ filter, setFilter }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useSharedFilter = () => {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    // Safe default when used outside a provider (e.g., tests).
    return ["", () => {}];
  }
  return [ctx.filter, ctx.setFilter];
};
