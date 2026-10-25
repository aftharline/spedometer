/* ── BCR TOOLKIT — isi slot mode-3 (menggantikan dial, ala NAVI MINI) ──
   4 tab: CUACA (Open-Meteo) · RUTE (planner + elevasi + cuaca tiba) ·
   BBM (km/l dari log) · BENGKEL (km sejak servis). Sebagian besar data
   sudah ada (log DB, GPS, OSRM). Pure helpers terpisah & teruji. */

import { dbAction } from './db';
import { appState } from './state';
import { showToast } from './toast';
import type { LogEntry } from './types';
import { $id } from './util';

/* ══════════════ PURE HELPERS (vitest) ══════════════ */

export interface WmoInfo { label: string; icon: string; wet: boolean }

export const wmoInfo = (code: number): WmoInfo => {
  if (code === 0) return { label: 'Cerah', icon: 'fa-sun', wet: false };
  if (code <= 2) return { label: 'Berawan sebagian', icon: 'fa-cloud-sun', wet: false };
  if (code === 3) return { label: 'Berawan', icon: 'fa-cloud', wet: false };
  if (code <= 48) return { label: 'Berimbang / Kabut', icon: 'fa-smog', wet: false };
  if (code <= 57) return { label: 'Gerimis', icon: 'fa-cloud-rain', wet: true };
  if (code <= 67) return { label: 'Hujan', icon: 'fa-cloud-showers-heavy', wet: true };
  if (code <= 77) return { label: 'Salju', icon: 'fa-snowflake', wet: true };
  if (code <= 82) return { label: 'Hujan Deras', icon: 'fa-cloud-showers-water', wet: true };
  if (code === 85 || code === 86) return { label: 'Salju Lebat', icon: 'fa-snowflake', wet: true };
  return { label: 'Badai', icon: 'fa-bolt', wet: true };
};

/* Indeks jam pertama probabilitas hujan ≥ 60% */
export const firstRainIdx = (pp: number[], wetCodes: number[]): number => {
  for (let i = 0; i < pp.length; i++) {
    if (pp[i] >= 60 || wetCodes[i] >= 61) return i;
  }
  return -1;
};

/* km/l rata dari dua log BBM berurutan (Δodo besar) */
export const fuelAvgKml = (logs: LogEntry[]): number | null => {
  const f = logs
    .filter(l => l.logType === 'fuel' && l.odo > 0 && (l.liter ?? 0) > 0)
    .sort((a, b) => a.odo - b.odo);
  for (let i = f.length - 1; i > 0; i--) {
    const dOdo = f[i].odo - f[i - 1].odo;
    if (dOdo >= 20) return Math.round(((dOdo / (f[i].liter ?? 1)) * 10)) / 10;
  }
  return null;
};

export const fuelSisaKm = (liter: number, kml: number | null): number =>
  Math.round(liter * (kml ?? 35));

export const fuelCostPer10 = (logs: LogEntry[]): number | null => {
  const f = logs
    .filter(l => l.logType === 'fuel' && l.odo > 0 && (l.cost ?? 0) > 0)
    .sort((a, b) => a.odo - b.odo);
  if (f.length < 2) return null;
  const dOdo = f[f.length - 1].odo - f[0].odo;
  if (dOdo < 20) return null;
  const cost = f.reduce((s, l) => s + (l.cost ?? 0), 0);
  return Math.round((cost / dOdo) * 10);
};

export const lastFuelLiter = (logs: LogEntry[]): number | null => {
  const f = logs.filter(l => l.logType === 'fuel' && (l.liter ?? 0) > 0);
  return f.length ? (f[f.length - 1].liter as number) : null;
};

export const pricePerLiter = (logs: LogEntry[]): number | null => {
  const f = logs.filter(l => l.logType === 'fuel' && (l.liter ?? 0) > 0 && (l.cost ?? 0) > 0);
  const l = f[f.length - 1];
  return l ? Math.round((l.cost as number) / (l.liter as number)) : null;
};

