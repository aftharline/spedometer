export interface LatLng {
  lat: number;
  lng: number;
}

export interface NaviStep {
  dist: number;
  dur: number;
  name: string;
  type: string;
  modifier?: string;
  location: LatLng;
}

/* ── MANEUVER → ICON & LABEL ─────────────────────────── */
export function maneuverIcon(type: string, modifier?: string): string {
  if (type === 'arrive') return 'fa-location-dot';
  if (type === 'depart') return 'fa-play';
  if (type === 'roundabout' || type === 'rotary') return 'fa-rotate-right';
  if (type === 'merge') return 'fa-angle-double-up';
  switch (modifier) {
    case 'left': return 'fa-turn-up fa-flip-horizontal';
    case 'right': return 'fa-turn-up';
    case 'sharp left': return 'fa-share fa-flip-horizontal';
    case 'sharp right': return 'fa-share';
    case 'slight left': return 'fa-arrow-up';
    case 'slight right': return 'fa-arrow-up';
    case 'straight': return 'fa-arrow-up';
    case 'uturn': return 'fa-rotate-left';
    default: return 'fa-arrow-up';
  }
}

export function maneuverLabel(type: string, modifier?: string): string {
  if (type === 'arrive') return 'Tiba di tujuan';
  if (type === 'depart') return 'Mulai berjalan';
  if (type === 'roundabout' || type === 'rotary') return 'Masuk roundabout';
  if (type === 'merge') return 'Masuk jalan utama';
  const dir: Record<string, string> = {
    left: 'Belok kiri',
    right: 'Belok kanan',
    'sharp left': 'Belok tajam kiri',
    'sharp right': 'Belok tajam kanan',
    'slight left': 'Melengkung kiri',
    'slight right': 'Melengkung kanan',
    straight: 'Lurus terus',
    uturn: 'Putar balik',
  };
  return dir[modifier ?? 'straight'] ?? 'Lurus terus';
}

/* ── FORMAT ──────────────────────────────────────────── */
export function formatDist(m: number): string {
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

export function formatEta(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} mnt`;
  return `${Math.floor(min / 60)} j ${min % 60} mnt`;
}

export function etaClockStr(sec: number, now = Date.now()): string {
  const d = new Date(now + Math.max(0, sec) * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ── BEARING (course-up map rotation) ────────────────── */
export function bearingOfSegment(a: LatLng, b: LatLng): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const f1 = toR(a.lat);
  const f2 = toR(b.lat);
  const dl = toR(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/* Arah maju di posisi snap: segmen saat ini, atau berikutnya bila hampir selesai. */
export function courseAhead(poly: LatLng[], idx: number, frac: number): number | null {
  if (poly.length < 2) return null;
  const i = frac > 0.85 && idx < poly.length - 1 ? idx + 1 : idx;
  return bearingOfSegment(poly[i - 1], poly[i]);
}

export function smoothAngle(prev: number, next: number, k: number): number {
  const d = ((next - prev + 540) % 360) - 180;
  return (prev + d * k + 360) % 360;
}

/* ── OSRM annotations=lanes → node offset tiap step (geometry tiap step
   berbagi 1 node persimpangan dengan step berikutnya) ── */
export function cumulativeNodeOffsets(nodeCounts: number[]): number[] {
  let off = 0;
  return nodeCounts.map(n => {
    const o = off;
    off += Math.max(1, n) - 1;
    return o;
  });
}

/* ── SNAP / PROGRESS / OFF-ROUTE ─────────────────────── */
export function distToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dx = (toR(b.lng - a.lng)) * Math.cos(toR((a.lat + b.lat) / 2));
  const dy = toR(b.lat - a.lat);
  const px = (toR(p.lng - a.lng)) * Math.cos(toR((a.lat + b.lat) / 2));
  const py = toR(p.lat - a.lat);
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
  const cx = px - t * dx;
  const cy = py - t * dy;
  return R * Math.sqrt(cx * cx + cy * cy);
}

export function snapToRoute(p: LatLng, poly: LatLng[]): { idx: number; distM: number; frac: number } {
  let best = { idx: 0, distM: Infinity, frac: 0 };
  for (let i = 1; i < poly.length; i++) {
    const d = distToSegmentM(p, poly[i - 1], poly[i]);
    if (d < best.distM) {
      const dx = (toRl(poly[i].lng) - toRl(poly[i - 1].lng)) * Math.cos(toRl((poly[i].lat + poly[i - 1].lat) / 2));
      const dy = toRl(poly[i].lat) - toRl(poly[i - 1].lat);
      const px = (toRl(p.lng) - toRl(poly[i - 1].lng)) * Math.cos(toRl((poly[i].lat + poly[i - 1].lat) / 2));
      const py = toRl(p.lat) - toRl(poly[i - 1].lat);
      const len2 = dx * dx + dy * dy;
      best = { idx: i, distM: d, frac: len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) };
    }
  }
  return best;
}

const toRl = (d: number) => (d * Math.PI) / 180;

export function nearestStepIndex(poly: LatLng[], steps: NaviStep[], snappedIdx: number): number {
  if (!steps.length) return 0;
  const anchors = steps.map(s => {
    const sn = snapToRoute(s.location, poly);
    return sn.idx + sn.frac;
  });
  const pos = snappedIdx;
  let idx = 0;
  for (let i = 0; i < anchors.length; i++) {
    if (anchors[i] <= pos) idx = i;
    else break;
  }
  return idx;
}

export function remainingDist(poly: LatLng[], snappedIdx: number, frac: number): number {
  let rem = 0;
  for (let i = snappedIdx + 1; i < poly.length; i++) {
    rem += segDist(poly[i - 1], poly[i]);
  }
  const last = poly[Math.max(0, snappedIdx - 1)];
  const cur = poly[snappedIdx] ?? last;
  rem += segDist(last, cur) * (1 - frac);
  return rem;
}

/* Sisa waktu = step utuh setelah step berjalan + fraksi jarakh step berjalan. */
export function remainingDurSec(steps: NaviStep[], curStepIdx: number, curStepRemM: number): number {
  let sec = 0;
  for (let i = curStepIdx + 1; i < steps.length; i++) sec += steps[i].dur ?? 0;
  const cur = steps[curStepIdx];
  if (cur?.dur) sec += cur.dur * Math.min(1, curStepRemM / Math.max(1, cur.dist));
  return sec;
}

function segDist(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dx = (toR(b.lng - a.lng)) * Math.cos(toR((a.lat + b.lat) / 2));
  const dy = toR(b.lat - a.lat);
  return R * Math.sqrt(dx * dx + dy * dy);
}

/* ── FAVORITES ───────────────────────────────────────── */
const FAV_KEY = 'bcr_navi_favs';

export interface FavPlace {
  name: string;
  lat: number;
  lng: number;
}

export function loadFavs(): FavPlace[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function saveFav(place: FavPlace): void {
  const favs = loadFavs().filter(f => f.name !== place.name);
  favs.unshift(place);
  localStorage.setItem(FAV_KEY, JSON.stringify(favs.slice(0, 5)));
}
