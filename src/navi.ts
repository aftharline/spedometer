import leaflet, { type CircleMarker, type Map as LeafletMap, type Marker, type Polyline } from 'leaflet';
import {
  cumulativeNodeOffsets,
  courseAhead,
  etaClockStr,
  formatDist,
  formatEta,
  loadFavs,
  maneuverIcon,
  maneuverLabel,
  nearestStepIndex,
  remainingDist,
  remainingDurSec,
  saveFav,
  smoothAngle,
  snapToRoute,
  type FavPlace,
  type LatLng,
  type NaviStep,
} from './navi-math';
import { appState, rideState } from './state';
import { showToast } from './toast';
import { $id, $opt } from './util';

type NaviMode = 'idle' | 'preview' | 'navigating';

let mode: NaviMode = 'idle';
let naviMap: LeafletMap | null = null;
let routeLine: Polyline | null = null;
let posDot: CircleMarker | null = null;
let destPin: Marker | null = null;
let routePoly: LatLng[] = [];
let steps: NaviStep[] = [];
let totalDistM = 0;
let totalDurSec = 0;
let dest: FavPlace | null = null;
let offRouteSince: number | null = null;
let spokenStep = -1;
let spokenFar = false;
let spokenNear = false;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;
let follow = true;
let rotorBearing = 0;
let laneData: number[] | null = null; // lanes per route segment
let nodeCounts: number[] = [];
let limitAbort: AbortController | null = null;

export const naviMode = (): NaviMode => mode;
export const naviFollowing = (): boolean => follow;

export function initNaviMap(): void {
  const el = $id('navi-rotor');
  if (!el || naviMap) return;
  naviMap = leaflet.map(el, { zoomControl: false, attributionControl: false });
  leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(naviMap);
  naviMap.setView([appState.currentLat ?? -7.25, appState.currentLng ?? 112.75], 15);
  posDot = leaflet.circleMarker([appState.currentLat ?? -7.25, appState.currentLng ?? 112.75], {
    radius: 8, color: 'var(--gold2)', weight: 3, fillColor: '#0a0a0a', fillOpacity: 1,
  }).addTo(naviMap);
  /* Rider geser peta → lepas lock, chip pusatkan muncul */
  naviMap.on('dragstart', () => setFollow(false));
  renderFavs();
}

export function setFollow(on: boolean): void {
  follow = on;
  $id('navi-recenter').classList.toggle('hidden', on);
  if (on && appState.currentLat !== null && appState.currentLng !== null && naviMap) {
    naviMap.setView([appState.currentLat, appState.currentLng], 17);
  }
  const rotor = $opt('navi-rotor');
  const wrap = rotor?.parentElement;
  if (rotor && wrap) {
    const on2 = on && mode === 'navigating';
    rotor.classList.toggle('is-rotating', on2);
    wrap.classList.toggle('is-rotating', on2);
  }
}

export function invalidateNaviMap(): void {
  setTimeout(() => naviMap?.invalidateSize(), 150);
}

function updateRotor(snIdx: number, frac: number): void {
  const rotor = $opt('navi-rotor');
  if (!rotor) return;
  if (mode !== 'navigating' || !follow) return;
  const b = courseAhead(routePoly, snIdx, frac);
  if (b === null) return;
  rotorBearing = smoothAngle(rotorBearing, b, 0.4);
  rotor.style.setProperty('--rot', `${-rotorBearing.toFixed(1)}deg`);
}

function orientReset(): void {
  rotorBearing = 0;
  const rotor = $opt('navi-rotor');
  const m = $id('navi-rotor')?.parentElement;
  if (rotor) {
    rotor.style.setProperty('--rot', '0deg');
    rotor.classList.remove('is-rotating');
  }
  if (m) m.classList.remove('is-rotating');
}

export function naviCenterMe(): void {
  if (!naviMap) return;
  if (appState.currentLat !== null && appState.currentLng !== null) {
    setFollow(true);
    posDot?.setLatLng([appState.currentLat, appState.currentLng]);
  } else {
    showToast('GPS belum terkunci', 'warn');
  }
}

/* ── SEARCH ──────────────────────────────────────────── */
export function naviSearchInput(): void {
  const inp = $opt<HTMLInputElement>('navi-q');
  if (!inp) return;
  const q = inp.value.trim();
  if (searchTimer) clearTimeout(searchTimer);
  const list = $id('navi-results');
  if (q.length < 3) {
    list.innerHTML = '';
    return;
  }
  searchTimer = setTimeout(() => void geocode(q), 500);
}

