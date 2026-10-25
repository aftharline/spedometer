import { dbAction } from './db';
import { cornerReset, cornerStat } from './corners';
import { elevationGain, haversineMeters } from './geo';
import { showConfirm } from './modals';
import { openRideCard } from './ride-card';
import { deletePhotosByRide, setPhotoRideKey } from './ride-photos';
import { appState } from './state';
import { showToast } from './toast';
import type { Ride, RidePoint } from './types';
import { $opt } from './util';
import { vibPeak, vibReset } from './vibration';

const PAUSE_AFTER_SEC = 90;
const RESUME_KMH = 3;
const MIN_SAMPLE_SEC = 4;
const MIN_SAMPLE_M = 10;
const MIN_RIDE_M = 50;
const MAX_POINTS = 5000;
const AUTOSAVE_SEC = 60;

let recording = false;
let paused = false;
let points: RidePoint[] = [];
let maxKmh = 0;
let distM = 0;
let lastSampleAt = 0;
let stillSince: number | null = null;
let autosaveTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let photoKey: number | null = null;

export const isRecording = (): boolean => recording;
export const isPaused = (): boolean => paused;
export const recMaxKmh = (): number => Math.round(maxKmh);

export async function startRecording(): Promise<void> {
  if (recording) return;
  const vehicles = await dbAction<{ id: string }[]>('vehicles', 'getAll');
  if (!appState.currentVehicleId && vehicles.length === 0) {
    showToast('Pilih kendaraan dulu di Garage!', 'warn');
    return;
  }
  recording = true;
  paused = false;
  points = [];
  maxKmh = 0;
  distM = 0;
  lastSampleAt = 0;
  stillSince = null;
  cornerReset();
  vibReset();
  photoKey = null;
  setPhotoRideKey(null);
  updateRecBtn();
  showToast('REKAM DIMULAI — BCR TOURING', 'gold2');
  tickTimer = setInterval(updateRecLive, 1000);
  autosaveTimer = setInterval(() => void autosave(), AUTOSAVE_SEC * 1000);
}

export function stopRecording(discard = false): void {
  if (!recording) return;
  if (discard) {
    teardown();
    showToast('Rekaman dibuang', 'muted');
    return;
  }
  if (points.length < 2 || distM < MIN_RIDE_M) {
    teardown();
    showToast('Ride terlalu pendek — tidak disimpan', 'warn');
    return;
  }
  showConfirm('Hentikan Rekam?', `Ride ${(distM / 1000).toFixed(1)} km akan disimpan ke BCR Touring.`, 'SIMPAN', async () => {
    const ride = buildRide();
    teardown(true);
    try {
      await dbAction('rides', 'add', ride);
      showToast(`Ride tersimpan — ${ride.distKm.toFixed(1)} km`, 'gold2');
      void openRideCard(ride);
      void import('./ui').then(m => m.loadRides());
    } catch (err) {
      console.error('[Ride save]', err);
      showToast('Gagal simpan ride', 'alert');
    }
  });
}

function teardown(keepPhotos = false): void {
  recording = false;
  paused = false;
  points = [];
  distM = 0;
  maxKmh = 0;
  stillSince = null;
  if (tickTimer) clearInterval(tickTimer);
  if (autosaveTimer) clearInterval(autosaveTimer);
  tickTimer = null;
  autosaveTimer = null;
  updateRecBtn();
  void dbAction('rides', 'delete', -1).catch(() => {});
  if (!keepPhotos) {
    if (photoKey !== null) void deletePhotosByRide(photoKey);
    setPhotoRideKey(null);
  }
}

