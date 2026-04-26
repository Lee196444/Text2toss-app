import React, { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const toast = {
  success: (m) => (window.showToast ? window.showToast("success", m) : console.log("SUCCESS:", m)),
  error: (m) => (window.showToast ? window.showToast("error", m) : console.log("ERROR:", m))
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const QR_URL = `${API}/images/quote_images/text2toss_branded_qr.jpg`;

axios.defaults.withCredentials = true;

const detectTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const urlBase64ToUint8Array = (b64) => {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const ensureNotificationPermission = async () => {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    return (await Notification.requestPermission()) === "granted";
  }
  return false;
};

const MarketingQRModal = ({ open, onClose }) => {
  const [stats, setStats] = useState({ this_week: 0, total: 0, by_channel: {} });
  const [settings, setSettings] = useState({
    deal_text: "",
    deal_active: false,
    reminder_enabled: false,
    reminder_hour: 10,
    timezone: detectTimezone()
  });
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState({ subscriptions: 0, last_event: null, last_daily: null });

  // Load stats + settings whenever the modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [s, c, h] = await Promise.all([
          axios.get(`${API}/admin/marketing/stats`),
          axios.get(`${API}/admin/marketing/settings`),
          axios.get(`${API}/admin/push/health`)
        ]);
        setStats(s.data || { this_week: 0, total: 0, by_channel: {} });
        setSettings({
          deal_text: c.data?.deal_text ?? "",
          deal_active: !!c.data?.deal_active,
          reminder_enabled: !!c.data?.reminder_enabled,
          reminder_hour: c.data?.reminder_hour ?? 10,
          timezone: c.data?.timezone || detectTimezone()
        });
        setHealth(h.data || { subscriptions: 0, last_event: null, last_daily: null });
      } catch { /* silent */ }
    })();
  }, [open]);

  const refreshStats = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/marketing/stats`);
      setStats(data);
    } catch { /* silent */ }
  };

  const logShareEvent = async (channel) => {
    try {
      await axios.post(`${API}/admin/marketing/share-event`, { channel });
      await refreshStats();
    } catch { /* silent */ }
  };

  const buildCaption = () => {
    const dealLine = settings.deal_active && settings.deal_text
      ? `🔥 ${settings.deal_text}\n\n` : "";
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

  const downloadQR = async () => {
    try {
      const res = await fetch(QR_URL);
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "Text2Toss-QR-Code.jpg";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      logShareEvent("download");
      toast.success("QR Code downloaded!");
    } catch {
      toast.error("Failed to download QR code");
    }
  };

  const sharePost = async () => {
    const caption = buildCaption();
    try {
      const res = await fetch(QR_URL);
      const blob = await res.blob();
      const file = new File([blob], "Text2Toss-QR.jpg", { type: blob.type || "image/jpeg" });
      const payload = { title: "Text2Toss — Junk Removal", text: caption, files: [file] };
      if (navigator.canShare && navigator.canShare(payload) && navigator.share) {
        await navigator.share(payload);
        logShareEvent("native");
        toast.success("Share sheet opened!");
        return;
      }
      try { await navigator.clipboard.writeText(caption); toast.success("Caption copied! Downloading QR — paste & attach in your post."); }
      catch { toast.error("Could not copy caption. Downloading QR instead."); }
      await downloadQR();
    } catch (err) {
      if (err && err.name === "AbortError") return;
      toast.error("Share failed. Downloaded QR + copied caption as fallback.");
      try { await navigator.clipboard.writeText(caption); } catch { /* ignore */ }
      await downloadQR();
    }
  };

  const shareToFacebook = () => {
    const url = encodeURIComponent("https://tinyurl.com/text2toss");
    const quote = encodeURIComponent(buildCaption());
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${quote}`,
      "_blank", "noopener,noreferrer,width=600,height=600"
    );
    logShareEvent("facebook");
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(buildCaption());
      logShareEvent("copy");
      toast.success("Caption copied to clipboard!");
    } catch {
      toast.error("Could not copy caption");
    }
  };

  const enableBackgroundPush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Background push is not supported in this browser.");
      return false;
    }
    try {
      const reg = await navigator.serviceWorker.register("/service-worker.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const { data } = await axios.get(`${API}/push/vapid-public-key`);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.publicKey)
        });
      }
      const json = sub.toJSON();
      await axios.post(`${API}/admin/push/subscribe`, {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
      });
      return true;
    } catch (err) {
      toast.error("Could not enable background push: " + (err.message || err));
      return false;
    }
  };

  const disableBackgroundPush = async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) {
        const json = sub.toJSON();
        await axios.post(`${API}/admin/push/unsubscribe`, {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }
        });
        await sub.unsubscribe();
      }
    } catch { /* silent */ }
  };

  const sendTestPush = async () => {
    try {
      const { data } = await axios.post(`${API}/admin/push/send-test`);
      if (data.sent > 0) toast.success(`Test push sent to ${data.sent} device(s)`);
      else if (data.subscriptions === 0) toast.error("No devices subscribed yet — enable the reminder first.");
      else toast.error("Push delivery failed. Check browser permissions.");
      await refreshHealth();
    } catch {
      toast.error("Could not send test push");
    }
  };

  const refreshHealth = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/push/health`);
      setHealth(data);
    } catch { /* silent */ }
  };

  const resubscribeDevice = async () => {
    await disableBackgroundPush();
    const ok = await enableBackgroundPush();
    if (ok) {
      toast.success("This device has been resubscribed.");
      await refreshHealth();
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload = { ...settings, timezone: settings.timezone || detectTimezone() };
      const { data } = await axios.post(`${API}/admin/marketing/settings`, payload);
      setSettings({
        deal_text: data.deal_text ?? "",
        deal_active: !!data.deal_active,
        reminder_enabled: !!data.reminder_enabled,
        reminder_hour: data.reminder_hour ?? 10,
        timezone: data.timezone || detectTimezone()
      });
      toast.success("Marketing settings saved");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const onReminderToggle = async (enabled) => {
    if (enabled) {
      const ok = await ensureNotificationPermission();
      if (!ok) {
        toast.error("Browser notifications are blocked. Allow them to receive reminders.");
        return;
      }
      const subscribed = await enableBackgroundPush();
      if (!subscribed) return;
    } else {
      await disableBackgroundPush();
    }
    setSettings({ ...settings, reminder_enabled: enabled });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-white shadow-2xl max-h-[95vh] overflow-y-auto">
        <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl flex items-center gap-2">
              📱 Marketing QR Code
            </CardTitle>
            <Button onClick={onClose} className="bg-white/20 hover:bg-white/30 text-white border-0" size="sm">
              ✕ Close
            </Button>
          </div>
          <CardDescription className="text-white/90 mt-2">
            Scan this QR code to visit tinyurl.com/text2toss
          </CardDescription>
        </CardHeader>

        <CardContent className="p-8">
          <div className="space-y-6">
            {/* QR */}
            <div className="flex flex-col items-center">
              <div className="bg-black p-4 rounded-xl shadow-lg border-4 border-emerald-500">
                <img
                  src={QR_URL}
                  alt="Text2Toss Branded QR Code"
                  data-testid="marketing-qr-image"
                  className="w-80 h-80 object-contain"
                />
              </div>
              <p className="text-center mt-4 text-gray-700 font-medium">
                Scan to visit: <span className="text-emerald-600 font-bold">tinyurl.com/text2toss</span>
              </p>

              {/* Share buttons */}
              <div className="w-full mt-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200 p-5">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">📣</span>
                  <div>
                    <h4 className="font-bold text-emerald-900">Share to Social</h4>
                    <p className="text-xs text-emerald-800/80">
                      Pre-filled caption + QR image. Tap once to post to Instagram, Facebook, or anywhere.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button onClick={sharePost} data-testid="share-marketing-post-btn"
                    className="bg-gradient-to-r from-fuchsia-500 via-rose-500 to-amber-500 hover:opacity-90 text-white font-semibold py-5 shadow-md">
                    📲 Share Post
                  </Button>
                  <Button onClick={shareToFacebook} data-testid="share-facebook-btn"
                    className="bg-[#1877F2] hover:bg-[#1462c4] text-white font-semibold py-5 shadow-md">
                    f  Facebook
                  </Button>
                  <Button onClick={copyCaption} data-testid="copy-caption-btn"
                    className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 font-semibold py-5 shadow-sm">
                    📋 Copy Caption
                  </Button>
                </div>
                <p className="mt-3 text-[11px] text-emerald-900/70">
                  Tip: on phones, "Share Post" opens your native share sheet so you can post directly to Instagram Stories, Reels, Messages, or any installed app.
                </p>
              </div>

              {/* Marketing — stats + deal + reminder */}
              <div className="w-full mt-6 bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-xl border border-purple-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h4 className="font-bold text-purple-900 flex items-center gap-2">📈 Marketing</h4>
                    <p className="text-xs text-purple-800/80">
                      Track your share activity, set a deal, and schedule a daily reminder.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div data-testid="share-count-week" className="bg-white rounded-lg px-3 py-2 shadow-sm border border-purple-100 text-center min-w-[70px]">
                      <div className="text-[10px] uppercase tracking-wide text-purple-600 font-semibold">This week</div>
                      <div className="text-lg font-bold text-purple-900">{stats.this_week}</div>
                    </div>
                    <div data-testid="share-count-total" className="bg-white rounded-lg px-3 py-2 shadow-sm border border-purple-100 text-center min-w-[70px]">
                      <div className="text-[10px] uppercase tracking-wide text-purple-600 font-semibold">Total</div>
                      <div className="text-lg font-bold text-purple-900">{stats.total}</div>
                    </div>
                  </div>
                </div>

                {/* Today's deal */}
                <div className="bg-white rounded-lg p-4 border border-purple-100 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="deal-text" className="text-sm font-semibold text-purple-900">
                      🔥 Today's Deal (added to caption)
                    </Label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        data-testid="deal-active-toggle"
                        checked={settings.deal_active}
                        onChange={(e) => setSettings({ ...settings, deal_active: e.target.checked })}
                        className="h-4 w-4 accent-purple-600"
                      />
                      <span className="text-xs font-medium text-purple-700">
                        {settings.deal_active ? "On" : "Off"}
                      </span>
                    </label>
                  </div>
                  <Input
                    id="deal-text"
                    data-testid="deal-text-input"
                    placeholder='e.g. "$25 off any pickup this week"'
                    maxLength={140}
                    value={settings.deal_text}
                    onChange={(e) => setSettings({ ...settings, deal_text: e.target.value })}
                    className="border-purple-200 focus:border-purple-500"
                  />
                </div>

                {/* Daily reminder */}
                <div className="bg-white rounded-lg p-4 border border-purple-100 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-purple-900">⏰ Daily share reminder</span>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        data-testid="reminder-toggle"
                        checked={settings.reminder_enabled}
                        onChange={(e) => onReminderToggle(e.target.checked)}
                        className="h-4 w-4 accent-purple-600"
                      />
                      <span className="text-xs font-medium text-purple-700">
                        {settings.reminder_enabled ? "Enabled" : "Off"}
                      </span>
                    </label>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Label htmlFor="reminder-hour" className="text-xs text-purple-800">Remind me at</Label>
                    <select
                      id="reminder-hour"
                      data-testid="reminder-hour-select"
                      value={settings.reminder_hour}
                      onChange={(e) => setSettings({ ...settings, reminder_hour: Number(e.target.value) })}
                      className="border border-purple-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-purple-500"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-purple-700/80 font-mono bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                      {settings.timezone}
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-700/80 mt-2">
                    True background push — works after dashboard is closed.
                  </p>
                  <Button
                    onClick={sendTestPush}
                    data-testid="send-test-push-btn"
                    disabled={!settings.reminder_enabled}
                    className="mt-3 w-full bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-900 border border-fuchsia-300 font-semibold py-2"
                  >
                    🔔 Send Test Push Now
                  </Button>

                  {/* 📊 Push delivery health */}
                  <div className="mt-3 bg-slate-50 rounded-md border border-slate-200 p-3" data-testid="push-health-widget">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-700">📊 Push delivery health</span>
                      <span data-testid="push-health-subs" className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                        {health.subscriptions} device{health.subscriptions === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                      <div className="bg-white rounded px-2 py-1.5 border border-slate-100">
                        <div className="uppercase tracking-wide text-slate-500 text-[9px]">Last event</div>
                        <div className="font-semibold text-slate-800 truncate" data-testid="push-health-last-event">
                          {health.last_event
                            ? `${health.last_event.kind === "test" ? "🧪 Test" : "⏰ Daily"} • ${new Date(health.last_event.created_at).toLocaleString()}`
                            : "—"}
                        </div>
                        {health.last_event && (
                          <div className="text-slate-500 mt-0.5">
                            sent {health.last_event.sent ?? 0}
                            {typeof health.last_event.failed === "number" ? ` · failed ${health.last_event.failed}` : ""}
                          </div>
                        )}
                      </div>
                      <div className="bg-white rounded px-2 py-1.5 border border-slate-100">
                        <div className="uppercase tracking-wide text-slate-500 text-[9px]">Last daily</div>
                        <div className="font-semibold text-slate-800 truncate" data-testid="push-health-last-daily">
                          {health.last_daily ? new Date(health.last_daily.created_at).toLocaleString() : "—"}
                        </div>
                        {health.last_daily?.tz && (
                          <div className="text-slate-500 mt-0.5">{health.last_daily.tz}</div>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={resubscribeDevice}
                      data-testid="resubscribe-device-btn"
                      className="mt-2 w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium py-1.5 text-xs"
                    >
                      🔄 Resubscribe this device
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={saveSettings}
                  disabled={saving}
                  data-testid="save-marketing-settings-btn"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 shadow-md"
                >
                  {saving ? "Saving…" : "💾 Save Marketing Settings"}
                </Button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
              <h3 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                📋 How to Use This QR Code:
              </h3>
              <ul className="space-y-2 text-sm text-purple-800">
                <li className="flex items-start gap-2"><span className="font-bold">1.</span><span><strong>Download</strong> the QR code using the button below</span></li>
                <li className="flex items-start gap-2"><span className="font-bold">2.</span><span><strong>Print</strong> on business cards, flyers, yard signs, or vehicle magnets</span></li>
                <li className="flex items-start gap-2"><span className="font-bold">3.</span><span><strong>Share</strong> on social media, email signatures, or your website</span></li>
                <li className="flex items-start gap-2"><span className="font-bold">4.</span><span>When customers <strong>scan with their phone camera</strong>, they'll instantly access your quote page!</span></li>
              </ul>
            </div>

            {/* Download / Close */}
            <div className="flex gap-4">
              <Button onClick={downloadQR} data-testid="download-qr-btn"
                className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white py-6 text-lg font-semibold shadow-lg">
                ⬇️ Download QR Code
              </Button>
              <Button onClick={onClose} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-6 text-lg font-semibold">
                Close
              </Button>
            </div>

            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
              <p className="text-sm text-emerald-800 flex items-start gap-2">
                <span className="text-lg">💡</span>
                <span><strong>Pro Tip:</strong> Test the QR code with your phone before printing to make sure it works perfectly!</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketingQRModal;
