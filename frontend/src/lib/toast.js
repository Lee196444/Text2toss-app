// Shared toast helper. Routes through the global window.showToast set up in App.js.
// In production this is always defined; the silent no-op fallbacks below mean we
// never spam the console even in edge cases (SSR, tests, etc).
export const toast = {
  success: (m) => {
    if (typeof window !== "undefined" && typeof window.showToast === "function") {
      window.showToast("success", m);
    }
  },
  error: (m) => {
    if (typeof window !== "undefined" && typeof window.showToast === "function") {
      window.showToast("error", m);
    }
  }
};
