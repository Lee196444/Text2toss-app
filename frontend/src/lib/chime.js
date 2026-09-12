// Synthesised cash-register "ka-ching" via Web Audio — no asset file needed.
let ctx;
const MUTE_KEY = "t2t_chime_muted";

export const isChimeMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { return false; }
};

export const setChimeMuted = (muted) => {
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) { /* ignore */ }
};

const tone = (ac, freq, start, dur, gain, type = "sine") => {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
};

export const playCashChime = ({ force = false } = {}) => {
  if (!force && isChimeMuted()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    // metallic "cha-" click
    tone(ctx, 2200, t, 0.08, 0.25, "square");
    tone(ctx, 3300, t + 0.02, 0.06, 0.12, "square");
    // bell "-ching" (two harmonics ringing out)
    tone(ctx, 1568, t + 0.12, 0.7, 0.35);
    tone(ctx, 2349, t + 0.12, 0.55, 0.2);
    tone(ctx, 3136, t + 0.13, 0.4, 0.1);
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.debug("chime skipped", e);
  }
};
