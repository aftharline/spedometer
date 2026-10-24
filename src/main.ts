import './app.css';
import { registerSW } from 'virtual:pwa-register';

import { toggleAudioRPM } from './audio';
import { DB_NAME, initDB } from './db';
import { buildCompassSVG, buildGForceSVG, buildLeanSVG, buildSpeedoSVG, resetMaxSpeed, setSpeedoArc, updateGForceMeter } from './gauges';
import { resetTrip } from './hud';
import { closeModal, closeAllModals, openModal, overlayTap, showConfirm } from './modals';
import { connectOBD2 } from './obd';
import { naviCenterMe, naviOpenGMaps, naviPickDest, naviSearchInput, naviStart, naviStop, naviUseFav } from './navi';
import { processAIOdometer, triggerAiScanner } from './ocr';
import { closePhotoModal, openPhotoModal, photoNext, pickPhotos, sharePhoto } from './ride-photos';
import { snapLivePhoto, stopLiveCam, toggleLiveCam } from './livecam';
import { calibrateLean, cancelCrash, cycleRotLock, toggleTelemetry, triggerSOS } from './telemetry';
import { applyTheme, openThemePicker, pickTheme } from './themes';
import { showToast } from './toast';
import { initInstallPrompt, installApp } from './pwa-install';
import {
  addCheckItem,
  confirmClearChecklist,
  deleteCheck,
  deleteCurrentRide,
  exportDataCSV,
  initRecBtn,
  openRideDetail,
  onRecBtnTap,
  openVehicleDetail,
  pageRideStart,
  shareCurrentRide,
  switchDashboardMode,
  switchView,
  toggleCheck,
  toggleMasterSensors,
  updateMasterBtn,
  updateTypeUI,
} from './ui';

function recoverDB(): void {
  const req = indexedDB.deleteDatabase(DB_NAME);
  req.onsuccess = () => {
    showToast('DB dihapus. Reload…', 'gold');
    setTimeout(() => location.reload(), 2000);
  };
  req.onerror = () => showToast('Gagal hapus DB. Coba manual.', 'alert');
}

Object.assign(window, {
  switchView,
  setSpeedoArc,
  closePhotoModal,
  openPhotoModal,
  photoNext,
  installApp,
  pickPhotos,
  sharePhoto,
  toggleLiveCam,
  stopLiveCam,
  snapLivePhoto,
  openModal,
  closeModal,
  closeAllModals,
  overlayTap,
  exportDataCSV,
  triggerAiScanner,
  processAIOdometer,
  cycleRotLock,
  resetMaxSpeed,
  calibrateLean,
  toggleTelemetry,
  toggleAudioRPM,
  triggerSOS,
  resetTrip,
  connectOBD2,
  confirmClearChecklist,
  addCheckItem,
  updateTypeUI,
  cancelCrash,
  openVehicleDetail,
  toggleCheck,
  deleteCheck,
  toggleMasterSensors,
  onRecBtnTap,
  openRideDetail,
  shareCurrentRide,
  deleteCurrentRide,
  switchDashboardMode,
  naviSearchInput,
  naviPickDest,
  naviUseFav,
  naviStart,
  naviStop,
  naviOpenGMaps,
  naviCenterMe,
  openThemePicker,
  pickTheme,
  recoverDB,
});

window.addEventListener('load', async () => {
  const t0 = Date.now();
  buildSpeedoSVG();
  buildGForceSVG();
  buildLeanSVG();
  buildCompassSVG();
  initRecBtn();
  updateMasterBtn();
  updateGForceMeter(1, 0, 0);
  applyTheme(document.documentElement.getAttribute('data-theme') || 'bcr');

  try {
    await initDB();
  } catch (err) {
    console.error('[DB]', err);
    await hideSplash(t0);
    const main = document.getElementById('main-content');
    if (main) {
      main.innerHTML = `
          <div class="flex flex-col items-center justify-center gap-5 p-8 h-full">
            <div class="w-16 h-16 flex items-center justify-center clip-md" style="background:rgba(var(--alr-rgb),.1);border:1px solid rgba(var(--alr-rgb),.35)"><i class="fa-solid fa-database text-2xl red-text"></i></div>
            <div class="text-center"><p class="f-exo font-black text-lg uppercase tracking-widest red-text">Database Error</p>
            <p class="f-mono text-xs mt-2" style="color:var(--muted2)">${(err as Error).message || 'IndexedDB tidak tersedia'}</p></div>
            <button onclick="recoverDB()" class="btn-fill-gold clip-sm px-6 py-3 text-xs tracking-[3px]">RESET & PERBAIKI DB</button></div>`;
    }
    return;
  }

  await hideSplash(t0);
  switchView('garage');
  initInstallPrompt();
  registerSW({ immediate: true });
});

/* Sweep tachometer di splash berjalan penuh walau DB siap cepat. */
async function hideSplash(t0: number): Promise<void> {
  const min = 2100;
  await new Promise(r => setTimeout(r, Math.max(0, min - (Date.now() - t0))));
  try { await document.fonts.ready; } catch { /* font API tidak ada */ }
  const s = document.getElementById('splash');
  if (!s) return;
  s.classList.add('is-done');
  setTimeout(() => s.remove(), 700);
}
