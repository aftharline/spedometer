/* ── SPEED ALERTS — bunyi + getar saat berpacu ──
   • lintas +10 km/h  → getar pendek (haptic staircase)
   • capai ≥80 km/h   → 1 bunyi "hot" (re-arm di bawah 75)
   • capai ≥90 km/h   → pola alarm 3x (sama waktu SPEEDING MODE)      */

export type BeepKind = 'none' | 'hot' | 'alarm';
export interface AlertState { tier: number; hotDone: boolean }
export interface AlertEvent { next: AlertState; beep: BeepKind; vibrate: boolean }

export const alertStart = (): AlertState => ({ tier: 0, hotDone: false });

/* Murni — dipanggil per frame nilai speed yang ditampilkan. */
export function nextAlert(s: AlertState, c: number): AlertEvent {
  const tier = Math.floor(Math.max(0, c) / 10);
  const vibrate = c >= 20 && tier > s.tier;
  let hotDone = c < 75 ? false : s.hotDone;
  let beep: BeepKind = 'none';
  if (c >= 90 && tier > s.tier) {
    beep = 'alarm';
    hotDone = true; // alarm menutupi beep 80 bila lompat langsung ke 90+
  } else if (c >= 80 && !hotDone) {
    beep = 'hot';
    hotDone = true;
  }
  return { next: { tier, hotDone }, beep, vibrate };
}

/* ── Eksekusi ── */
let alertState = alertStart();
let beepCtx: AudioContext | null = null;

function ensureCtx(): void {
  if (beepCtx) return;
  try {
    beepCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch { beepCtx = null; }
}

function tone(freq: number, dur: number, atMs: number, gain: number): void {
  try {
    if (!beepCtx) return;
    if (beepCtx.state === 'suspended') beepCtx.resume().catch(() => {});
    const t = beepCtx.currentTime + atMs / 1000;
    const osc = beepCtx.createOscillator();
    const g = beepCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(beepCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch { /* audio tidak tersedia — haptic tetap jalan */ }
}

export function speedAlerts(c: number): void {
  const ev = nextAlert(alertState, c);
  alertState = ev.next;
  if (!ev.vibrate && ev.beep === 'none') return;
  ensureCtx();
  if (ev.vibrate) navigator.vibrate?.(35);
  if (ev.beep === 'hot') tone(880, 0.12, 0, 0.05);
  if (ev.beep === 'alarm') {
    tone(988, 0.14, 0, 0.06);
    tone(988, 0.14, 190, 0.06);
    tone(988, 0.14, 380, 0.06);
  }
}
