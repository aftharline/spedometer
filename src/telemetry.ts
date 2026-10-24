import {
  adaptiveGpsAlpha,
  bearingDeg,
  fuseSpeed,
  haversineMeters,
  isPlausibleMove,
  medianSpeed,
  smoothVal,
  speedoDisplayKmh,
} from './geo';
import {
  resetSpeedEngine,
  setSpeedoArc,
  updateGForceMeter,
  updateLeanGauge,
} from './gauges';
import {
  addTripDistance,
  setGpsDots,
  updateAltitudeDisplays,
  updateCompassDisplays,
  updateSensorChip,
} from './hud';
import { appState, rideState, updateRideState } from './state';
import { feedRidePoint } from './ride';
import { feedNaviPoint } from './navi';
import { showToast } from './toast';
import type { GpsPoint } from './types';
import { $id, $opt } from './util';
import { pushVibrationSample, vibReset } from './vibration';

let geoWatchId: number | null = null;
let wakeLock: any = null;
let gpsFilteredSpeed = 0;
let lastGpsPoint: GpsPoint | null = null;
let lastAcceptedGpsAt = 0;
let lastHeading: number | null = null;
let compassHeading: number | null = null;
let gpsSpeedBuffer: number[] = [];
const GPS_BUF_MAX = 5;
const SPEEDO_OFFSET_KMH = 10;
const SPEED_GLITCH_KMH = 240;

function processGpsPosition(pos: GeolocationPosition): void {
  const c = pos.coords;
  const now = pos.timestamp || Date.now();
  const acc = c.accuracy || 999;
  const point: GpsPoint = { lat: c.latitude, lng: c.longitude, t: now, acc };
  const quality = acc <= 18 ? 'good' : acc <= 50 ? 'warn' : 'alert';

  appState.currentLat = point.lat;
  appState.currentLng = point.lng;

  $id('val-lat').textContent = point.lat.toFixed(4);
  $id('val-lng').textContent = point.lng.toFixed(4);
  const accTxt = `ACC:${Math.round(acc)}m`;
  $id('gps-acc').textContent = accTxt;
  const gps2 = $opt('gps-acc-2');
  if (gps2) gps2.textContent = accTxt;
  const gpsAccLabs = $opt('labs-accuracy');
  if (gpsAccLabs) gpsAccLabs.textContent = String(Math.round(acc));

  updateAltitudeDisplays(c.altitude);

  let nativeSpeedKmh: number | null = null;
  if (c.speed != null && Number.isFinite(c.speed) && c.speed >= 0) {
    nativeSpeedKmh = c.speed * 3.6;
  }

  let calcSpeedKmh: number | null = null;
  const ageOk = now - lastAcceptedGpsAt > 250;
  if (lastGpsPoint && ageOk) {
    const dt = Math.max((now - lastGpsPoint.t) / 1000, 0.15);
    const dist = haversineMeters(lastGpsPoint, point);
    if (isPlausibleMove(dist, dt, acc)) {
      calcSpeedKmh = (dist / dt) * 3.6;
      if (dist > 2) lastHeading = bearingDeg(lastGpsPoint, point);
    }
  }

  if (c.heading != null && Number.isFinite(c.heading) && c.heading >= 0 && nativeSpeedKmh !== null && nativeSpeedKmh > 3) {
    lastHeading = c.heading;
  }

  let rawSpeed = fuseSpeed(nativeSpeedKmh, calcSpeedKmh, acc);
  if (acc > 65 && rawSpeed < 6) rawSpeed = 0;
  if (rawSpeed > SPEED_GLITCH_KMH) rawSpeed = gpsFilteredSpeed;

  gpsSpeedBuffer.push(rawSpeed);
  if (gpsSpeedBuffer.length > GPS_BUF_MAX) gpsSpeedBuffer.shift();
  const medSpeed = medianSpeed(gpsSpeedBuffer);
  gpsFilteredSpeed = smoothVal(gpsFilteredSpeed, medSpeed, adaptiveGpsAlpha(acc));
  if (gpsFilteredSpeed < 1.0) gpsFilteredSpeed = 0;

  if (lastGpsPoint && ageOk && gpsFilteredSpeed > 2) {
    const dist = haversineMeters(lastGpsPoint, point);
    if (dist < 300) addTripDistance(dist);
  }

  lastGpsPoint = point;
  lastAcceptedGpsAt = now;

  setSpeedoArc(speedoDisplayKmh(gpsFilteredSpeed, SPEEDO_OFFSET_KMH));

  const displayHeading = gpsFilteredSpeed > 5 ? lastHeading : (compassHeading ?? lastHeading);
  updateCompassDisplays(displayHeading);
  feedNaviPoint(point.lat, point.lng);
  feedRidePoint({ lat: point.lat, lng: point.lng, t: now, alt: c.altitude, spd: gpsFilteredSpeed });
  updateRideState({
    speed: gpsFilteredSpeed,
    heading: lastHeading || 0,
    gpsAcc: acc,
    sensor: quality.toUpperCase(),
  });
  updateSensorChip(acc <= 18 ? 'GPS LOCK' : acc <= 50 ? 'GPS FAIR' : 'GPS LOW', quality);

  const d = Math.hypot((appState.currentLat as number) - (-7.25), (appState.currentLng as number) - 112.75);
  $id('geofence-alert').classList.toggle('hidden', d >= 0.05);
}

