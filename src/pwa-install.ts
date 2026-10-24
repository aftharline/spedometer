import { showToast } from './toast';

const BTN = 'nav-install';
let deferred: any = null;
let used = false;

function hide(): void {
  document.getElementById(BTN)?.classList.add('is-hidden');
}

export function initInstallPrompt(): void {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    hide();
    return;
  }
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferred = e;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    hide();
    showToast('BCRide terinstall di perangkat ini', 'gold2');
  });
}

export async function installApp(): Promise<void> {
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  if (standalone) {
    showToast('App sudah terinstall', 'muted');
    return;
  }
  if (deferred) {
    try {
      deferred.prompt();
      const res = await deferred.userChoice;
      if (res?.outcome === 'accepted') {
        used = true;
        hide();
      }
      deferred = null;
      return;
    } catch {
      deferred = null;
    }
  }
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (used && !isIOS) {
    showToast('Buka menu Chrome ⋮ untuk menginstall', 'muted');
    return;
  }
  if (isIOS) {
    showToast('iOS: Share ⬆️ → Tambah ke Layar Utama', 'gold2');
  } else {
    showToast('Menu Chrome ⋮ → Install app / Tambahkan ke layar utama', 'gold2');
  }
}