/* Jarak sampai layanan (interval tetap, km) */
export const SVC_INTERVALS: Record<string, number> = {
  'oli mesin': 2000,
  rantai: 6000,
  'oli kopling': 4000,
  ban: 8000,
};

export interface SvcRow {
  name: string;
  sinceKm: number | null;
  interval: number;
  pct: number;
  warn: boolean;
}

export const svcRowOf = (name: string, lastOdo: number | null, odoNow: number, interval: number): SvcRow => {
  if (lastOdo === null) return { name, sinceKm: null, interval, pct: 0, warn: false };
  const since = Math.max(0, odoNow - lastOdo);
  return { name, sinceKm: since, interval, pct: Math.min(1, since / interval), warn: since / interval >= 0.9 };
};

export const serviceRows = (logs: LogEntry[], odoNow: number): SvcRow[] => {
  const out: SvcRow[] = [];
  // 'ban' pakai kata utuh — mencegah false-match "bantalan", dll.
  const hitTest = (name: string, key: string): boolean =>
    name === 'ban' ? /\bban\b/.test(key) : key.includes(name);
  for (const [name, interval] of Object.entries(SVC_INTERVALS)) {
    const hits = logs.filter(l => l.logType === 'service' && hitTest(name, (l.parts ?? '').toLowerCase()));
    const lastOdo = hits.length ? Math.max(...hits.map(h => h.odo)) : null;
    out.push(svcRowOf(name, lastOdo, odoNow, interval));
  }
  return out;
};