export async function startSpeedometer(): Promise<void> {
  if (geoWatchId !== null) return;
  if (!('geolocation' in navigator)) {
    showToast('GPS tidak didukung.', 'alert');
    return;
  }
  try {
    wakeLock = await (navigator as any).wakeLock?.request('screen');
  } catch (_) {}
  resetSpeedEngine();
  gpsFilteredSpeed = 0;
  lastGpsPoint = null;
  lastAcceptedGpsAt = 0;
  gpsSpeedBuffer = [];
  geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      setGpsDots('dot-on');
      $id('gps-status').textContent = 'GPS AKTIF';
      processGpsPosition(pos);
    },
    () => {
      setGpsDots('dot-err');
      $id('gps-status').textContent = 'GPS ERROR';
      updateSensorChip('GPS ERR', 'alert');
    },
    { enableHighAccuracy: true, maximumAge: 500, timeout: 10000 },
  );
  void import('./ui').then(m => m.updateMasterBtn()).catch(() => {});
}

export function stopSpeedometer(): void {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
  setGpsDots('dot-off');
  updateSensorChip(telActive ? 'IMU' : 'IDLE', telActive ? 'good' : 'idle');
  void import('./ui').then(m => m.updateMasterBtn()).catch(() => {});
}

export function triggerSOS(): void {
  if (appState.currentLat !== null && appState.currentLng !== null) {
    window.open(
      `sms:?body=${encodeURIComponent(`[DARURAT BCR] Butuh bantuan! Lokasi: https://maps.google.com/?q=${appState.currentLat},${appState.currentLng}`)}`,
      '_blank',
    );
  } else {
    showToast('Tunggu GPS terkunci…', 'warn');
  }
}

const TELE_ON =
  'background:rgba(var(--alr-rgb),.12);border:1px solid rgba(var(--alr-rgb),.4);color:var(--red2);font-family:"Exo 2",sans-serif;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;';
const TELE_OFF =
  'background:var(--s2);border:1px solid var(--border2);color:var(--muted2);font-family:"Exo 2",sans-serif;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;';

export const isTelemetryActive = (): boolean => telActive;
export const isGpsActive = (): boolean => geoWatchId !== null;

export function updateTelemetryBtns(active: boolean): void {
  ['btn-telemetry', 'btn-telemetry-ls', 'btn-telemetry-p'].forEach(id => {
    const b = $opt(id);
    if (!b) return;
    b.textContent = active ? 'STOP' : 'START';
    b.setAttribute('style', active ? TELE_ON : TELE_OFF);
  });
  void import('./ui').then(m => m.updateMasterBtn()).catch(() => {});
}

const ROT_MODES = ['auto', 'portrait', 'landscape'] as const;
let rotLockIdx = 0;

