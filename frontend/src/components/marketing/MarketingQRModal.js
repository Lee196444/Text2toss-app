import React, { useEffect, useState } from "react";
import axiosBase from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { toast } from "../../lib/toast";

import {
  API,
  QR_URL,
  detectTimezone,
  urlBase64ToUint8Array,
  ensureNotificationPermission,
  buildCaption,
} from "./utils";
import MarketingPanel from "./MarketingPanel";
import { logger } from "../../utils/logger";


// Local axios instance with credentials — see AdminDashboard.js for why
// we avoid `axios.defaults.withCredentials = true` (it pollutes customer
// requests and breaks CORS on custom domains).
const axios = axiosBase.create({ withCredentials: true });

const MarketingQRModal = ({ open, onClose }) => {
  const [stats, setStats] = useState({ this_week: 0, total: 0, by_channel: {} });
  const [settings, setSettings] = useState({
    deal_text: "",
    deal_active: false,
    reminder_enabled: false,
    reminder_hour: 10,
    timezone: detectTimezone(),
    priority_fees: { same_day: 75, next_slot: 40, emergency: 100 },
    priority_max_per_day: 2,
  });
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState({ subscriptions: 0, last_event: null, last_daily: null });

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [s, c, h] = await Promise.all([
          axios.get(`${API}/admin/marketing/stats`),
          axios.get(`${API}/admin/marketing/settings`),
          axios.get(`${API}/admin/push/health`),
        ]);
        setStats(s.data || { this_week: 0, total: 0, by_channel: {} });
        setSettings({
          deal_text: c.data?.deal_text ?? "",
          deal_active: !!c.data?.deal_active,
          reminder_enabled: !!c.data?.reminder_enabled,
          reminder_hour: c.data?.reminder_hour ?? 10,
          timezone: c.data?.timezone || detectTimezone(),
          priority_fees: c.data?.priority_fees || { same_day: 75, next_slot: 40, emergency: 100 },
          priority_max_per_day: c.data?.priority_max_per_day ?? 2,
        });
        setHealth(h.data || { subscriptions: 0, last_event: null, last_daily: null });
      } catch (err) {
        logger.error("Marketing modal: failed to load stats/settings/health", err);
        toast.error("Couldn't load marketing data — try reopening the modal");
      }
    })();
  }, [open]);

  const refreshStats = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/marketing/stats`);
      setStats(data);
    } catch (err) {
      logger.warn("Marketing modal: refreshStats failed", err);
    }
  };

  const refreshHealth = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/push/health`);
      setHealth(data);
    } catch (err) {
      logger.warn("Marketing modal: refreshHealth failed", err);
    }
  };

  const logShareEvent = async (channel) => {
    try {
      await axios.post(`${API}/admin/marketing/share-event`, { channel });
      await refreshStats();
    } catch (err) {
      logger.warn("Marketing modal: share-event tracking failed", err);
    }
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
    const caption = buildCaption(settings);
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
      try {
        await navigator.clipboard.writeText(caption);
        toast.success("Caption copied! Downloading QR — paste & attach in your post.");
      } catch {
        toast.error("Could not copy caption. Downloading QR instead.");
      }
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
    const quote = encodeURIComponent(buildCaption(settings));
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${quote}`,
      "_blank",
      "noopener,noreferrer,width=600,height=600",
    );
    logShareEvent("facebook");
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(buildCaption(settings));
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
          applicationServerKey: urlBase64ToUint8Array(data.publicKey),
        });
      }
      const json = sub.toJSON();
      await axios.post(`${API}/admin/push/subscribe`, {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
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
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        });
        await sub.unsubscribe();
      }
    } catch (err) {
      logger.warn("Marketing modal: disableBackgroundPush failed", err);
    }
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
        timezone: data.timezone || detectTimezone(),
        priority_fees: data.priority_fees || { same_day: 75, next_slot: 40, emergency: 100 },
        priority_max_per_day: data.priority_max_per_day ?? 2,
      });
      toast.success("Marketing settings saved");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const clearQuoteCache = async () => {
    try {
      const { data } = await axios.post(`${API}/admin/quote-cache/clear`);
      toast.success(`Cleared ${data.deleted} cached quote${data.deleted === 1 ? "" : "s"}`);
    } catch (err) {
      logger.error("Failed to clear quote cache", err);
      toast.error("Could not clear quote cache");
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
            <CardTitle className="text-2xl flex items-center gap-2">📱 Marketing QR Code</CardTitle>
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
                  Tip: on phones, &ldquo;Share Post&rdquo; opens your native share sheet so you can post directly to Instagram Stories, Reels, Messages, or any installed app.
                </p>
              </div>

              <MarketingPanel
                stats={stats}
                settings={settings}
                setSettings={setSettings}
                health={health}
                saving={saving}
                onReminderToggle={onReminderToggle}
                onSendTestPush={sendTestPush}
                onResubscribe={resubscribeDevice}
                onSave={saveSettings}
                onClearQuoteCache={clearQuoteCache}
              />
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
                <li className="flex items-start gap-2"><span className="font-bold">4.</span><span>When customers <strong>scan with their phone camera</strong>, they&apos;ll instantly access your quote page!</span></li>
              </ul>
            </div>

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
