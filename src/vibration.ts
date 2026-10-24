import { updateRideState } from './state';
import { $opt } from './util';

/* Statistical vibration diagnostic — no FFT dep. Window RMS + zero-crossing
   band estimate. ponytail: zero-crossing on lumpy mount noise over-estimates
   frequency; Goertzel per-band if diagnosis precision ever matters. */

const WINDOW_MS = 3000;
const RECHECK_MS = 450;
const BANDS = [
  { hz: 3, label: 'suspensi / jalan' },
  { hz: 8, label: 'jalan bergelombang' },
  { hz: 20, label: 'roda / ban / bearing' },
  { hz: Infinity, label: 'mesin / rantai' },
];

let samples: { t: number; x: number; y: number; z: number }[] = [];
let lastEmitAt = 0;
let peak = 0;

export interface VibResult {
  idx: number;
  hz: number;
  band: string;
  note: string;
  level: 'ok' | 'watch' | 'alert';
}

const bandFor = (hz: number): string =>
  BANDS.find(b => hz < b.hz)?.label ?? BANDS[BANDS.length - 1].label;

const noteFor = (idx: number, band: string): { note: string; level: VibResult['level'] } => {
  if (idx < 25) return { note: 'Kondisi baik — getaran normal', level: 'ok' };
  if (idx < 55) {
    if (band === 'jalan bergelombang' || band === 'suspensi / jalan')
      return { note: 'Getaran jalanan Wajar — jaga kecepatan', level: 'watch' };
    return { note: 'Getaran meningkat — periksa saat berhenti', level: 'watch' };
  }
  if (band === 'roda / ban / bearing')
    return { note: 'Indikasi ban/bearing tidak balance — servis', level: 'alert' };
  if (band === 'mesin / rantai')
    return { note: 'Indikasi mesin/rantai kasar — cek rantai & tensi', level: 'alert' };
  return { note: 'Getaran berat — periksa suspensi/bodi', level: 'alert' };
};

export function pushVibrationSample(ax: number, ay: number, az: number, t: number): VibResult | null {
  samples.push({ t, x: ax, y: ay, z: az });
  const cutoff = t - WINDOW_MS;
  while (samples.length && samples[0].t < cutoff) samples.shift();

  if (t - lastEmitAt < RECHECK_MS) return null;
  if (samples.length < 40) return null;
  lastEmitAt = t;

  const n = samples.length;
  const mx = samples.reduce((s, v) => s + v.x, 0) / n;
  const my = samples.reduce((s, v) => s + v.y, 0) / n;
  const mz = samples.reduce((s, v) => s + v.z, 0) / n;

  const vx = samples.reduce((s, v) => s + (v.x - mx) ** 2, 0) / n;
  const vy = samples.reduce((s, v) => s + (v.y - my) ** 2, 0) / n;
  const vz = samples.reduce((s, v) => s + (v.z - mz) ** 2, 0) / n;
  const axis = vx >= vy && vx >= vz ? 'x' : vy >= vz ? 'y' : 'z';

  const G = 9.81;
  const d: number[] = samples.map(v =>
    Math.hypot((v.x - mx) * G, (v.y - my) * G, (v.z - mz) * G),
  );
  const rms = Math.sqrt(d.reduce((s, v) => s + v * v, 0) / n);

  const signed = samples.map(v => (axis === 'x' ? v.x : axis === 'y' ? v.y : v.z));
  /* ponytail: dominant-axis zero-crossing is a rough band hint, ±2× on
     broadband noise; per-band Goertzel if diagnosis precision matters. */
  let crossings = 0;
  const durSec = (samples[n - 1].t - samples[0].t) / 1000;
  for (let i = 1; i < n; i++) {
    if (signed[i - 1] * signed[i] < 0) crossings++;
  }
  const hz = durSec > 0.5 ? Math.min(30, crossings / (2 * durSec)) : 0;

  const idx = Math.min(100, Math.round(rms <= 1 ? rms * 60 : 60 + (rms - 1) * 20));
  const band = bandFor(hz);
  const { note, level } = noteFor(idx, band);

  if (idx > peak) peak = idx;
  updateRideState({ vib: idx });
  paint(idx, hz, band, note, level);
  return { idx, hz, band, note, level };
}

function paint(idx: number, hz: number, band: string, note: string, level: VibResult['level']): void {
  const col = level === 'ok' ? 'var(--gold2)' : level === 'watch' ? 'var(--warn)' : 'var(--red2)';
  ['vib-val', 'vib-val-p', 'vib-val-ls'].forEach(id => {
    const el = $opt(id);
    if (!el) return;
    el.textContent = String(idx);
    el.style.color = col;
  });
  const bar = $opt('vib-bar');
  if (bar) {
    (bar as HTMLElement).style.width = `${idx}%`;
    (bar as HTMLElement).style.background = col;
  }
  const hzEl = $opt('vib-hz');
  if (hzEl) hzEl.textContent = `${Math.round(hz)} Hz`;
  const hzLs = $opt('vib-hz-ls');
  if (hzLs) hzLs.textContent = `${Math.round(hz)}`;
  const bandEl = $opt('vib-band');
  if (bandEl) bandEl.textContent = band;
  const noteEl = $opt('vib-note');
  if (noteEl) noteEl.textContent = note;
}

export const vibPeak = (): number => peak;

export function vibReset(): void {
  samples = [];
  lastEmitAt = 0;
  peak = 0;
  const bar = $opt('vib-bar');
  if (bar) (bar as HTMLElement).style.width = '0%';
  ['vib-val', 'vib-val-p', 'vib-val-ls'].forEach(id => {
    const el = $opt(id);
    if (el) { el.textContent = '0'; el.style.color = ''; }
  });
}
