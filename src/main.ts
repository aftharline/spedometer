import './app.css';
import { registerSW } from 'virtual:pwa-register';

import { toggleAudioRPM } from './audio';
import { DB_NAME, initDB } from './db';
import { buildCompassSVG, buildGForceSVG, buildLeanSVG, buildSpeedoSVG, resetMaxSpeed, updateGForceMeter } from './gauges';
import { resetTrip } from './hud';
import { closeAllModals, closeModal, openModal, overlayTap } from './modals';
import { connectOBD2 } from './obd';
import { processAIOdometer, triggerAiScanner } from './ocr';
import { calibrateLean, cancelCrash, cycleRotLock, toggleTelemetry, triggerSOS } from './telemetry';
import { showToast } from './toast';
import {
  addCheckItem,
  applyTheme,
  confirmClearChecklist,
  deleteCheck,
  deleteCurrentRide,
  exportDataCSV,
  initRecBtn,
  openRideDetail,
  onRecBtnTap,
  openVehicleDetail,
  shareCurrentRide,
  switchView,
  toggleCheck,
  toggleMasterSensors,
  toggleTheme,
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
  toggleTheme,
  switchView,
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
  recoverDB,
});

window.addEventListener('load', async () => {
  buildSpeedoSVG();
  buildGForceSVG();
  buildLeanSVG();
  buildCompassSVG();
  initRecBtn();
  updateMasterBtn();
  updateGForceMeter(1, 0, 0);
  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

  try {
    await initDB();
  } catch (err) {
    console.error('[DB]', err);
    const main = document.getElementById('main-content');
    if (main) {
      main.innerHTML = `
          <div class="flex flex-col items-center justify-center gap-5 p-8 h-full">
            <div class="w-16 h-16 flex items-center justify-center clip-md" style="background:rgba(204,17,34,.1);border:1px solid rgba(204,17,34,.35)"><i class="fa-solid fa-database text-2xl red-text"></i></div>
            <div class="text-center"><p class="f-exo font-black text-lg uppercase tracking-widest red-text">Database Error</p>
            <p class="f-mono text-xs mt-2" style="color:var(--muted2)">${(err as Error).message || 'IndexedDB tidak tersedia'}</p></div>
            <button onclick="recoverDB()" class="btn-fill-gold clip-sm px-6 py-3 text-xs tracking-[3px]">RESET & PERBAIKI DB</button></div>`;
    }
    return;
  }

  switchView('garage');
  registerSW({ immediate: true });
});
