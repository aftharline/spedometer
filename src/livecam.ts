import { currentRecKey, openPhotoModal, storeDataUrl } from './ride-photos';
import { showToast } from './toast';
import { $id, $opt } from './util';

let stream: MediaStream | null = null;

export async function toggleLiveCam(): Promise<void> {
  if (stream) {
    stopLiveCam();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Browser tidak mendukung kamera', 'warn');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    $id('livecam-box').classList.remove('hidden');
    $id('btn-livecam')?.classList.add('lc-on');
    const v = $id<HTMLVideoElement>('livecam-video');
    v.srcObject = stream;
    await v.play().catch(() => {});
  } catch {
    showToast('Kamera tidak tersedia / izin ditolak', 'warn');
    stopLiveCam();
  }
}

export function stopLiveCam(): void {
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  const box = $id('livecam-box');
  box.classList.add('hidden');
  $id('btn-livecam')?.classList.remove('lc-on');
  const v = $opt<HTMLVideoElement>('livecam-video');
  if (v) v.srcObject = null;
}

export const isLiveCamOn = (): boolean => stream !== null;
export const getLiveCamStream = (): MediaStream | null => stream;

/* Jepret frame → foto ride (butuh REC aktif agar punya rideKey). */
export async function snapLivePhoto(): Promise<void> {
  const v = $opt<HTMLVideoElement>('livecam-video');
  if (!stream || !v?.videoWidth) {
    showToast('Kamera belum aktif', 'warn');
    return;
  }
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  const snap = c.toDataURL('image/jpeg', 0.72);
  if (currentRecKey() === null) {
    showToast('Nyalakan REC dulu agar foto tersimpan', 'warn');
    return;
  }
  const ok = await storeDataUrl(snap);
  if (ok) {
    showToast('Foto tersimpan', 'gold2');
    await openPhotoModal(currentRecKey() as number, 9999); // tampilkan langsung
  }
}
