import React, { useEffect, useState } from "react";

const DISMISS_KEY = "t2t_a2hs_dismissed_until";
const DISMISS_DAYS = 7;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function detectPlatform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function isMobile() {
  const p = detectPlatform();
  return p === "ios" || p === "android";
}

function isDismissed() {
  try {
    const until = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    return Date.now() < until;
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
  } catch {
    /* ignore */
  }
}

/**
 * Friendly "Add to Home Screen" banner.
 * - Hides when already installed (standalone) or recently dismissed.
 * - On Android/Chrome: uses beforeinstallprompt for one-tap install.
 * - On iOS: shows visual instructions (Share → Add to Home Screen).
 */
export default function AddToHomeScreenPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState("other");
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    if (isStandalone() || isDismissed() || !isMobile()) return;

    const p = detectPlatform();
    setPlatform(p);

    if (p === "ios") {
      // iOS has no install event — show banner directly.
      setShow(true);
      return;
    }

    // Android: wait for the install event.
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show) return null;

  const handleDismiss = () => {
    setDismissed();
    setShow(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
    if (outcome !== "accepted") setDismissed();
  };

  return (
    <div
      className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm"
      data-testid="a2hs-prompt"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-md">
          T2T
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-900">
            Save Text2toss to your Home Screen
          </p>
          <p className="text-xs text-emerald-700/80 mt-0.5 leading-relaxed">
            One-tap quotes next time. No app store, no signup.
          </p>

          {platform === "ios" ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-800">
              <span>Tap</span>
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white border border-emerald-200"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 4v12" strokeLinecap="round" />
                  <path d="m7 9 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" strokeLinecap="round" />
                </svg>
              </span>
              <span>then</span>
              <span className="font-semibold">Add to Home Screen</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleInstall}
              data-testid="a2hs-install-btn"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 transition"
            >
              Install app
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          data-testid="a2hs-dismiss-btn"
          className="shrink-0 w-7 h-7 rounded-full text-emerald-700/60 hover:text-emerald-900 hover:bg-emerald-100 flex items-center justify-center text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
