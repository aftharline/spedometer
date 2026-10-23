import { $id } from './util';

export type ToastType = 'gold' | 'gold2' | 'alert' | 'warn' | 'muted' | 'cyber' | 'neon';

const TOAST_STYLES: Record<string, string> = {
  gold: 'background:var(--gold);color:#0a0a0a;',
  gold2: 'background:var(--gold2);color:#0a0a0a;',
  alert: 'background:var(--red);color:#fff;',
  warn: 'background:var(--warn);color:#0a0a0a;',
  muted: 'background:var(--s2);color:var(--text);border:1px solid var(--border2);',
  cyber: 'background:var(--gold2);color:#0a0a0a;',
  neon: 'background:var(--gold);color:#0a0a0a;',
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string, type: ToastType = 'gold'): void {
  const el = $id('toast');
  el.setAttribute(
    'style',
    (TOAST_STYLES[type] || TOAST_STYLES.gold) +
      'position:absolute;top:76px;left:50%;transform:translateX(-50%) translateY(0);opacity:1;' +
      'transition:transform .3s,opacity .3s;z-index:80;pointer-events:none;white-space:nowrap;' +
      'font-family:"Exo 2",sans-serif;font-weight:700;font-size:11px;letter-spacing:2px;' +
      'text-transform:uppercase;padding:9px 16px;' +
      'clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));',
  );
  el.textContent = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.transform = 'translateX(-50%) translateY(-60px)';
    el.style.opacity = '0';
  }, 2800);
}
