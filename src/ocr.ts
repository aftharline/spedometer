import { openModal } from './modals';
import { showToast } from './toast';
import { $id } from './util';

export function triggerAiScanner(): void {
  ($id('ai-cam-input') as HTMLInputElement).click();
}

export async function processAIOdometer(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  $id('loading-overlay').classList.remove('hidden');
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const result = await worker.recognize(file);
    await worker.terminate();
    const nums = result.data.text.match(/\d+/g);
    if (nums) {
      const best = nums.reduce((a, b) => (a.length >= b.length ? a : b));
      ($id('f_odo') as HTMLInputElement).value = best;
      showToast(`AI: ${best} KM terdeteksi`, 'gold2');
      openModal('modal-add-fuel');
    } else {
      showToast('AI gagal baca angka. Input manual.', 'warn');
      openModal('modal-add-fuel');
    }
  } catch (err) {
    console.error('[OCR]', err);
    showToast('AI Error — coba lagi', 'alert');
  } finally {
    $id('loading-overlay').classList.add('hidden');
    input.value = '';
  }
}
