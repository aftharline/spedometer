export const COMPASS_DIRS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

export const toRad = (deg: number): number => (deg * Math.PI) / 180;
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export const haversineMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const bearingDeg = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

export const smoothVal = (prev: number, next: number, alpha: number): number =>
  prev + (next - prev) * alpha;

export function medianSpeed(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function headingToCompass(deg: number | null): string {
  if (deg === null || !Number.isFinite(deg)) return '—';
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_DIRS[idx];
}

export function polarXY(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarXY(cx, cy, r, endDeg);
  const e = polarXY(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

export function fuseSpeed(
  nativeSpeedKmh: number | null,
  calcSpeedKmh: number | null,
  acc: number,
): number {
  if (nativeSpeedKmh !== null && calcSpeedKmh !== null) {
    const nativeWeight = acc <= 18 ? 0.65 : acc <= 50 ? 0.5 : 0.35;
    return nativeSpeedKmh * nativeWeight + calcSpeedKmh * (1 - nativeWeight);
  }
  if (nativeSpeedKmh !== null) return nativeSpeedKmh;
  if (calcSpeedKmh !== null) return calcSpeedKmh;
  return 0;
}

export function adaptiveGpsAlpha(acc: number): number {
  return acc <= 18 ? 0.62 : acc <= 35 ? 0.48 : acc <= 60 ? 0.32 : 0.18;
}

export function isPlausibleMove(distMeters: number, dtSeconds: number, acc: number): boolean {
  const maxPlausible = Math.max(150, dtSeconds * 100);
  return distMeters < maxPlausible && distMeters > Math.max(1.5, acc * 0.12);
}

export function speedoDisplayKmh(trueKmh: number, offsetKmh = 10): number {
  return trueKmh > 0.5 ? trueKmh + offsetKmh : 0;
}

/* ── RIDE COMPUTATION (pure) ────────────────────────── */
import type { RidePoint } from './types';

export function rideDistance(points: RidePoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineMeters(points[i - 1], points[i]);
  return d;
}

export function movingTime(points: RidePoint[], stopKmh = 2): number {
  let sec = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].t - points[i - 1].t) / 1000;
    if (dt > 0 && dt <= 60 && Math.max(points[i - 1].spd, points[i].spd) >= stopKmh) sec += dt;
  }
  return Math.round(sec);
}

export function elevationGain(points: RidePoint[], thresholdM = 3): number {
  let gain = 0;
  let ref: number | null = null;
  for (const p of points) {
    if (p.alt == null || !Number.isFinite(p.alt)) continue;
    if (ref === null) ref = p.alt;
    else if (p.alt - ref >= thresholdM) {
      gain += p.alt - ref;
      ref = p.alt;
    } else if (p.alt < ref) ref = p.alt;
  }
  return Math.round(gain);
}

export function splitsPerKm(points: RidePoint[]): { km: number; sec: number; spdKmh: number }[] {
  const splits: { km: number; sec: number; spdKmh: number }[] = [];
  let kmDone = 0;
  let kmSec = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || dt > 60) continue;
    const seg = haversineMeters(a, b);
    if (Math.max(a.spd, b.spd) < 2) continue;
    kmSec += dt;
    kmDone += seg;
    while (kmDone >= 1000) {
      const over = kmDone - 1000;
      const frac = kmDone > 0 ? (kmDone - over) / kmDone : 1;
      splits.push({ km: splits.length + 1, sec: Math.round(kmSec * frac), spdKmh: 3600 / Math.max(1, kmSec * frac) });
      kmDone = over;
      kmSec = kmSec * (1 - frac);
    }
  }
  if (kmDone > 50 && kmSec > 0) {
    splits.push({ km: splits.length + 1, sec: Math.round(kmSec), spdKmh: (kmDone / kmSec) * 3.6 });
  }
  return splits;
}
