import { isAudioActive, stopAudioRPM, toggleAudioRPM } from './audio';
import { dbAction } from './db';
import { closeModal, showConfirm } from './modals';
import { appState } from './state';
import { isGpsActive, isTelemetryActive, startSpeedometer, stopSpeedometer, stopTelemetry, toggleTelemetry } from './telemetry';
import { showToast } from './toast';
import type { ChecklistItem, LogEntry, Vehicle, VehicleType } from './types';
import { $id, $opt, escapeHTML } from './util';

export function applyTheme(t: string): void {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', t === 'light' ? '#f0ece4' : '#080808');
  ['btn-theme', 'btn-theme-ls'].forEach(id => {
    const btn = $opt(id);
    if (!btn) return;
    btn.innerHTML =
      t === 'light'
        ? '<i class="fa-solid fa-moon text-xs" style="color:var(--gold)"></i>'
        : '<i class="fa-solid fa-sun text-xs gold-text"></i>';
  });
}

export function toggleTheme(): void {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ── MASTER SENSOR BUTTON ───────────────────────────── */
export const allSensorsOn = (): boolean => isGpsActive() && isTelemetryActive() && isAudioActive();

export function updateMasterBtn(): void {
  const btn = $opt('btn-master');
  if (!btn) return;
  const on = allSensorsOn();
  btn.classList.toggle('all-on', on);
  btn.innerHTML = `<i class="fa-solid fa-power-off text-[10px]"></i><span>${on ? 'LIVE' : 'ALL ON'}</span>`;
}

export async function toggleMasterSensors(): Promise<void> {
  if (allSensorsOn()) {
    stopSpeedometer();
    stopTelemetry();
    stopAudioRPM();
    showToast('Semua sensor dimatikan', 'muted');
  } else {
    await startSpeedometer();
    if (!isTelemetryActive()) await toggleTelemetry();
    if (!isAudioActive()) await toggleAudioRPM();
    if (allSensorsOn()) showToast('Semua sensor aktif', 'gold2');
    else showToast('Sebagian sensor gagal — cek izin GPS/mic', 'warn');
  }
  updateMasterBtn();
}

export function updateTypeUI(): void {
  const checked = document.querySelector('input[name="v_type"]:checked') as HTMLInputElement | null;
  if (!checked) return;
  const isMo = checked.value === 'motor';
  const activeStyle = 'background:var(--s2);border:1px solid rgba(212,160,23,.4);';
  const idleStyle = 'background:var(--s2);border:1px solid var(--border2);';
  ['motor', 'mobil'].forEach(t => {
    const lbl = $opt('lbl-' + t);
    if (!lbl) return;
    const isActive = t === 'motor' ? isMo : !isMo;
    lbl.setAttribute('style', isActive ? activeStyle : idleStyle);
    const icon = lbl.querySelector('i') as HTMLElement;
    icon.className = 'fa-solid fa-' + (t === 'motor' ? 'motorcycle' : 'car') + ' ' + (isActive ? 'gold-text' : '');
    icon.style.color = isActive ? '' : 'var(--muted2)';
    const span = lbl.querySelector('span') as HTMLElement;
    span.className = 'f-exo font-bold text-xs tracking-widest uppercase ' + (isActive ? 'gold-text' : '');
    span.style.color = isActive ? '' : 'var(--muted2)';
  });
}

const normalizeVehicleType = (type: string): VehicleType => (type === 'mobil' ? 'mobil' : 'motor');

const ALL_VIEWS = ['garage', 'details', 'dashboard', 'touring', 'ride-detail', 'labs', 'checklist'];

export function switchView(view: string): void {
  ALL_VIEWS.forEach(v => $id('view-' + v).classList.add('hidden'));
  ['garage', 'dashboard', 'touring', 'labs', 'checklist'].forEach(v => {
    const b = $opt('nav-' + v);
    if (b) b.classList.remove('is-active', 'is-active-red');
  });
  const navKey = view === 'details' ? 'garage' : view === 'ride-detail' ? 'touring' : view;
  const nb = $opt('nav-' + navKey);
  if (nb) nb.classList.add(view === 'labs' ? 'is-active-red' : 'is-active');
  $id('view-' + view).classList.remove('hidden');

  const titles: Record<string, string> = {
    garage: 'BCR Garage',
    details: 'Detail Kendaraan',
    dashboard: 'BCR Live Ride',
    touring: 'BCR Touring',
    'ride-detail': 'BCR Touring',
    labs: 'BCR Sensor Suite',
    checklist: 'Touring Gear Check',
  };
  $id('header-subtitle').textContent = titles[view] || 'Black Crown Riders Surabaya';

  if (view === 'dashboard') {
    void startSpeedometer();
    import('./three-scene')
      .then(m => m.initThreeScene())
      .catch(err => console.error('[3D]', err));
  }
  if (view === 'touring') void loadRides();
  if (view === 'ride-detail') destroyRideMap();
  if (view === 'garage') void loadVehicles();
  if (view === 'checklist') void loadChecklist();
}

export async function loadVehicles(): Promise<void> {
  try {
    const list = await dbAction<Vehicle[]>('vehicles', 'getAll');
    const el = $id('vehicle-list');
    if (!list.length) {
      el.innerHTML = `<div class="flex flex-col items-center justify-center py-12 gap-3 clip-tr" style="background:var(--s1);border:1px dashed var(--border2)">
              <i class="fa-solid fa-crown text-4xl" style="color:var(--muted)"></i>
              <p class="f-exo font-bold text-xs tracking-[3px] uppercase" style="color:var(--muted)">Garasi Kosong</p>
              <p class="f-rajd text-xs" style="color:var(--muted)">Tap TAMBAH untuk daftar kendaraan BCR</p></div>`;
      return;
    }
    el.innerHTML = '';
    list.forEach(v => {
      const type = normalizeVehicleType(v.type);
      const isM = type === 'motor';
      const c = document.createElement('div');
      c.className = 'vehicle-card clip-tr p-4 flex items-center gap-4';
      c.onclick = () => openVehicleDetail(v.id, v.name, v.brand, type);
      c.innerHTML = `<div class="flex-shrink-0 w-12 h-12 flex items-center justify-center text-xl clip-sm" style="background:rgba(212,160,23,.07);border:1px solid rgba(212,160,23,.18)"><i class="fa-solid ${isM ? 'fa-motorcycle' : 'fa-car'} gold-text"></i></div>
              <div class="flex-1 min-w-0"><h3 class="f-exo font-black text-base uppercase tracking-wide leading-none">${escapeHTML(v.name)}</h3>
              <p class="f-rajd text-xs tracking-widest uppercase mt-1" style="color:var(--muted2)">${escapeHTML(v.brand)} · ${type.toUpperCase()}</p></div>
              <i class="fa-solid fa-chevron-right text-sm gold-text opacity-40 flex-shrink-0"></i>`;
      el.appendChild(c);
    });
  } catch (err) {
    showToast('Gagal memuat garasi', 'alert');
  }
}

export function openVehicleDetail(id: string, name: string, brand: string, type: string): void {
  appState.currentVehicleId = id;
  const normalized = normalizeVehicleType(type);
  const isM = normalized === 'motor';
  $id('detail-name').textContent = name.toUpperCase();
  $id('detail-brand').textContent = `${brand} · ${normalized.toUpperCase()}`;
  $id('detail-icon').innerHTML = `<i class="fa-solid ${isM ? 'fa-motorcycle' : 'fa-car'} gold-text"></i>`;
  void loadLogs();
  switchView('details');
}

async function loadLogs(): Promise<void> {
  if (!appState.currentVehicleId) return;
  try {
    const raw = await dbAction<LogEntry[]>('logs', 'getIndex', null, 'vehicleId', appState.currentVehicleId);
    const el = $id('logs-list');
    raw.sort((a, b) => Number(a.odo) - Number(b.odo));
    let prevOdo: number | null = null;
    const processed = raw
      .map(l => {
        if (l.logType === 'fuel') {
          const eff = prevOdo !== null ? ((l.odo - prevOdo) / parseFloat(String(l.liter))).toFixed(1) : null;
          prevOdo = l.odo;
          return { ...l, eff };
        }
        return l;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (!processed.length) {
      el.innerHTML = `<p class="text-center f-rajd text-xs tracking-widest uppercase py-8" style="color:var(--muted)">BELUM ADA RIWAYAT</p>`;
      return;
    }
    el.innerHTML = processed
      .map(l => {
        const svc = l.logType === 'service';
        const clr = svc ? 'var(--gold)' : 'var(--gold2)';
        const ico = svc ? 'fa-wrench' : 'fa-gas-pump';
        const badge =
          !svc && l.eff
            ? `<span class="f-mono text-[8px] px-1.5 py-0.5" style="background:rgba(212,160,23,.1);border:1px solid rgba(212,160,23,.2);color:var(--gold)">${l.eff} KM/L</span>`
            : '';
        const lbl = svc ? escapeHTML(l.parts) : `ISI BENSIN ${escapeHTML(l.liter)}L`;
        return `<div class="log-item clip-tr p-3 flex items-center gap-3">
              <div class="w-9 h-9 flex-shrink-0 flex items-center justify-center clip-sm" style="background:var(--s2);border:1px solid var(--border)"><i class="fa-solid ${ico} text-xs" style="color:${clr}"></i></div>
              <div class="flex-1 min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="f-exo font-bold text-xs uppercase tracking-wide truncate">${lbl}</span>${badge}</div>
              <div class="flex justify-between items-center mt-0.5"><span class="f-mono text-[10px]" style="color:var(--muted2)">${escapeHTML(l.odo)} KM</span>
              <div class="flex items-center gap-2"><span class="f-mono text-[10px] gold-text">Rp${(l.cost || 0).toLocaleString('id-ID')}</span><span class="f-rajd text-[9px]" style="color:var(--muted)">${escapeHTML(l.date)}</span></div></div></div></div>`;
      })
      .join('');
  } catch (err) {
    showToast('Gagal memuat riwayat', 'alert');
  }
}

const todayISO = new Date().toISOString().split('T')[0];
($id('s_date') as HTMLInputElement).value = todayISO;
($id('f_date') as HTMLInputElement).value = todayISO;

const formVehicle = $id('form-vehicle') as HTMLFormElement;
formVehicle.onsubmit = async e => {
  e.preventDefault();
  try {
    const checked = document.querySelector('input[name="v_type"]:checked') as HTMLInputElement;
    await dbAction('vehicles', 'add', {
      id: 'v_' + Date.now(),
      type: checked.value,
      name: ($id('v_name') as HTMLInputElement).value.trim(),
      brand: ($id('v_brand') as HTMLInputElement).value.trim(),
    });
    closeModal('modal-add-vehicle');
    formVehicle.reset();
    updateTypeUI();
    showToast('Kendaraan tersimpan!', 'gold');
    void loadVehicles();
  } catch (err) {
    showToast('Gagal simpan: ' + ((err as Error).name || err), 'alert');
  }
};

const formService = $id('form-service') as HTMLFormElement;
formService.onsubmit = async e => {
  e.preventDefault();
  const today = new Date().toISOString().split('T')[0];
  try {
    await dbAction('logs', 'add', {
      vehicleId: appState.currentVehicleId,
      logType: 'service',
      date: ($id('s_date') as HTMLInputElement).value,
      odo: parseInt(($id('s_odo') as HTMLInputElement).value),
      parts: ($id('s_parts') as HTMLInputElement).value,
      cost: parseInt(($id('s_cost') as HTMLInputElement).value || '0'),
    });
    closeModal('modal-add-service');
    formService.reset();
    ($id('s_date') as HTMLInputElement).value = today;
    void loadLogs();
    showToast('Servis dicatat!', 'gold2');
  } catch (err) {
    showToast('Gagal simpan', 'alert');
  }
};

const formFuel = $id('form-fuel') as HTMLFormElement;
formFuel.onsubmit = async e => {
  e.preventDefault();
  const today = new Date().toISOString().split('T')[0];
  try {
    await dbAction('logs', 'add', {
      vehicleId: appState.currentVehicleId,
      logType: 'fuel',
      date: ($id('f_date') as HTMLInputElement).value,
      odo: parseInt(($id('f_odo') as HTMLInputElement).value),
      liter: parseFloat(($id('f_liter') as HTMLInputElement).value),
      cost: parseInt(($id('f_cost') as HTMLInputElement).value || '0'),
    });
    closeModal('modal-add-fuel');
    formFuel.reset();
    ($id('f_date') as HTMLInputElement).value = today;
    void loadLogs();
    showToast('Bensin dicatat!', 'gold');
  } catch (err) {
    showToast('Gagal simpan', 'alert');
  }
};

export async function exportDataCSV(): Promise<void> {
  if (!appState.currentVehicleId) return;
  try {
    const logs = await dbAction<LogEntry[]>('logs', 'getIndex', null, 'vehicleId', appState.currentVehicleId);
    if (!logs.length) {
      showToast('Tidak ada data!', 'warn');
      return;
    }
    const csvCell = (value: unknown): string => {
      let s = String(value ?? '');
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    };
    let csv = 'Tanggal,Tipe,KM,Detail,Liter,Biaya\n';
    logs
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach(r => {
        csv += [r.date, r.logType, r.odo, r.parts || '-', r.liter || '-', r.cost || 0].map(csvCell).join(',') + '\n';
      });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `BCRide_${Date.now()}.csv`;
    a.click();
    showToast('Download CSV dimulai!', 'gold');
  } catch (err) {
    showToast('Gagal export', 'alert');
  }
}

export async function loadChecklist(): Promise<void> {
  try {
    const items = await dbAction<ChecklistItem[]>('checklists', 'getAll');
    const el = $id('checklist-items');
    if (!items.length) {
      el.innerHTML = `<p class="text-center f-rajd text-xs tracking-widest uppercase py-8" style="color:var(--muted)">DAFTAR KOSONG</p>`;
      return;
    }
    el.innerHTML = items
      .map(it => {
        const id = Number(it.id);
        return `<div class="check-item clip-tr p-3 flex items-center gap-3 ${it.done ? 'is-done' : ''}">
          <button onclick="toggleCheck(${id},${!it.done})" aria-label="${it.done ? 'Tandai belum selesai' : 'Tandai selesai'}" class="w-6 h-6 flex items-center justify-center flex-shrink-0 clip-sm" style="border:1.5px solid ${it.done ? 'var(--gold)' : 'var(--border2)'};background:${it.done ? 'rgba(212,160,23,.12)' : 'transparent'}">
            ${it.done ? '<i class="fa-solid fa-check text-[9px] gold-text"></i>' : ''}</button>
          <span class="flex-1 f-rajd text-sm tracking-wide ${it.done ? 'line-through' : ''}" style="color:${it.done ? 'var(--muted)' : 'var(--text)'}">${escapeHTML(it.text)}</span>
          <button onclick="deleteCheck(${id})" aria-label="Hapus item checklist" class="w-7 h-7 flex items-center justify-center" style="color:var(--muted)"><i class="fa-solid fa-xmark text-xs"></i></button></div>`;
      })
      .join('');
  } catch (err) {
    showToast('Gagal load checklist', 'alert');
  }
}

export async function addCheckItem(): Promise<void> {
  const inp = $id('c_item') as HTMLInputElement;
  const text = inp.value.trim();
  if (!text) return;
  try {
    await dbAction('checklists', 'add', { text, done: false });
    inp.value = '';
    void loadChecklist();
  } catch (err) {
    showToast('Gagal tambah item', 'alert');
  }
}

$id('c_item').addEventListener('keydown', e => {
  if ((e as KeyboardEvent).key === 'Enter') {
    e.preventDefault();
    void addCheckItem();
  }
});

export async function toggleCheck(id: number, done: boolean): Promise<void> {
  try {
    const item = await dbAction<ChecklistItem>('checklists', 'get', id);
    if (item) {
      item.done = done;
      await dbAction('checklists', 'put', item);
    }
    void loadChecklist();
  } catch (err) {
    showToast('Gagal update', 'alert');
  }
}

export async function deleteCheck(id: number): Promise<void> {
  try {
    await dbAction('checklists', 'delete', id);
    void loadChecklist();
  } catch (err) {
    showToast('Gagal hapus', 'alert');
  }
}

export function confirmClearChecklist(): void {
  showConfirm('Reset Checklist', 'Semua item akan dihapus permanen.', 'RESET', async () => {
    await dbAction('checklists', 'clear');
    void loadChecklist();
  });
}

$id('btn-settings').onclick = () => showToast('BCR Settings — coming soon', 'muted');

/* ── BCR TOURING ────────────────────────────────────── */
import leaflet, { type Map as LeafletMap } from 'leaflet';
import { splitsPerKm } from './geo';
import { formatDuration, isRecording, shareGPX, startRecording, stopRecording, updateRecBtn } from './ride';
import type { Ride } from './types';

let rideMap: LeafletMap | null = null;
let currentRideId: number | null = null;

function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export async function loadRides(): Promise<void> {
  try {
    const [rides, vehicles] = await Promise.all([
      dbAction<Ride[]>('rides', 'getAll'),
      dbAction<Vehicle[]>('vehicles', 'getAll'),
    ]);
    const done = rides.filter(r => r.id !== -1).sort((a, b) => b.start - a.start);
    const vName = (id: string) => vehicles.find(v => v.id === id)?.name ?? '—';

    // Header stats
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekKm = done.filter(r => r.start >= weekStart.getTime()).reduce((s, r) => s + r.distKm, 0);
    const totalKm = done.reduce((s, r) => s + r.distKm, 0);
    const topSpeed = done.reduce((s, r) => Math.max(s, r.maxKmh), 0);
    const sWeek = $opt('ts-week');
    if (sWeek) sWeek.textContent = weekKm.toFixed(0);
    const sTotal = $opt('ts-total');
    if (sTotal) sTotal.textContent = done.length.toString();
    const sKm = $opt('ts-km');
    if (sKm) sKm.textContent = totalKm.toFixed(0);
    const sTop = $opt('ts-top');
    if (sTop) sTop.textContent = String(topSpeed);

    const el = $id('ride-list');
    if (!done.length) {
      el.innerHTML = `<div class="flex flex-col items-center justify-center py-12 gap-3 clip-tr" style="background:var(--s1);border:1px dashed var(--border2)">
        <i class="fa-solid fa-route text-4xl" style="color:var(--muted)"></i>
        <p class="f-exo font-bold text-xs tracking-[3px] uppercase" style="color:var(--muted)">Belum Ada Ride</p>
        <p class="f-rajd text-xs text-center px-6" style="color:var(--muted)">Tekan REC di halaman Ride saat mulai touring — rute, jarak & kecepatan terekam otomatis</p></div>`;
      return;
    }
    el.innerHTML = done
      .map(
        r => `<div class="ride-card clip-tr" onclick="openRideDetail(${r.id})">
        <div class="ride-card-accent"></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="f-exo font-bold text-sm uppercase tracking-wider truncate">${escapeHTML(r.name)}</h3>
          </div>
          <p class="f-rajd text-[10px] tracking-widest uppercase mt-0.5" style="color:var(--muted2)">${fmtDate(r.start)} · ${escapeHTML(vName(r.vehicleId))}</p>
          <div class="ride-stats">
            <span><i class="fa-solid fa-road"></i>${r.distKm.toFixed(1)} km</span>
            <span><i class="fa-solid fa-stopwatch"></i>${formatDuration(r.movingSec)}</span>
            <span><i class="fa-solid fa-gauge-high"></i>${r.avgKmh} km/h</span>
            <span><i class="fa-solid fa-arrow-trend-up"></i>${r.maxKmh} max</span>
          </div>
        </div>
        <i class="fa-solid fa-chevron-right text-xs flex-shrink-0" style="color:var(--muted)"></i>
      </div>`,
      )
      .join('');
  } catch (err) {
    console.error('[Rides]', err);
    showToast('Gagal memuat ride', 'alert');
  }
}

export async function openRideDetail(id: number): Promise<void> {
  try {
    const ride = await dbAction<Ride>('rides', 'get', id);
    if (!ride) return;
    currentRideId = id;
    switchView('ride-detail');

    $id('rd-name').textContent = ride.name;
    $id('rd-date').textContent = fmtDate(ride.start);
    $id('rd-dist').textContent = ride.distKm.toFixed(1);
    $id('rd-time').textContent = formatDuration(ride.movingSec);
    $id('rd-avg').textContent = String(ride.avgKmh);
    $id('rd-max').textContent = String(ride.maxKmh);
    const gain = $opt('rd-gain');
    if (gain) gain.textContent = ride.gainM > 0 ? `${ride.gainM} m` : '—';

    renderSpeedChart(ride);
    renderSplits(ride);
    renderRideMap(ride);
  } catch (err) {
    console.error('[RideDetail]', err);
    showToast('Gagal buka ride', 'alert');
  }
}

function renderSpeedChart(ride: Ride): void {
  const svg = $opt<SVGSVGElement>('rd-chart');
  if (!svg || ride.points.length < 2) return;
  const W = 340;
  const H = 80;
  const maxSpd = Math.max(10, ...ride.points.map(p => p.spd));
  const t0 = ride.points[0].t;
  const t1 = ride.points[ride.points.length - 1].t;
  const xy = (p: { t: number; spd: number }) => `${(((p.t - t0) / Math.max(1, t1 - t0)) * W).toFixed(1)},${(H - (p.spd / maxSpd) * (H - 6)).toFixed(1)}`;
  const poly = ride.points.map(xy).join(' ');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="var(--border)" stroke-width="1"/>
    <polygon points="0,${H} ${poly} ${W},${H}" fill="rgba(212,160,23,.12)"/>
    <polyline points="${poly}" fill="none" stroke="var(--gold)" stroke-width="1.6" stroke-linejoin="round"/>
    <text x="${W - 2}" y="10" text-anchor="end" font-family="Share Tech Mono" font-size="9" fill="var(--muted2)">${Math.round(maxSpd)} km/h</text>`;
}

function renderSplits(ride: Ride): void {
  const el = $opt('rd-splits');
  if (!el) return;
  const splits = splitsPerKm(ride.points);
  if (!splits.length) {
    el.innerHTML = `<p class="f-rajd text-xs text-center py-3" style="color:var(--muted)">Ride terlalu pendek untuk split per km</p>`;
    return;
  }
  const avgSec = splits.reduce((s, x) => s + x.sec, 0) / splits.length;
  el.innerHTML = splits
    .map(s => {
      const cls = s.sec < avgSec * 0.92 ? 'split-fast' : s.sec > avgSec * 1.08 ? 'split-slow' : '';
      return `<div class="split-row ${cls}">
        <span class="f-exo font-bold text-[10px] tracking-widest" style="color:var(--muted2)">KM ${s.km}</span>
        <span class="f-mono text-sm" style="color:var(--gold)">${formatDuration(s.sec)}</span>
        <span class="f-mono text-xs" style="color:var(--muted2)">${s.spdKmh.toFixed(0)} km/h</span>
      </div>`;
    })
    .join('');
}

function renderRideMap(ride: Ride): void {
  const el = $id('rd-map');
  if (!el || ride.points.length < 2) return;
  destroyRideMap();
  const lats = ride.points.map(p => p.lat);
  const lngs = ride.points.map(p => p.lng);
  const bounds = leaflet.latLngBounds(
    leaflet.latLng(Math.min(...lats), Math.min(...lngs)),
    leaflet.latLng(Math.max(...lats), Math.max(...lngs)),
  );
  rideMap = leaflet.map(el, { zoomControl: false, attributionControl: true });
  leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(rideMap);
  leaflet.polyline(
    ride.points.map(p => [p.lat, p.lng] as [number, number]),
    { color: '#d4a017', weight: 4, opacity: 0.9 },
  ).addTo(rideMap);
  rideMap.fitBounds(bounds, { padding: [24, 24] });
  setTimeout(() => rideMap?.invalidateSize(), 250);
}

export function destroyRideMap(): void {
  if (rideMap) {
    rideMap.remove();
    rideMap = null;
  }
}

export async function deleteRide(id: number): Promise<void> {
  showConfirm('Hapus Ride?', 'Ride ini akan dihapus permanen.', 'HAPUS', async () => {
    await dbAction('rides', 'delete', id);
    showToast('Ride dihapus', 'muted');
    switchView('touring');
    void loadRides();
  });
}

export function shareCurrentRide(): void {
  if (currentRideId === null) return;
  void dbAction<Ride>('rides', 'get', currentRideId).then(r => {
    if (r) shareGPX(r);
  });
}

export function deleteCurrentRide(): void {
  if (currentRideId !== null) void deleteRide(currentRideId);
}

export function onRecBtnTap(): void {
  if (isRecording()) stopRecording();
  else void startRecording();
}

export function initRecBtn(): void {
  updateRecBtn();
}