async function geocode(q: string): Promise<void> {
  const seq = ++searchSeq;
  const list = $id('navi-results');
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const hits = (await res.json()) as { display_name: string; lat: string; lon: string }[];
    if (seq !== searchSeq) return;
    if (!hits.length) {
      list.innerHTML = `<div class="navi-result" style="color:var(--muted)">Tidak ditemukan</div>`;
      return;
    }
    list.innerHTML = hits
      .map((h, i) => `<div class="navi-result" onclick="naviPickDest(${i})">
        <i class="fa-solid fa-location-dot"></i><span>${h.display_name.split(',').slice(0, 3).join(', ')}</span></div>`)
      .join('');
    (window as any).__naviHits = hits;
  } catch {
    list.innerHTML = `<div class="navi-result" style="color:var(--red2)">Pencarian gagal — cek koneksi</div>`;
  }
}

export function naviPickDest(i: number): void {
  const hits = (window as any).__naviHits as { display_name: string; lat: string; lon: string }[] | undefined;
  if (!hits?.[i]) return;
  const h = hits[i];
  void pickDest({ name: h.display_name.split(',')[0], lat: parseFloat(h.lat), lng: parseFloat(h.lon) });
}

export function naviUseFav(i: number): void {
  const fav = loadFavs()[i];
  if (fav) void pickDest(fav);
}

async function pickDest(p: FavPlace): Promise<void> {
  if (mode === 'navigating') {
    showToast('Stop navigasi dulu', 'warn');
    return;
  }
  $id('navi-results').innerHTML = '';
  const q = $opt<HTMLInputElement>('navi-q');
  if (q) q.value = p.name;
  dest = p;
  saveFav(p);
  renderFavs();
  showToast(`Rute ke ${p.name}…`, 'gold');
  await fetchRoute();
}

function renderFavs(): void {
  const el = $id('navi-favs');
  if (!el) return;
  const favs = loadFavs();
  el.innerHTML = favs.map((f, i) => `<button class="fav-chip" onclick="naviUseFav(${i})"><i class="fa-solid fa-clock-rotate-left"></i>${f.name.length > 18 ? f.name.slice(0, 18) + '…' : f.name}</button>`).join('');
}

async function currentPosition(): Promise<LatLng | null> {
  if (appState.currentLat !== null && appState.currentLng !== null) {
    return { lat: appState.currentLat, lng: appState.currentLng };
  }
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

async function fetchRoute(): Promise<void> {
  if (!dest || !naviMap) return;
  const from = await currentPosition();
  if (!from) {
    showToast('Posisi GPS belum terkunci', 'alert');
    return;
  }
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();
    const r = data.routes?.[0];
    if (!r) throw new Error('no route');
    routePoly = (r.geometry.coordinates as [number, number][]).map(c => ({ lat: c[1], lng: c[0] }));
    steps = r.legs[0].steps.map((s: any) => ({
      dist: s.distance,
      dur: s.duration ?? 0,
      name: s.name ?? '',
      type: s.maneuver.type,
      modifier: s.maneuver.modifier,
      location: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] },
    }));
    nodeCounts = r.legs[0].steps.map((s: any) => (s.geometry?.coordinates?.length ?? 2) || 2);
    const lanesAnn = r.legs[0].annotation?.lanes as unknown;
    laneData = Array.isArray(lanesAnn) ? (lanesAnn as number[]) : null;
    totalDistM = r.distance;
    totalDurSec = r.duration;
    routeLine?.remove();
    routeLine = leaflet.polyline(routePoly.map(p => [p.lat, p.lng] as [number, number]), {
      color: 'var(--gold)', weight: 6, opacity: 0.9,
    }).addTo(naviMap);
    destPin?.remove();
    destPin = leaflet.marker([dest.lat, dest.lng], {
      icon: leaflet.divIcon({ className: 'navi-pin', html: '<i class="fa-solid fa-location-dot"></i>', iconSize: [28, 34], iconAnchor: [14, 32] }),
    }).addTo(naviMap);
    naviMap.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    mode = 'preview';
    $id('navi-banner').classList.add('hidden');
    $id('navi-search-wrap').classList.remove('hidden');
    const info = $id('navi-preview');
    info.classList.remove('hidden');
    info.innerHTML = `
      <div class="navi-preview-main">
        <div><span class="f-mono text-lg gold-text">${formatDist(totalDistM)}</span><span class="f-rajd text-[10px] uppercase" style="color:var(--muted)"> · ${formatEta(totalDurSec)}</span></div>
        <div class="f-rajd text-[10px] uppercase truncate" style="color:var(--muted2)">via ${steps[0]?.name || 'rute terbaik'}</div>
      </div>`;
    $id('navi-actions').classList.remove('hidden');
  } catch {
    showToast('Rute gagal — cek koneksi internet', 'alert');
  }
}