export function cycleRotLock(): void {
  rotLockIdx = (rotLockIdx + 1) % ROT_MODES.length;
  const mode = ROT_MODES[rotLockIdx];
  const btn = $opt('btn-rot-lock');
  const ico = $opt('rot-lock-icon');
  const lbl = $opt('rot-lock-label');
  if (!btn) return;
  btn.dataset.mode = mode;
  const icons = { auto: 'fa-rotate', portrait: 'fa-mobile-screen', landscape: 'fa-mobile-screen-button' };
  const labels = { auto: 'AUTO', portrait: 'PORT', landscape: 'LAND' };
  if (ico) ico.className = `fa-solid ${icons[mode]} text-[9px]`;
  if (lbl) lbl.textContent = labels[mode];
  document.body.classList.remove('force-portrait', 'force-landscape');
  if (mode === 'portrait') document.body.classList.add('force-portrait');
  if (mode === 'landscape') document.body.classList.add('force-landscape');
  leanBaseline = null;
  fusedLean = 0;
  updateLeanGauge(0);
  void import('./ui').then(m => m.relayoutDashboard()).catch(() => {});
  const modeLabels = {
    auto: 'Auto — layout mengikuti layar',
    portrait: 'Portrait terkunci 📱',
    landscape: 'Landscape terkunci 📱',
  };
  showToast(modeLabels[mode], 'muted');
}

function getOrientAngle(): number {
  const mode = ROT_MODES[rotLockIdx];
  if (mode === 'portrait') return 0;
  if (mode === 'landscape') return 90;
  return screen.orientation && screen.orientation.angle != null
    ? screen.orientation.angle
    : window.innerWidth > window.innerHeight
      ? 90
      : 0;
}

let telActive = false;
let crashTimer: ReturnType<typeof setInterval> | null = null;
let crashCount = 10;
let leanBaseline: number | null = null;
let lastOrientAt = 0;
let fusedLean = 0;
let filteredG = 1;
let filteredGx = 0;
let filteredGy = 0;

/* ── CRASH GATE — impact alone ≠ crash (speedbump/pothole ring the same
   bell). Arm on a hard hit while moving, then confirm: a secondary hit,
   a sustained scrub, or a GPS speed collapse. Confirm ⇒ SOS modal. */
interface CrashArm {
  at: number;
  speed0: number;
  hits: number;
  lastHitAt: number;
  lastSpeedAt: number;
  lowSpeed: number;
}
const CRASH_IMPACT_G = 2.6;
const CRASH_MIN_SPEED_KMH = 8;
const CRASH_WINDOW_MS = 3200;
const CRASH_REARM_MS = 25000;
let crashArm: CrashArm | null = null;
let crashCooldownUntil = 0;

function confirmCrash(): void {
  crashArm = null;
  crashCooldownUntil = Date.now() + CRASH_REARM_MS;
  triggerAutoCrash();
}

function noteCrashImpact(medG: number): void {
  const now = Date.now();

  // Wall-level hit while riding fast needs no confirmation.
  if (medG >= 5.5 && rideState.speed >= 20) { confirmCrash(); return; }
  if (crashTimer || now < crashCooldownUntil) return;

  const spd = rideState.speed;
  if (!crashArm) {
    if (medG >= CRASH_IMPACT_G && spd >= CRASH_MIN_SPEED_KMH) {
      crashArm = { at: now, speed0: spd, hits: 1, lastHitAt: now, lastSpeedAt: now, lowSpeed: 0 };
    }
    return;
  }

  if (now - crashArm.at > CRASH_WINDOW_MS) { crashArm = null; return; } // lone bump, ride went on

  // 1 — secondary impact shortly after the first (bike → ground/rider)
  if (medG >= 2.2 && now - crashArm.at >= 150 && now - crashArm.lastHitAt >= 120) confirmCrash();

  // 2 — shake keeps landing (slide / scrub)
  if (medG >= CRASH_IMPACT_G) {
    crashArm.hits = now - crashArm.lastHitAt >= 120 ? crashArm.hits + 1 : crashArm.hits;
    crashArm.lastHitAt = now;
    if (crashArm.hits >= 4) confirmCrash();
  }

  // 3 — GPS speed collapses after the impact (skid stop)
  if (crashArm && spd <= Math.max(3, crashArm.speed0 * 0.55) && now - crashArm.lastSpeedAt >= 600) {
    crashArm.lastSpeedAt = now;
    crashArm.lowSpeed++;
    if (crashArm.lowSpeed >= 2) confirmCrash();
  }
}

