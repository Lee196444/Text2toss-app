// Shared helpers for marketing modal pieces.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;
export const QR_URL = `${API}/images/quote_images/text2toss_branded_qr.jpg`;

export const detectTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const urlBase64ToUint8Array = (b64) => {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const ensureNotificationPermission = async () => {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    return (await Notification.requestPermission()) === "granted";
  }
  return false;
};

export const buildCaption = ({ deal_active, deal_text }) => {
  const dealLine = deal_active && deal_text ? `🔥 ${deal_text}\n\n` : "";
  return (
`${dealLine}📱 Got junk? Just text us!

Text2Toss makes junk removal effortless — snap a photo, get an instant AI quote, and we haul it away. Fast. Easy. Hassle Free.

✅ Free instant quotes
✅ Same-day pickup available
✅ Flagstaff, Arizona

📲 Scan the QR or visit tinyurl.com/text2toss

#Text2Toss #JunkRemoval #FlagstaffAZ #Arizona #DeclutterYourLife #JunkBeGone #LocalBusiness #SmallBusiness`
  );
};
