import React from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/** Stats badges + Today's Deal + Daily Reminder + Push health.
 *  Pure-presentational: parent owns state and handlers. */
export default function MarketingPanel({
  stats,
  settings,
  setSettings,
  health,
  saving,
  onReminderToggle,
  onSendTestPush,
  onResubscribe,
  onSave,
}) {
  return (
    <div className="w-full mt-6 bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-xl border border-purple-200 p-5">
      {/* Header + stats */}
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
            <span className="text-xs font-medium text-purple-700">{settings.deal_active ? "On" : "Off"}</span>
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

      {/* Daily reminder + Push health */}
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
            {Array.from({ length: 24 }, (_, h) => {
              let label;
              if (h === 0) label = "12 AM";
              else if (h < 12) label = `${h} AM`;
              else if (h === 12) label = "12 PM";
              else label = `${h - 12} PM`;
              return <option key={h} value={h}>{label}</option>;
            })}
          </select>
          <span className="text-[11px] text-purple-700/80 font-mono bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
            {settings.timezone}
          </span>
        </div>
        <p className="text-[11px] text-purple-700/80 mt-2">
          True background push — works after dashboard is closed.
        </p>
        <Button
          onClick={onSendTestPush}
          data-testid="send-test-push-btn"
          disabled={!settings.reminder_enabled}
          className="mt-3 w-full bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-900 border border-fuchsia-300 font-semibold py-2"
        >
          🔔 Send Test Push Now
        </Button>

        <PushHealthWidget health={health} onResubscribe={onResubscribe} />
      </div>

      <Button
        onClick={onSave}
        disabled={saving}
        data-testid="save-marketing-settings-btn"
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 shadow-md"
      >
        {saving ? "Saving…" : "💾 Save Marketing Settings"}
      </Button>
    </div>
  );
}

function PushHealthWidget({ health, onResubscribe }) {
  const lastEventLabel = (() => {
    if (!health.last_event) return "—";
    const kindIcon = health.last_event.kind === "test" ? "🧪 Test" : "⏰ Daily";
    return `${kindIcon} • ${new Date(health.last_event.created_at).toLocaleString()}`;
  })();

  return (
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
          <div className="font-semibold text-slate-800 truncate" data-testid="push-health-last-event">{lastEventLabel}</div>
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
          {health.last_daily?.tz && <div className="text-slate-500 mt-0.5">{health.last_daily.tz}</div>}
        </div>
      </div>
      <Button
        onClick={onResubscribe}
        data-testid="resubscribe-device-btn"
        className="mt-2 w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium py-1.5 text-xs"
      >
        🔄 Resubscribe this device
      </Button>
    </div>
  );
}
