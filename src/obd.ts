import { showToast } from './toast';
import { $id } from './util';

export async function connectOBD2(): Promise<void> {
  const bluetooth = (navigator as any).bluetooth;
  if (!bluetooth) {
    showToast('Browser tidak support Web Bluetooth!', 'alert');
    return;
  }
  try {
    showToast('Mencari ELM327…', 'gold');
    const dev = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['generic_access'],
    });
    showToast(`Konek ke ${dev.name}`, 'gold');
    const out = $id('obd-data');
    out.classList.remove('hidden');
    out.textContent = `> CONNECTED: ${dev.name}\n> RPM: --\n> COOLANT: --\n> DTC: READING...`;
  } catch (_) {
    showToast('Batal. Mode simulator aktif.', 'muted');
    const out = $id('obd-data');
    out.classList.remove('hidden');
    out.textContent =
      '> SIMULATOR MODE\n> CONNECTED: ELM327-BCR\n> RPM: 1850\n> COOLANT: 90°C\n> DTC: NONE';
  }
}