/* ── NAVIGATION LOOP ─────────────────────────────────── */
export function naviStart(): void {
  if (mode !== 'preview' || !dest) return;
  mode = 'navigating';
  offRouteSince = null;
  spokenStep = -1;
  spokenFar = false;
  spokenNear = false;
  setFollow(true);
  $id('navi-search-wrap').classList.add('hidden');
  $id('navi-preview').classList.add('hidden');
  $id('navi-actions').classList.add('hidden');
  $id('navi-banner').classList.remove('hidden');
  showToast('Navigasi dimulai', 'gold2');
  speak('Navigasi dimulai');
}

export function naviStop(): void {
  mode = 'idle';
  routePoly = [];
  steps = [];
  dest = null;
  laneData = null;
  nodeCounts = [];
  lastLimitVal = null;
  routeLine?.remove();
  routeLine = null;
  destPin?.remove();
  destPin = null;
  setFollow(true);
  orientReset();
  limitAbort?.abort();
  $id('navi-recenter').classList.add('hidden');
  $id('navi-banner').classList.add('hidden');
  $id('navi-junction').classList.add('hidden');
  $id('nb-limit')?.classList.add('hidden');
  $id('navi-next').classList.add('hidden');
  $id('navi-preview').classList.add('hidden');
  $id('navi-actions').classList.add('hidden');
  $id('navi-eta').classList.add('hidden');
  $id('navi-search-wrap').classList.remove('hidden');
  window.speechSynthesis?.cancel();
}

export function naviOpenGMaps(): void {
  if (!dest) return;
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`, '_blank');
}

export function feedNaviPoint(lat: number, lng: number): void {
  posDot?.setLatLng([lat, lng]);
  if (mode !== 'navigating' || !routePoly.length || !naviMap) return;
  const pos: LatLng = { lat, lng };
  const sn = snapToRoute(pos, routePoly);

  if (sn.distM > 50) {
    if (offRouteSince === null) offRouteSince = Date.now();
    else if (Date.now() - offRouteSince > 10000) {
      offRouteSince = null;
      void reroute(pos);
      return;
    }
  } else {
    offRouteSince = null;
  }

  const stepIdx = nearestStepIndex(routePoly, steps, sn.idx);
  const next = steps[stepIdx + 1] ?? steps[stepIdx];
  let distToStep = 0;
  if (next) {
    const nextAnchor = snapToRoute(next.location, routePoly);
    distToStep = Math.max(0, remainingDist(routePoly, sn.idx, sn.frac) - remainingDist(routePoly, nextAnchor.idx, nextAnchor.frac));
    updateBanner(next, distToStep);
    updateJunction(next, distToStep, stepIdx + 1);
    updateNext(stepIdx);
    announce(next, stepIdx, distToStep);
  }
  updateRotor(sn.idx, sn.frac);
  void requestSpeedLimit(lat, lng);

  const rem = remainingDist(routePoly, sn.idx, sn.frac);
  const remSec = remainingDurSec(steps, stepIdx, distToStep);
  const info = $id('navi-eta');
  if (info) {
    info.classList.remove('hidden');
    info.innerHTML = `<i class="fa-solid fa-road"></i> ${formatDist(rem)} · <i class="fa-solid fa-clock"></i> ${formatEta(remSec)} · tiba <span class="gold-text">${etaClockStr(remSec)}</span> · <i class="fa-solid fa-gauge-high"></i> ${Math.round(rideState.speed)} km/h`;
  }

  naviMap.setView([lat, lng], Math.max(naviMap.getZoom(), 17), { animate: true, duration: 0.5 });

  if (rem < 25) {
    speak('Anda telah tiba di tujuan');
    showToast('Tiba di tujuan', 'gold2');
    naviStop();
  }
}

function updateBanner(step: NaviStep, distM: number): void {
  const icon = $opt('nb-icon');
  if (icon) icon.className = `fa-solid ${maneuverIcon(step.type, step.modifier)}`;
  const instr = $opt('nb-instruction');
  if (instr) instr.textContent = maneuverLabel(step.type, step.modifier) + (step.name ? ` ke ${step.name}` : '');
  const dist = $opt('nb-dist');
  if (dist) dist.textContent = distM > 0 ? formatDist(distM) : '—';
}

function updateNext(curStepIdx: number): void {
  const after = steps[curStepIdx + 2];
  const el = $id('navi-next');
  if (!el) return;
  if (!after) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `<i class="fa-solid ${maneuverIcon(after.type, after.modifier)}"></i><span>Lalu ${maneuverLabel(after.type, after.modifier).toLowerCase()}${after.name ? ` ke ${after.name}` : ''}</span>`;
}

/* Tampilan persimpangan besar saat mendekati tikungan (≤150 m). */
function updateJunction(step: NaviStep, distM: number, stepIdx: number): void {
  const el = $id('navi-junction');
  if (!el) return;
  if (distM > 150 || distM < 6) {
    el.classList.add('hidden');
    return;
  }
  const lanes = laneAtStep(stepIdx);
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="nj-icon"><i class="fa-solid ${maneuverIcon(step.type, step.modifier)}"></i></div>
    <div class="nj-main">
      <div class="nj-dist f-mono">${formatDist(distM)}</div>
      <div class="nj-road f-exo">${step.name || maneuverLabel(step.type, step.modifier)}</div>
      ${lanes ? `<div class="nj-lanes f-rajd">${lanes} LAJUR</div>` : ''}
    </div>`;
}