const G_BUF_SIZE = 5;
const gBuffer = Array(G_BUF_SIZE).fill(1.0);
let gBufIdx = 0;

const medianG = (rawG: number): number => {
  gBuffer[gBufIdx % G_BUF_SIZE] = rawG;
  gBufIdx++;
  const sorted = [...gBuffer].sort((a, b) => a - b);
  return sorted[Math.floor(G_BUF_SIZE / 2)];
};

const clampLean = (angle: number): number => Math.max(-90, Math.min(90, angle));

export function calibrateLean(): void {
  if (!telActive) {
    showToast('Mulai telemetri dulu!', 'warn');
    return;
  }
  leanBaseline = null;
  showToast('Lean Angle Dikalibrasi (0°)', 'gold2');
}

function applyLeanAngle(rawAngle: number, source = 'IMU'): void {
  if (!Number.isFinite(rawAngle)) return;
  if (leanBaseline === null) leanBaseline = rawAngle;
  const target = clampLean(rawAngle - leanBaseline);
  const snapped = Math.abs(target) < 1.5 ? 0 : target;
  const delta = Math.abs(snapped - fusedLean);
  const alpha = delta > 20 ? 0.3 : delta > 10 ? 0.2 : 0.12;
  fusedLean = smoothVal(fusedLean, snapped, alpha);
  updateLeanGauge(fusedLean);
  updateRideState({ lean: fusedLean, sensor: source });
}

function leanFromAcceleration(acc: DeviceMotionEventAcceleration): number | null {
  const x = acc.x || 0;
  const y = acc.y || 0;
  const z = acc.z || 0;
  const orientAngle = getOrientAngle();
  if (orientAngle === 0 || orientAngle === 180) {
    if (Math.abs(x) + Math.abs(z) < 0.25) return null;
    return (Math.atan2(x, z) * 180) / Math.PI;
  }
  const sign = orientAngle === 270 ? -1 : 1;
  if (Math.abs(y) + Math.abs(z) < 0.25) return null;
  return (sign * Math.atan2(y, z) * 180) / Math.PI;
}

function handleMotion(e: DeviceMotionEvent): void {
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;
  const rawG = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2) / 9.81;
  const medG = medianG(rawG);
  const targetG = Math.abs(medG - 1.0) < 0.05 ? 1.0 : medG;
  filteredG = smoothVal(filteredG, targetG, targetG > filteredG ? 0.28 : 0.16);
  const rawGx = (acc.x || 0) / 9.81;
  const rawGy = (acc.y || 0) / 9.81;
  filteredGx = smoothVal(filteredGx, rawGx, 0.2);
  filteredGy = smoothVal(filteredGy, rawGy, 0.2);
  const labsG = $opt('gforce-val');
  if (labsG) labsG.textContent = filteredG.toFixed(1);
  updateGForceMeter(filteredG, filteredGx, filteredGy);
  updateRideState({ g: filteredG, gx: filteredGx, gy: filteredGy });
  pushVibrationSample((acc.x || 0) / 9.81, (acc.y || 0) / 9.81, (acc.z || 0) / 9.81, Date.now());
  if (Date.now() - lastOrientAt > 500) {
    const motionLean = leanFromAcceleration(acc);
    if (motionLean !== null) applyLeanAngle(motionLean, 'MOTION');
  }
  noteCrashImpact(medG);
}

