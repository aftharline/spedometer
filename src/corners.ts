/* ── CORNER TRACKER — sensor virtual tikungan ──
   Dari lean terfilter + speed + GPS yang sudah mengalir:
   tikungan masuk saat |lean| ≥ 12°, keluar saat < 6° selama 1,5 s,
   atau arah berlawanan (S-bend menutup yang lama & langsung buka baru).
   Catatan per tikungan: lean maks, km/j maks, titik GPS lean maks. */

export interface CornerMoment {
  dir: 'L' | 'R';
  maxLean: number;
  kmhMax: number;
  lat: number | null;
  lng: number | null;
  t: number;
}

export interface CornerStat {
  count: number;
  bankSum: number; // Σ |lean°|·detik se-ride
  maxLean: number; // rekor lean se-ride
  last: CornerMoment | null;
}

const ENTER_LEAN = 12;
const ENTER_MS = 800; // harus bertahan supaya dianggap tikungan sungguhan
const EXIT_LEAN = 6;
const EXIT_MS = 1500;

interface CurCorner extends CornerMoment {
  t0: number;
}

let cur: CurCorner | null = null;
let pendingSince = 0;
let belowSince = 0;
let lastPushAt = 0;
let stat: CornerStat = { count: 0, bankSum: 0, maxLean: 0, last: null };

export const cornerStat = (): CornerStat => stat;

export function cornerReset(): void {
  cur = null;
  pendingSince = 0;
  belowSince = 0;
  lastPushAt = 0;
  stat = { count: 0, bankSum: 0, maxLean: 0, last: null };
}

function close(): void {
  if (!cur) return;
  delete (cur as CurCorner).t0;
  stat.last = cur;
  stat.count++;
  cur = null;
}

export function cornerPush(
  lean: number,
  kmh: number,
  lat: number | null,
  lng: number | null,
  tMs: number,
): CornerStat {
  const dt = lastPushAt > 0 ? Math.min((tMs - lastPushAt) / 1000, 60) : 0;
  lastPushAt = tMs;

  const abs = Math.abs(lean);
  const dir: 'L' | 'R' = lean > 0 ? 'R' : 'L';

  if (cur) stat.bankSum += abs * dt;

  if (abs >= ENTER_LEAN) {
    belowSince = 0;
    if (!cur) {
      if (pendingSince === 0) pendingSince = tMs;
      else if (tMs - pendingSince >= ENTER_MS) {
        cur = { dir, maxLean: abs, kmhMax: kmh, lat, lng, t: tMs, t0: tMs };
        pendingSince = 0;
      }
    } else if (cur.dir !== dir) {
      close();
      cur = { dir, maxLean: abs, kmhMax: kmh, lat, lng, t: tMs, t0: tMs };
    } else {
      if (abs > cur.maxLean) {
        cur.maxLean = abs;
        cur.lat = lat;
        cur.lng = lng;
        cur.t = tMs;
      }
      if (kmh > cur.kmhMax) cur.kmhMax = kmh;
    }
    if (abs > stat.maxLean) stat.maxLean = abs;
  } else {
    if (!cur) pendingSince = 0; // batal pending bila dibatalkan sebelum 0,8 s
    if (cur && abs < EXIT_LEAN) {
      if (belowSince === 0) belowSince = tMs;
      else if (tMs - belowSince >= EXIT_MS) close();
    } else if (cur) {
      belowSince = 0; // kembali di hysteresis — jendela belum rapat
    }
  }

  return stat;
}