function laneAtStep(stepIdx: number): number | null {
  if (!laneData?.length) return null;
  const offs = cumulativeNodeOffsets(nodeCounts);
  const nodeIdx = offs[stepIdx];
  const idx = nodeIdx - 1;
  const n = laneData[idx];
  return n && n > 1 ? n : null;
}

/* ── SPEED LIMIT (OpenStreetMap maxspeed via Overpass) ───────── */
let lastLimitAt = 0;
let lastLimitVal: number | null = null;

async function requestSpeedLimit(lat: number, lng: number): Promise<void> {
  if (mode !== 'navigating' || rideState.speed < 5) return;
  const now = Date.now();
  if (now - lastLimitAt < 20000 || limitAbort) return;
  lastLimitAt = now;
  limitAbort = new AbortController();
  const el = $id('nb-limit');
  try {
    const q = `[out:json][timeout:5];way(around:35,${lat},${lng})["maxspeed"];out tags 1;`;
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, {
      signal: limitAbort.signal,
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    const raw = data.elements?.[0]?.tags?.maxspeed as string | undefined;
    const parsed = parseInt(String(raw).split(';')[0], 10);
    lastLimitVal = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    if (el) {
      el.classList.toggle('hidden', lastLimitVal === null);
      if (lastLimitVal !== null) el.textContent = String(lastLimitVal);
    }
  } catch {
    if (!limitAbort.signal.aborted && el) el.classList.add('hidden'); // offline — chip sembunyi
  } finally {
    limitAbort = null;
  }
}

function announce(step: NaviStep, stepIdx: number, distM: number): void {
  if (stepIdx !== spokenStep) {
    spokenStep = stepIdx;
    spokenFar = false;
    spokenNear = false;
  }
  const label = maneuverLabel(step.type, step.modifier);
  if (!spokenFar && distM <= 300 && distM > 60) {
    spokenFar = true;
    speak(`Dalam ${formatDist(distM)}, ${label}`);
  } else if (!spokenNear && distM <= 60 && distM > 5) {
    spokenNear = true;
    speak(label + ' sekarang');
  }
}

async function reroute(pos: LatLng): Promise<void> {
  if (!dest) return;
  showToast('Rute dihitung ulang…', 'warn');
  appState.currentLat = pos.lat;
  appState.currentLng = pos.lng;
  await fetchRoute();
  if (mode === 'preview') naviStart();
}

function speak(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'id-ID';
    u.rate = 1;
    synth.speak(u);
  } catch {
    /* TTS tidak tersedia */
  }
}