function handleOrient(e: DeviceOrientationEvent): void {
  const orientAngle = getOrientAngle();
  let leanRaw: number | null;
  if (orientAngle === 0 || orientAngle === 180) {
    if (e.gamma === null || e.gamma === undefined) return;
    leanRaw = e.gamma;
  } else {
    if (e.beta === null || e.beta === undefined) return;
    const sign = orientAngle === 270 ? -1 : 1;
    leanRaw = sign * e.beta;
  }
  if (!Number.isFinite(leanRaw)) return;
  lastOrientAt = Date.now();
  applyLeanAngle(leanRaw, 'ORIENT');

  const oe = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
  const raw = oe.webkitCompassHeading ?? (e.alpha != null && Number.isFinite(e.alpha) ? 360 - e.alpha : null);
  if (raw != null && Number.isFinite(raw)) {
    compassHeading = ((raw % 360) + 360) % 360;
    updateCompassDisplays(compassHeading);
  }
}

async function requestSensorPermissions(): Promise<boolean> {
  const requests: Promise<string>[] = [];
  if (typeof (DeviceMotionEvent as any) !== 'undefined' && typeof (DeviceMotionEvent as any).requestPermission === 'function') {
    requests.push((DeviceMotionEvent as any).requestPermission());
  }
  if (typeof (DeviceOrientationEvent as any) !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
    requests.push((DeviceOrientationEvent as any).requestPermission());
  }
  const results = await Promise.all(requests);
  return results.length === 0 || results.some(s => s === 'granted');
}

function startTelemetry(): void {
  if (telActive) return;
  telActive = true;
  leanBaseline = null;
  lastOrientAt = 0;
  fusedLean = 0;
  filteredG = 1;
  filteredGx = 0;
  filteredGy = 0;
  vibReset();
  crashArm = null;
  updateTelemetryBtns(true);
  const strip = $opt('portrait-tele');
  if (strip) (strip as HTMLElement).style.display = 'grid';
  window.addEventListener('devicemotion', handleMotion);
  window.addEventListener('deviceorientation', handleOrient);
  updateSensorChip('IMU ARM', 'good');
  showToast('Telemetri aktif — posisi ini dikalibrasi', 'gold2');
}

export function stopTelemetry(): void {
  if (!telActive) return;
  telActive = false;
  window.removeEventListener('devicemotion', handleMotion);
  window.removeEventListener('deviceorientation', handleOrient);
  compassHeading = null;
  updateCompassDisplays(lastHeading);
  updateTelemetryBtns(false);
  const strip = $opt('portrait-tele');
  if (strip) (strip as HTMLElement).style.display = 'none';
  leanBaseline = null;
  fusedLean = 0;
  filteredG = 1;
  filteredGx = 0;
  filteredGy = 0;
  updateGForceMeter(1, 0, 0);
  updateLeanGauge(0);
  vibReset();
  crashArm = null;
  updateRideState({ lean: 0, g: 1, gx: 0, gy: 0, vib: 0, sensor: 'IDLE' });
  updateSensorChip(geoWatchId !== null ? 'GPS' : 'IDLE', geoWatchId !== null ? 'good' : 'idle');
}

export async function toggleTelemetry(): Promise<void> {
  if (telActive) {
    stopTelemetry();
    return;
  }
  try {
    const granted = await requestSensorPermissions();
    if (!granted) {
      showToast('Izin sensor ditolak', 'alert');
      return;
    }
    startTelemetry();
  } catch (err) {
    console.error('[Telemetry permission]', err);
    showToast('Sensor tidak tersedia', 'alert');
  }
}

function triggerAutoCrash(): void {
  $id('crash-modal').classList.remove('hidden');
  crashCount = 10;
  $id('crash-count').textContent = String(crashCount);
  crashTimer = setInterval(() => {
    crashCount--;
    $id('crash-count').textContent = String(crashCount);
    if (crashCount <= 0) {
      clearInterval(crashTimer as ReturnType<typeof setInterval>);
      crashTimer = null;
      triggerSOS();
      $id('crash-modal').classList.add('hidden');
    }
  }, 1000);
}

export function cancelCrash(): void {
  if (crashTimer) clearInterval(crashTimer);
  crashTimer = null;
  crashCooldownUntil = Date.now() + CRASH_REARM_MS;
  crashArm = null;
  $id('crash-modal').classList.add('hidden');
}
