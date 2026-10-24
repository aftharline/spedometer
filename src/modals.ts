import { $id } from './util';

let confirmCb: (() => void) | null = null;

export function openModal(id: string): void {
  $id('modal-overlay').classList.remove('hidden');
  $id(id).classList.remove('hidden');
}

export function closeModal(id: string): void {
  $id('modal-overlay').classList.add('hidden');
  $id(id).classList.add('hidden');
}

export function closeAllModals(): void {
  document.querySelectorAll('[id^="modal-"]').forEach(el => el.classList.add('hidden'));
  $id('custom-confirm').classList.add('hidden');
  $id('modal-overlay').classList.add('hidden');
}

export function overlayTap(e: MouseEvent): void {
  if ((e.target as HTMLElement).id === 'modal-overlay') closeAllModals();
}

export function showConfirm(title: string, msg: string, yesLbl: string, cb: () => void): void {
  $id('cc-title').textContent = title;
  $id('cc-msg').textContent = msg;
  $id('cc-yes').textContent = yesLbl;
  $id('modal-overlay').classList.remove('hidden');
  $id('custom-confirm').classList.remove('hidden');
  confirmCb = cb;
}

$id('cc-no').onclick = () => closeAllModals();
$id('cc-yes').onclick = () => {
  closeAllModals();
  if (confirmCb) confirmCb();
};
