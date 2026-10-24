import { headingToCompass } from './geo';
import { showToast } from './toast';
import { $opt, escapeHTML } from './util';

let storedTrip = parseFloat(localStorage.getItem('bcr_trip') || '0');
let tripDistanceKm = Number.isFinite(storedTrip) ? storedTrip : 0;

export function updateTripDisplays(): void {
  const v = tripDistanceKm.toFixed(1);
  const mini = $opt('mini-trip');
  if (mini) mini.textContent = v;
  const ls = $opt('ls-trip');
  if (ls) ls.textContent = v;
  const labs = $opt('labs-trip');
  if (labs) labs.textContent = v;
}

export function addTripDistance(meters: number): void {
  tripDistanceKm += meters / 1000;
  localStorage.setItem('bcr_trip', tripDistanceKm.toFixed(3));
  updateTripDisplays();
}

export function resetTrip(): void {
  tripDistanceKm = 0;
  localStorage.setItem('bcr_trip', '0');
  updateTripDisplays();
  showToast('Trip counter direset', 'muted');
}

export function updateAltitudeDisplays(alt: number | null): void {
  const v = Number.isFinite(alt) ? Math.round(alt as number) + 'm' : '—';
  const mini = $opt('mini-altitude');
  if (mini) mini.textContent = v;
  const ls = $opt('ls-altitude');
  if (ls) ls.textContent = v;
  const labs = $opt('labs-altitude');
  if (labs) labs.textContent = Number.isFinite(alt) ? String(Math.round(alt as number)) : '—';
}

export function updateClock(): void {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const hm = h + ':' + m;
  const mini = $opt('mini-clock');
  if (mini) mini.textContent = hm;
  const ls = $opt('ls-clock');
  if (ls) ls.textContent = hm;
}

export function updateCompassDisplays(heading: number | null): void {
  const cmp = headingToCompass(heading);
  const hdgText = heading !== null && Number.isFinite(heading) ? Math.round(heading) + '°' : '—';
  const mini = $opt('mini-bearing');
  if (mini) mini.textContent = cmp;
  const ls = $opt('ls-compass');
  if (ls) ls.textContent = cmp;
  const labs = $opt('labs-compass');
  if (labs) labs.textContent = cmp + (heading !== null && Number.isFinite(heading) ? ' ' + hdgText : '');
  const val = $opt('val-heading');
  if (val) val.textContent = hdgText;

  const deg = heading !== null && Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : null;
  document.querySelectorAll<SVGGElement>('.compass-rose').forEach(r => {
    r.setAttribute('transform', deg !== null ? `rotate(${-deg} 60 60)` : '');
  });
  document.querySelectorAll('.compass-hdg').forEach(el => {
    el.textContent = deg !== null ? String(Math.round(deg)) + '°' : '—';
  });
}

export function setGpsDots(cls: string): void {
  ['gps-dot', 'gps-dot-2', 'gps-dot-3'].forEach(id => {
    const el = $opt(id);
    if (el) el.className = 'dot ' + cls;
  });
}

export function updateSensorChip(label: string, type = 'idle'): void {
  const chip = $opt('sensor-chip');
  if (!chip) return;
  const colors: Record<string, string> = {
    idle: 'background:rgba(var(--acc-rgb),.06);border:1px solid rgba(var(--acc-rgb),.22);color:var(--gold);',
    good: 'background:rgba(var(--acc-rgb),.12);border:1px solid rgba(var(--acc-rgb),.4);color:var(--gold2);',
    warn: 'background:rgba(255,102,0,.1);border:1px solid rgba(255,102,0,.32);color:var(--warn);',
    alert: 'background:rgba(var(--alr-rgb),.1);border:1px solid rgba(var(--alr-rgb),.34);color:var(--red2);',
  };
  chip.setAttribute('style', colors[type] || colors.idle);
  chip.innerHTML = `<i class="fa-solid fa-satellite-dish text-[8px]"></i>${escapeHTML(label)}`;
}

setInterval(updateClock, 1000);
updateClock();
updateTripDisplays();