function buildRide(): Ride {
  const start = points[0].t;
  const end = points[points.length - 1].t;
  let moving = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].t - points[i - 1].t) / 1000;
    if (dt > 0 && dt <= 60 && Math.max(points[i - 1].spd, points[i].spd) >= 2) moving += dt;
  }
  const distKm = distM / 1000;
  const d = new Date(start);
  return {
    vehicleId: appState.currentVehicleId ?? '',
    name: `Ride ${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
    start,
    end,
    distKm: Math.round(distKm * 100) / 100,
    movingSec: Math.round(moving),
    avgKmh: moving > 0 ? Math.round((distKm / (moving / 3600)) * 10) / 10 : 0,
    maxKmh: Math.round(maxKmh),
    gainM: elevationGain(points),
    vibMax: Math.round(vibPeak()),
    corners: cornerStat().count,
    bankMax: Math.round(cornerStat().maxLean),
    points,
  };
}

async function autosave(): Promise<void> {
  if (!recording || points.length < 2) return;
  try {
    await dbAction('rides', 'put', { ...buildRide(), id: -1 });
  } catch (err) {
    console.error('[Ride autosave]', err);
  }
}

export function feedRidePoint(p: RidePoint): void {
  if (!recording) return;

  if (p.spd < 2) {
    if (stillSince === null) stillSince = p.t;
    if (!paused && (p.t - stillSince) / 1000 >= PAUSE_AFTER_SEC) {
      paused = true;
      updateRecBtn();
      showToast('Ride dijeda otomatis (diam)', 'muted');
    }
  } else {
    stillSince = null;
    if (paused && p.spd >= RESUME_KMH) {
      paused = false;
      updateRecBtn();
      showToast('Rekam dilanjutkan', 'muted');
    }
  }
  if (paused) return;

  if (p.spd > maxKmh) maxKmh = p.spd;

  const last = points[points.length - 1];
  if (last) distM += haversineMeters(last, p);

  const due = !last || (p.t - lastSampleAt) / 1000 >= MIN_SAMPLE_SEC;
  const moved = !last || haversineMeters(last, p) >= MIN_SAMPLE_M;
  if (due && moved) {
    points.push(p);
    lastSampleAt = p.t;
    if (points.length === 1) {
      photoKey = p.t;
      setPhotoRideKey(p.t);
    }
    if (points.length > MAX_POINTS) points = points.filter((_, i) => i % 2 === 0 || i === points.length - 1);
  }
  updateRecLive();
}

function updateRecLive(): void {
  if (!recording) return;
  const timeEl = $opt('rec-time');
  if (timeEl && points[0]) {
    const total = Math.floor((Date.now() - points[0].t) / 1000);
    const h = Math.floor(total / 3600);
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    timeEl.textContent = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  }
  const distEl = $opt('rec-dist');
  if (distEl) distEl.textContent = (distM / 1000).toFixed(1);
}

export function updateRecBtn(): void {
  const btn = $opt('btn-rec');
  if (!btn) return;
  if (recording) {
    btn.classList.add('recording');
    btn.innerHTML =
      `<i class="fa-solid fa-stop text-[10px]"></i>` +
      `<span class="rec-meta"><span id="rec-time">--:--</span><span id="rec-dist">0.0</span> km</span>`;
  } else {
    btn.classList.remove('recording');
    btn.innerHTML = `<i class="fa-solid fa-circle-dot text-[10px]"></i><span>REC</span>`;
  }
  updateRecLive();
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

export function buildGPX(ride: Ride): string {
  const name = ride.name.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
  const pts = ride.points
    .map(p => {
      const ele = p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : '';
      return `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">${ele}<time>${new Date(p.t).toISOString()}</time></trkpt>`;
    })
    .join('\n      ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BCR TOURING" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><time>${new Date(ride.start).toISOString()}</time></metadata>
  <trk><name>${name}</name><trkseg>
      ${pts}
  </trkseg></trk>
</gpx>`;
}

export function shareGPX(ride: Ride): void {
  if (!ride.points?.length) {
    showToast('Ride tanpa titik GPS — GPX kosong', 'warn');
    return;
  }
  const blob = new Blob([buildGPX(ride)], { type: 'application/gpx+xml' });
  const fname = ride.name.replace(/[^\w -]/g, '').trim().replace(/ +/g, '_') + '.gpx';
  const file = new File([blob], fname, { type: 'application/gpx+xml' });
  const download = (): void => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.click();
    URL.revokeObjectURL(url);
  };
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: ride.name }).catch(download);
  } else {
    download();
  }
}
