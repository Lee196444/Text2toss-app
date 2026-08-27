import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { toast } from "../../lib/toast";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

// Friendly explanations for the most common Twilio error codes the user will see.
const ERROR_HELP = {
  30034:
    "Carrier blocked: this number isn't yet registered with A2P 10DLC. Finish the Twilio compliance form (the Persona link) — until then, US carriers will block all outbound SMS.",
  30007:
    "Carrier rejected as spam — try simpler wording or wait for A2P registration to clear.",
  30005:
    "Unknown destination — verify the recipient phone number is correct (must be +1XXXXXXXXXX).",
  30006:
    "Landline or unreachable carrier — recipient can't receive SMS.",
  21610: "Recipient has replied STOP — they've unsubscribed.",
  21408:
    "International permissions disabled — enable geo-permissions in your Twilio Console.",
  21211: "Invalid 'To' phone number format.",
};

const STATUS_STYLES = {
  queued: "bg-amber-100 text-amber-800",
  sending: "bg-amber-100 text-amber-800",
  sent: "bg-blue-100 text-blue-800",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-300",
  undelivered: "bg-red-100 text-red-800 border-red-300",
  failed: "bg-red-100 text-red-800 border-red-300",
};

/**
 * SmsTestModal — admin tool to send a test SMS and watch live delivery status.
 * Pings /api/admin/sms-status every 3s after sending until status reaches
 * delivered / undelivered / failed (max 30s).
 *
 * Props: { open, onClose }
 */
export default function SmsTestModal({ open, onClose }) {
  const [config, setConfig] = useState(null);
  const [recipient, setRecipient] = useState("+19288539619"); // verified caller ID default
  const [body, setBody] = useState(
    "Hi! This is a test from your Text2toss admin dashboard. Reply STOP to opt out.",
  );
  const [sending, setSending] = useState(false);
  const [latest, setLatest] = useState(null); // { sid, status, error_code, error_message }
  const pollRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    axios
      .post(`${API}/admin/test-sms`, {}, { withCredentials: true })
      .then((res) => setConfig(res.data))
      .catch(() => setConfig({ configured: false, message: "Couldn't reach Twilio" }));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  if (!open) return null;

  const startPolling = (sid) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const { data } = await axios.get(`${API}/admin/sms-status/${sid}`, {
          withCredentials: true,
        });
        setLatest({
          sid,
          status: data.status,
          error_code: data.error_code,
          error_message: data.error_message,
          price: data.price,
        });
        const terminal = ["delivered", "undelivered", "failed"];
        if (terminal.includes(data.status) || attempts >= 10) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        // Twilio status is eventually consistent — a transient 4xx/5xx or
        // network blip is expected. Log at debug level so the poll loop
        // keeps running but the error is captured for diagnosis.
        console.debug("[sms-test] status poll error, will retry:", err?.message || err);
      }
    }, 3000);
  };

  const sendNow = async () => {
    if (!recipient.match(/^\+1\d{10}$/)) {
      toast.error("Phone must be in +1XXXXXXXXXX format");
      return;
    }
    if (!body.trim()) {
      toast.error("Message body is empty");
      return;
    }
    setSending(true);
    setLatest(null);
    try {
      const { data } = await axios.post(
        `${API}/admin/send-sms`,
        { phone: recipient, message: body.trim() },
        { withCredentials: true },
      );
      if (data.success) {
        toast.success(`SMS queued (${data.message_sid.slice(0, 12)}…)`);
        setLatest({ sid: data.message_sid, status: data.status || "queued" });
        startPolling(data.message_sid);
      } else {
        toast.error("Send failed");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch sm:items-start justify-center sm:p-4 sm:pt-8 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      data-testid="sms-test-modal"
    >
      <div className="bg-white w-full max-w-lg rounded-none sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-screen sm:max-h-[90vh]">
        {/* Header */}
        <div className="bg-black text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-display italic uppercase tracking-wider text-cyan-400">
              💬 Test SMS
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Send a live SMS and watch the carrier deliver it in real-time.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none px-2"
            data-testid="sms-test-close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Config status */}
          {config && (
            <div
              className={`rounded-xl px-4 py-3 text-sm border ${
                config.configured
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-red-50 border-red-200 text-red-900"
              }`}
              data-testid="sms-config-status"
            >
              {config.configured ? "✅" : "❌"} {config.message}
              {config.account_sid && (
                <div className="mt-1 text-xs opacity-70">
                  Account SID: <code>{config.account_sid}</code>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500 uppercase tracking-wider">
              Recipient phone
            </label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="+19285551234"
              data-testid="sms-test-recipient"
            />
            <p className="text-[11px] text-gray-400">
              Until A2P 10DLC clears, only your <strong>Verified Caller ID</strong>{" "}
              (set in Twilio Console) will receive SMS.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500 uppercase tracking-wider">
              Message body
            </label>
            <Textarea
              rows={4}
              maxLength={1600}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              data-testid="sms-test-body"
            />
            <div className="text-[10px] text-gray-400 text-right">
              {body.length}/1600
            </div>
          </div>

          <Button
            onClick={sendNow}
            disabled={sending}
            className="w-full bg-cyan-400 hover:bg-cyan-500 text-black font-display italic uppercase tracking-wider text-base py-6 shadow-lg shadow-cyan-400/30"
            data-testid="sms-test-send-btn"
          >
            {sending ? "Sending..." : "Send Test SMS"}
          </Button>

          {/* Live status */}
          {latest && (
            <Card
              className={`border-2 ${
                latest.status === "delivered"
                  ? "border-emerald-300"
                  : latest.status === "undelivered" || latest.status === "failed"
                    ? "border-red-300"
                    : "border-amber-300"
              }`}
              data-testid="sms-status-card"
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-gray-500">
                    Delivery status
                  </span>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      STATUS_STYLES[latest.status] || "bg-gray-100 text-gray-800"
                    }`}
                    data-testid="sms-status-badge"
                  >
                    {latest.status}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono break-all">
                  {latest.sid}
                </div>
                {latest.price && (
                  <div className="text-xs text-gray-600">
                    Cost: ${Math.abs(parseFloat(latest.price)).toFixed(4)}
                  </div>
                )}
                {latest.error_code && (
                  <div
                    className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2"
                    data-testid="sms-error-help"
                  >
                    <div className="text-xs font-bold text-red-800">
                      Error {latest.error_code}
                      {latest.error_message ? `: ${latest.error_message}` : ""}
                    </div>
                    {ERROR_HELP[latest.error_code] && (
                      <p className="text-xs text-red-700 mt-1 leading-relaxed">
                        {ERROR_HELP[latest.error_code]}
                      </p>
                    )}
                  </div>
                )}
                {(latest.status === "queued" || latest.status === "sent") && (
                  <p className="text-xs text-gray-500 italic">
                    Polling Twilio every 3s for delivery confirmation...
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
