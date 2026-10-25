import { dbAction } from './db';
import { closeModal, openModal } from './modals';
import { appState, rideState } from './state';
import { showToast } from './toast';
import { $id, $opt } from './util';

export interface RidePhoto {
  id?: number;
  rideKey: number;
  at: number;
  dataUrl: string;
  lat: number | null;
  lng: number | null;
  spd: number;
}

let recKey: number | null = null;
let stripKey: number | null = null;
let viewer: RidePhoto[] = [];
let viewerIdx = 0;

export function setPhotoRideKey(startTs: number | null): void {
  recKey = startTs;
}

export const currentRecKey = (): number | null => recKey;

function loadPhotos(rideKey: number): Promise<RidePhoto[]> {
  return dbAction<RidePhoto[]>('photos', 'getIndex', null, 'rideKey', rideKey).catch(() => []);
}

async function savePhoto(file: File): Promise<boolean> {
  const dataUrl = await downscale(file);
  if (!dataUrl) return false;
  return storeDataUrl(dataUrl);
}

export async function storeDataUrl(dataUrl: string | null): Promise<boolean> {
  if (!dataUrl) return false;
  const photo: RidePhoto = {
    rideKey: recKey as number,
    at: Date.now(),
    dataUrl,
    lat: appState.currentLat,
    lng: appState.currentLng,
    spd: Math.round(rideState.speed),
  };
  try {
    await dbAction('photos', 'add', photo);
    return true;
  } catch {
    showToast('Gagal simpan foto', 'alert');
    return false;
  }
}

function fitCanvas(w: number, h: number): { c: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, 1280 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  return { c, scale };
}

function downscale(file: File): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const { c } = fitCanvas(img.width, img.height);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      showToast('File bukan gambar', 'warn');
      resolve(null);
    };
    img.src = URL.createObjectURL(file);
  });
}

/* capture=true: kamera langsung. rideStart: pasang ke ride tertentu (detail). */
export function pickPhotos(capture: boolean, rideStart?: number): void {
  const isRideCtx = rideStart !== undefined || recKey !== null;
  if (capture && !isRideCtx) {
    showToast('Mulai rekam dulu', 'warn');
    return;
  }
  if (rideStart !== undefined) setPhotoRideKey(rideStart);
  const inp = $id<HTMLInputElement>('photo-input');
  if (!inp) return;
  if (capture) inp.setAttribute('capture', 'environment');
  else inp.removeAttribute('capture');
  inp.onchange = async () => {
    const files = Array.from(inp.files ?? []);
    inp.value = '';
    let n = 0;
    for (const f of files) if (await savePhoto(f)) n++;
    if (n) {
      showToast(`${n} foto tersimpan`, 'gold2');
      if (stripKey !== null) await renderStrip(stripKey);
      else if (recKey !== null) await openPhotoModal(recKey, 9999); // langsung terlihat walau di halaman speedo
    }
    if (rideStart !== undefined) setPhotoRideKey(null);
  };
  inp.click();
}

export async function renderStrip(rideKey: number): Promise<void> {
  stripKey = rideKey;
  const strip = $id('rd-photos-strip');
  if (!strip) return;
  const photos = await loadPhotos(rideKey);
  strip.innerHTML = photos.map((p, i) =>
    `<img src="${p.dataUrl}" class="rd-photo-thumb clip-sm" alt="foto ride" onclick="openPhotoModal(${rideKey},${i})">`).join('');
}

/* Setelah detail ditutup, onchange tidak perlu render ulang. */
export function clearStripKey(): void {
  stripKey = null;
}

export async function openPhotoModal(rideKey: number, idx: number): Promise<void> {
  viewer = await loadPhotos(rideKey);
  if (!viewer.length) return;
  viewerIdx = Math.max(0, Math.min(idx, viewer.length - 1));
  paintViewer();
  openModal('modal-photo');
}

function paintViewer(): void {
  const p = viewer[viewerIdx];
  if (!p) return;
  const img = $opt<HTMLImageElement>('pv-img');
  if (img) img.src = p.dataUrl;
  const thumbs = $id('pv-thumbs');
  if (thumbs) {
    thumbs.innerHTML = viewer.map((_, i) =>
      `<img src="${viewer[i].dataUrl}" class="pv-thumb ${i === viewerIdx ? 'pv-active' : ''}" alt="thumb" onclick="openPhotoModal(${p.rideKey},${i})">`).join('');
  }
  const t = new Date(p.at);
  const stats = $opt('pv-stats');
  if (stats) {
    stats.textContent = `${p.spd} KM/H  ·  ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}  ·  BCR`;
  }
  const single = viewer.length < 2;
  $id('pv-prev').classList.toggle('hidden', single);
  $id('pv-next').classList.toggle('hidden', single);
}

export function photoNext(dir: number): void {
  if (!viewer.length) return;
  viewerIdx = (viewerIdx + dir + viewer.length) % viewer.length;
  paintViewer();
}

export function closePhotoModal(): void {
  closeModal('modal-photo');
}

/* Bakar strip telemetri ke salinan foto lalu share/download. */
export async function sharePhoto(): Promise<void> {
  const p = viewer[viewerIdx];
  if (!p) return;
  const img = await new Promise<HTMLImageElement>(res => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(im);
    im.src = p.dataUrl;
  });
  if (!img.width) return;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height + H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = '#e8c11c';
  ctx.font = `bold 27px monospace`;
  ctx.fillText(`${p.spd} KM/H`, 14, 40);
  ctx.fillStyle = '#999';
  ctx.font = `22px sans-serif`;
  const t = new Date(p.at);
  const line = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} · BCR SURABAYA`;
  ctx.fillText(line, c.width - 14 - ctx.measureText(line).width, 40);
  const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) return;
  try {
    const file = new File([blob], 'bcr-ride.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch { /* user membatalkan share */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bcr-ride.jpg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function deletePhotosByRide(rideKey: number): Promise<void> {
  const photos = await loadPhotos(rideKey);
  for (const p of photos) {
    if (p.id !== undefined) await dbAction('photos', 'delete', p.id).catch(() => {});
  }
}