/* Posisi jam terdekat utk "cuaca saat tiba" — times ISO lokal */
export const pickArrivalIdx = (times: string[], startMs: number, durSec: number): number => {
  const t = startMs + durSec * 1000 + 10 * 60 * 1000; // tiba + 10 menit
  let best = 0;
  let bestD = Infinity;
  times.forEach((s, i) => {
    const d = Math.abs(new Date(s).getTime() - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
};

export const elevGainFrom = (alts: number[]): number => {
  let g = 0;
  for (let i = 1; i < alts.length; i++) {
    const d = alts[i] - alts[i - 1];
    if (d > 1) g += d;
  }
  return Math.round(g);
};

export const litersFor = (distKm: number, kml: number | null): number =>
  Math.round((distKm / (kml ?? 35)) * 10) / 10;

/* ══════════════ RUNTIME ══════════════ */

const cssColor = (v: string): string =>
  v.startsWith('var(')
    ? getComputedStyle(document.documentElement).getPropertyValue(v.slice(4, -1)).trim() || '#ffb35c'
    : v;

interface HourCell { t: string; temp: number; code: number; pp: number }
export interface WeatherData {
  curTemp: number;
  curCode: number;
  wind: number;
  fetchedAt: number;
  place: string;
  hours: HourCell[];
}

let wCache: WeatherData | null = null;
const W_TTL = 15 * 60 * 1000;

export async function fetchWeather(lat: number, lng: number, place = ''): Promise<WeatherData | null> {
  if (wCache && Date.now() - wCache.fetchedAt < W_TTL && wCache.place === place) return wCache;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&current=temperature_2m,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m,weather_code,precipitation_probability&forecast_hours=12&timezone=auto&forecast_days=1`;
  try {
    const res = await fetch(url);
    const d = await res.json();
    const h = d.hourly;
    const data: WeatherData = {
      curTemp: d.current?.temperature_2m ?? NaN,
      curCode: d.current?.weather_code ?? 3,
      wind: d.current?.wind_speed_10m ?? NaN,
      fetchedAt: Date.now(),
      place,
      hours: (h.temperature_2m as number[]).map((v, i) => ({
        t: h.time[i] as string,
        temp: v,
        code: h.weather_code[i] as number,
        pp: h.precipitation_probability?.[i] ?? 0,
      })),
    };
    wCache = data;
    return data;
  } catch {
    return null;
  }
}

/* ── TAB & paint ─────────────────────────────── */
let wBusy = false;

export function kitTab(name: 'cuaca' | 'planner' | 'bbm' | 'bengkel'): void {
  ['kit-cuaca', 'kit-planner', 'kit-bbm', 'kit-bengkel'].forEach(id => {
    $id(id).classList.toggle('hidden', id !== `kit-${name}`);
  });
  document.querySelectorAll('.kit-tab').forEach(b => {
    (b as HTMLElement).classList.toggle('is-on', (b as HTMLElement).dataset.tab === name);
  });
  if (name === 'cuaca' && !wBusy) {
    if (wCache) paintCuaca(wCache);
    void kitLoadWeather(); // data lama → di-refresh diam-diam
  }
  if (name === 'bbm') void paintFuel();
  if (name === 'bengkel') void paintService();
}

export async function kitLoadWeather(manual = false): Promise<void> {
  if (wBusy) return;
  if (appState.currentLat === null) {
    // GPS belum jalan (telemetri mati): coba ambil posisi sekali
    const pos = await import('./navi').then(m => m.currentPosition());
    if (!pos) {
      if (manual) showToast('GPS belum terkunci', 'warn'); // auto-open tetap diam
      return;
    }
    appState.currentLat = pos.lat;
    appState.currentLng = pos.lng;
  }
  wBusy = true;
  try {
    const w = await fetchWeather(appState.currentLat as number, appState.currentLng as number, '');
    if (w) paintCuaca(w);
  } finally {
    wBusy = false;
  }
}

/* Pesan banner hujan — pure agar teruji */
export interface WarnHour { t: string; pp: number }
export const warnMsg = (hours: WarnHour[], rIdx: number): { html: string; hot: boolean } => {
  const at = (i: number): string => hours[i]?.t.split('T')[1]?.slice(0, 5) ?? '';
  if (rIdx < 0)
    return { html: `<i class="fa-solid fa-shield-halved"></i> Cuaca aman — tidak ada hujan 12 jam ke depan`, hot: false };
  if (rIdx <= 3)
    return { html: `<i class="fa-solid fa-triangle-exclamation"></i> Hujan pukul <b>${at(rIdx)}</b> (${hours[rIdx].pp}%) — kejar sebelum itu!`, hot: true };
  return { html: `<i class="fa-solid fa-cloud-showers-heavy"></i> Hujan pukul ${at(rIdx)} (${hours[rIdx].pp}%) — aman sebelum itu`, hot: false };
};

export function paintCuaca(w: WeatherData): void {
  const info = wmoInfo(w.curCode);
  const icon = $id('cw-icon');
  if (icon) icon.className = `fa-solid ${info.icon}`;
  $id('cw-temp').textContent = Number.isFinite(w.curTemp) ? `${Math.round(w.curTemp)}°` : '—';
  $id('cw-desc').textContent = info.label;
  $id('cw-wind').textContent = Number.isFinite(w.wind) ? ` ${Math.round(w.wind)} km/j` : '—';
  $id('cw-upd').textContent = ` ${new Date(w.fetchedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;

  const hoursEl = $id('cw-hours');
  const codes = w.hours.map(h => h.code);
  const rIdx = firstRainIdx(w.hours.map(h => h.pp), codes);
  const warn = $id('cw-warn');
  if (warn) {
    const m = warnMsg(w.hours, rIdx);
    warn.className = m.hot ? 'kit-warn hot' : 'kit-warn';
    warn.innerHTML = m.html;
  }

  if (hoursEl) {
    hoursEl.innerHTML = w.hours
      .map((h, i) => {
        const ic = wmoInfo(h.code);
        const hh = h.t.split('T')[1]?.slice(0, 5) ?? '';
        return `<div class="cw-hour${i === 0 ? ' now' : ''}">
          <span>${hh}</span><i class="fa-solid ${ic.icon}"></i>
          <b>${Math.round(h.temp)}°</b>${h.pp >= 40 ? `<em style="color:var(--warn)">${h.pp}%</em>` : '<em>-</em>'}
        </div>`;
      })
      .join('');
  }
}

/* ── PLANNER ──────────────────────────────────── */
interface PlanData {
  fromName: string;
  destName: string;
  dest: { lat: number; lng: number };
  distKm: number;
  durSec: number;
  gainM: number;
  alts: number[];
  liters: number;
  costRp: number | null;
  wArr: { code: number; pp: number; temp: number } | null;
}
let plan: PlanData | null = null;

async function geocodeOne(q: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=id&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const hits = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  if (!hits.length) return null;
  return { lat: parseFloat(hits[0].lat), lng: parseFloat(hits[0].lon), name: hits[0].display_name.split(',')[0] };
}

export async function kitPlan(): Promise<void> {
  const toQ = ($id('kp-to') as HTMLInputElement | null)?.value.trim();
  let fromQ = ($id('kp-from') as HTMLInputElement | null)?.value.trim();
  if (!toQ) {
    showToast('Isi tujuan dulu', 'warn');
    return;
  }
  const dest = await geocodeOne(toQ);
  if (!dest) {
    showToast('Tujuan tidak ditemukan', 'alert');
    return;
  }
  showToast('Menghitung rute…', 'muted');
  try {
    let from: { lat: number; lng: number; name: string } | null = null;
    if (fromQ) {
      from = await geocodeOne(fromQ);
      if (!from) {
        showToast('Pengambilan awal tidak ditemukan — pakai GPS', 'warn');
        fromQ = '';
      }
    }
    if (!fromQ && appState.currentLat !== null && appState.currentLng !== null) {
      from = { lat: appState.currentLat, lng: appState.currentLng, name: 'Posisi Saya' };
    }
    if (!from) {
      showToast('Posisi GPS belum terkunci', 'alert');
      return;
    }

    const rUrl = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=false`;
    const rd = (await (await fetch(rUrl)).json()).routes?.[0];
    if (!rd) throw new Error('no route');

    // sampel elevasi ≤100 titik sepanjang geometri
    const geo = rd.geometry.coordinates as [number, number][];
    const stepN = Math.max(1, Math.ceil(geo.length / 90));
    const smp = geo.filter((_, i) => i % stepN === 0 || i === geo.length - 1);
    const eUrl =
      `https://api.open-meteo.com/v1/elevation?latitude=${smp.map(c => c[1].toFixed(3)).join(',')}` +
      `&longitude=${smp.map(c => c[0].toFixed(3)).join(',')}`;
    const alts: number[] = (await (await fetch(eUrl)).json()).elevation ?? [];

    // BBM + cuaca tiba
    const logs = await readLogs();
    const kml = fuelAvgKml(logs);
    const distKm = rd.distance / 1000;
    const lit = litersFor(distKm, kml);
    const ppl = pricePerLiter(logs);
    const cost = ppl ? Math.round(lit * ppl) : null;
    const wD = await fetchWeather(dest.lat, dest.lng, dest.name);
    const idx = wD ? pickArrivalIdx(wD.hours.map(h => h.t), Date.now(), rd.duration) : -1;
    const wArr = idx >= 0 ? { code: wD!.hours[idx].code, pp: wD!.hours[idx].pp, temp: wD!.hours[idx].temp } : null;

    plan = {
      fromName: from.name,
      destName: dest.name,
      dest: { lat: dest.lat, lng: dest.lng },
      distKm: Math.round(distKm * 10) / 10,
      durSec: Math.round(rd.duration),
      gainM: elevGainFrom(alts),
      alts,
      liters: lit,
      costRp: cost,
      wArr,
    };
    paintPlan();
  } catch (err) {
    showToast('Rute gagal — cek koneksi', 'alert');
  }
}

export function paintPlan(): void {
  if (!plan || !$id('kp-out')) return;
  $id('kp-out').classList.remove('hidden');
  const eta = `${Math.floor(plan.durSec / 3600)} j ${Math.round((plan.durSec % 3600) / 60)} m`;
  const wi = plan.wArr ? wmoInfo(plan.wArr.code) : null;
  $id('kp-stats').innerHTML = `
    <div class="ktile"><b>${plan.distKm.toFixed(1)}</b><small>KM</small></div>
    <div class="ktile"><b>${eta}</b><small>ETA</small></div>
    <div class="ktile"><b>${plan.gainM}m</b><small>NAIK</small></div>
    <div class="ktile"><b>±${plan.liters}</b><small>LITER</small></div>
    <div class="ktile"><b>${plan.costRp !== null ? 'Rp' + plan.costRp.toLocaleString('id-ID') : '—'}</b><small>BIAYA</small></div>
    <div class="ktile${wi?.wet ? ' wet' : ''}"><b><i class="fa-solid ${wi?.icon ?? 'fa-circle-question'}"></i> ${plan.wArr ? `${Math.round(plan.wArr.temp)}° ${plan.wArr.pp}%` : '—'}</b><small>SAMPAI</small></div>`;
  $id('kp-dest').textContent = `${plan.fromName} → ${plan.destName}`;
  drawElev('kp-elev', plan.alts);
}

/* minat graf profil elevasi — gaya sparkline (canvas 2x) */
const drawElev = (cvId: string, data: number[]): void => {
  const cv = $id(cvId) as HTMLCanvasElement | null;
  if (!cv || data.length < 2) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const w = cv.width;
  const h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const span = hi - lo || 1;
  const px = (i: number): number => (i / (data.length - 1)) * (w - 10) + 5;
  const py = (v: number): number => h - 8 - ((v - lo) / span) * (h - 20);
  ctx.beginPath();
  data.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(0), py(v))));
  ctx.strokeStyle = cssColor('var(--gold2)');
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.lineTo(px(data.length - 1), h);
  ctx.lineTo(px(0), h);
  ctx.closePath();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = cssColor('var(--gold2)');
  ctx.fill();
  ctx.globalAlpha = 1;
  // label min & max
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.font = '14px "Share Tech Mono"'; ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(hi)} m`, 6, 16);
  ctx.fillText(`${Math.round(lo)} m`, 6, h - 4);
};

export async function kitUseRoute(): Promise<void> {
  if (!plan) return;
  await switchDashboardMode('navi-mini'); // mode switch sudah initNaviMap
  const n = await import('./navi');
  await n.naviPointTo({ name: plan.destName, lat: plan.dest.lat, lng: plan.dest.lng });
}
/* switchDashboardMode di-lazy import agar modul pure (unit test) tak menyentuh DOM */
async function switchDashboardMode(m: 'navi-mini'): Promise<void> {
  const ui = await import('./ui');
  ui.switchDashboardMode(m);
}

/* ── BBM & BENGKEL ─────────────────────────────── */
async function readLogs(): Promise<LogEntry[]> {
  if (!appState.currentVehicleId) return [];
  try {
    return await dbAction<LogEntry[]>('logs', 'getIndex', null, 'vehicleId', appState.currentVehicleId);
  } catch {
    return [];
  }
}

const tripKm = (): number => parseFloat(localStorage.getItem('bcr_trip') || '0') || 0;

export async function paintFuel(): Promise<void> {
  const list = $id('kb-list');
  const form = $id('kb-form');
  if (!appState.currentVehicleId) {
    if (list) list.innerHTML = `<div class="kb-row mute"><i class="fa-solid fa-motorcycle"></i>&nbsp;Pilih kendaraan di GARASI dulu.</div>`;
    if ($id('kb-stats')) $id('kb-stats').innerHTML = '';
    form?.classList.add('hidden');
    return;
  }
  form?.classList.remove('hidden');
  const logs = await readLogs();
  const kml = fuelAvgKml(logs);
  const lit = lastFuelLiter(logs);
  const sisa = lit !== null ? fuelSisaKm(lit, kml) : null;
  const c10 = fuelCostPer10(logs);
  const el = $id('kb-stats');
  if (el) {
    el.innerHTML = `
      <div class="ktile"><b>${kml ?? '—'}</b><small>KM/L</small></div>
      <div class="ktile"><b>${sisa !== null ? sisa : '—'}</b><small>SISA KM</small></div>
      <div class="ktile"><b>${c10 !== null ? 'Rp' + (c10 * 10).toLocaleString('id-ID') : '—'}</b><small>BIAYA/10KM</small></div>
      <div class="ktile"><b>${lit ?? '—'}</b><small>LITER AKHIR</small></div>`;
  }
  if (list) {
    const f = logs.filter(l => l.logType === 'fuel').sort((a, b) => b.odo - a.odo).slice(0, 4);
    list.innerHTML = f.length
      ? f.map(l => `<div class="kb-row"><span>${l.date}</span><b>${l.liter ?? '-'} L</b><span>${l.odo} km</span>${l.cost ? `<em>Rp${l.cost.toLocaleString('id-ID')}</em>` : ''}</div>`).join('')
      : `<div class="kb-row mute">Belum ada catatan BBM — isi form di bawah.</div>`;
  }
}

export async function kitFuelAdd(): Promise<void> {
  if (!appState.currentVehicleId) {
    showToast('Pilih kendaraan di GARASI dulu', 'warn');
    return;
  }
  const lit = parseFloat(($id('kb-lit') as HTMLInputElement).value);
  const cost = parseInt(($id('kb-px') as HTMLInputElement).value || '0');
  if (!(lit > 0) && !cost) {
    showToast('Isi liter / harga', 'warn');
    return;
  }
  await dbAction('logs', 'add', {
    vehicleId: appState.currentVehicleId,
    logType: 'fuel',
    date: new Date().toISOString().split('T')[0],
    odo: Math.round(tripKm() * 10) / 10 || 0,
    liter: lit > 0 ? lit : 0,
    cost: cost > 0 ? cost : 0,
  });
  ($id('kb-lit') as HTMLInputElement).value = '';
  ($id('kb-px') as HTMLInputElement).value = '';
  showToast('Bensin dicatat!', 'gold');
  void paintFuel();
}

export async function kitSvcAdd(): Promise<void> {
  if (!appState.currentVehicleId) {
    showToast('Pilih kendaraan di GARASI dulu', 'warn');
    return;
  }
  const what = ($id('kx-what') as HTMLSelectElement).value;
  await dbAction('logs', 'add', {
    vehicleId: appState.currentVehicleId,
    logType: 'service',
    date: new Date().toISOString().split('T')[0],
    odo: Math.round(tripKm() * 10) / 10 || 0,
    parts: what,
    cost: 0,
  });
  showToast(`${what} — dicatat!`, 'gold2');
  void paintService();
}

export async function paintService(): Promise<void> {
  const form = $id('kx-form');
  const el = $id('kx-rows');
  if (!appState.currentVehicleId) {
    if (el) el.innerHTML = `<div class="kb-row mute"><i class="fa-solid fa-motorcycle"></i>&nbsp;Pilih kendaraan di GARASI dulu.</div>`;
    form?.classList.add('hidden');
    return;
  }
  form?.classList.remove('hidden');
  const logs = await readLogs();
  const odos = logs.map(l => l.odo).filter(o => o > 0);
  const odoNow = Math.max(tripKm(), odos.length ? Math.max(...odos) : 0);
  const rows = serviceRows(logs, odoNow);
  if (el) {
    el.innerHTML = rows
      .map(r => {
        if (r.sinceKm === null) {
          return `<div class="kx-row"><span>${r.name}</span><b style="color:var(--muted)">belum dicatat</b></div>`;
        }
        const sisa = Math.max(0, Math.round(r.interval - r.sinceKm));
        const tone = r.warn ? 'var(--red2)' : r.pct >= 0.75 ? 'var(--warn)' : 'var(--gold2)';
        return `<div class="kx-row">
          <span>${r.name}</span>
          <b style="color:${tone}">${sisa} km lagi</b>
          <div class="kx-bar"><div style="width:${Math.round(r.pct * 100)}%;background:${tone}"></div></div>
        </div>`;
      })
      .join('');
  }
}
