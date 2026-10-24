import { openModal } from './modals';

export interface ThemeDef {
  id: string;
  name: string;
  sub: string;
  acc: string;
  acc2: string;
  bg: string;
  logo: string;
  tagline: string;
}

const LOGO = (f: string) => `assets/logos/logo-${f}`;

export const THEMES: ThemeDef[] = [
  { id: 'bcr',       name: 'Crown Gold',      sub: 'Black Crown Riders · bawaan', acc: '#d4a017', acc2: '#cc1122', bg: '#080808', logo: LOGO('bcr.svg'),      tagline: 'ENJOY YOUR RIDE — WEAR THE CROWN' },
  { id: 'panigale',  name: 'Panigale Red',    sub: 'Ducati 848 · rosso corsa',    acc: '#e63626', acc2: '#ff7050', bg: '#080808', logo: LOGO('panigale.svg'), tagline: 'FEEL THE FURY, RIDE THE ROSSO' },
  { id: 'ninja',     name: 'Ninja Lime',      sub: 'Kawasaki · lime green',       acc: '#5ec232', acc2: '#96f064', bg: '#080808', logo: LOGO('ninja.svg'),    tagline: 'FUEL THE PRIMAL THRILL' },
  { id: 'r1m',       name: 'R1M Raven',       sub: 'Yamaha · icon blue',          acc: '#3776ff', acc2: '#8cbaff', bg: '#080808', logo: LOGO('r1m.svg'),      tagline: 'SILENT, SHARP, SINISTER' },
  { id: 'repsol',    name: 'Repsol CBR',      sub: 'Honda · jingga Repsol',       acc: '#ff7a00', acc2: '#ffc72c', bg: '#080808', logo: LOGO('repsol.svg'),   tagline: 'PILOT OF THE DREAM TEAM' },
  { id: 'ecstar',    name: 'Ecstar GSX',      sub: 'Suzuki · GP blue',            acc: '#004dbb', acc2: '#cdd6e0', bg: '#080808', logo: LOGO('ecstar.svg'),   tagline: 'OWN EVERY APEX' },
  { id: 'apex',      name: 'Apex F1',         sub: 'Formula 1 · grid red',        acc: '#e10600', acc2: '#ebebee', bg: '#080808', logo: LOGO('apex.svg'),     tagline: 'PRECISION IS EVERYTHING' },
  { id: 'motogp',    name: 'MotoGP Podium',   sub: 'MotoGP · podium champagne',   acc: '#e10a3c', acc2: '#f5c842', bg: '#080808', logo: LOGO('motogp.svg'),   tagline: 'RIDE LIKE YOU QUALIFIED POLE' },
  { id: 'roadrace',  name: 'Road Race Legend',sub: 'Sirkuit lokal · sirkuit sky', acc: '#ff3d6e', acc2: '#38bdf8', bg: '#080808', logo: LOGO('roadrace.svg'), tagline: 'EVERY ROAD IS A STORY' },
  { id: 'fast',      name: "Dom's Chrome",    sub: 'Fast & Furious · nitro',      acc: '#c8ced6', acc2: '#00e5ff', bg: '#080808', logo: LOGO('fast.png'),     tagline: 'HOLD ONTO YOUR FILET' },
  { id: 'bcr-light', name: 'Circuit Day',     sub: 'Mode terang minimal',         acc: '#8a6000', acc2: '#b08000', bg: '#f0ece4', logo: LOGO('bcr.svg'),      tagline: 'GOLDEN HOURS, CLEAN THROTTLE' },
];

const legacy = (t: string): string =>
  t === 'dark' ? 'bcr' : t === 'light' ? 'bcr-light' : t;

export const currentTheme = (): string =>
  document.documentElement.getAttribute('data-theme') ?? 'bcr';

export const themeLogo = (t: string): string =>
  (THEMES.find(x => x.id === legacy(t)) ?? THEMES[0]).logo;

/* Arms header + dial brand marks. Missing file (e.g. club logo not
   dropped in yet) falls back silently to the incumbent text marks. */
function paintBrandMarks(def: ThemeDef): void {
  const brand = document.getElementById('brand-logo') as HTMLImageElement | null;
  const dial = document.getElementById('dial-logo') as HTMLImageElement | null;
  const watermark = document.getElementById('sg-watermark');

  const arm = (img: HTMLImageElement | null, ok: () => void, fail: () => void): void => {
    if (!img) { fail(); return; }
    img.onload = () => { img.classList.add('is-shown'); ok(); };
    img.onerror = () => {
      img.classList.remove('is-shown');
      img.src = '';
      fail();
    };
    img.src = def.logo;
  };

  arm(brand, () => {}, () => {});
  arm(dial, () => { if (watermark) watermark.style.opacity = '0'; },
             () => { if (watermark) watermark.style.opacity = '1'; });
  // Splash: logo menampilkan gambar tema; gagal → wordmark teks besar.
  const splashLogo = document.getElementById('splash-logo') as HTMLImageElement | null;
  const splashWord = document.getElementById('splash-word');
  arm(splashLogo,
    () => { if (splashLogo) splashLogo.style.removeProperty('display'); if (splashWord) splashWord.style.display = 'none'; },
    () => { if (splashWord) splashWord.style.removeProperty('display'); });
  const tag = document.getElementById('splash-tag');
  if (tag) tag.textContent = def.tagline;
  const themeLbl = document.getElementById('splash-theme');
  if (themeLbl) themeLbl.textContent = `LIVERY — ${def.name}`;
}

export function applyTheme(t: string): void {
  const def = THEMES.find(x => x.id === legacy(t)) ?? THEMES[0];
  document.documentElement.setAttribute('data-theme', def.id);
  localStorage.setItem('theme', def.id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', def.bg);
  paintBrandMarks(def);
  syncThemePicker();
  window.dispatchEvent(new Event('themechange'));
}

function themeCard(t: ThemeDef, active: boolean): string {
  return `<button onclick="pickTheme('${t.id}')" class="theme-card ${active ? 'is-on' : ''}" data-id="${t.id}" style="padding-left:12px">
    ${t.logo ? `<img class="theme-logo" src="${t.logo}" alt="" loading="lazy"
        onerror="this.style.display='none';this.nextElementSibling.style.display='';"
        onload="this.style.display='';this.nextElementSibling.style.display='none'">` : ''}
    <span class="theme-sw" style="${t.logo ? 'display:none;' : ''}background:linear-gradient(135deg,${t.acc},${t.acc2})"></span>
    <span class="flex flex-col items-start gap-0.5 min-w-0">
      <span class="f-exo font-bold text-[11px] tracking-widest uppercase truncate">${t.name}</span>
      <span class="f-rajd text-[9px] uppercase truncate" style="color:var(--muted2)">${t.sub}</span>
    </span>
  </button>`;
}

export function renderThemePicker(): void {
  const grid = document.getElementById('theme-grid');
  if (!grid) return;
  const cur = currentTheme();
  grid.innerHTML = THEMES.map(t => themeCard(t, t.id === cur)).join('');
}

function syncThemePicker(): void {
  const cur = currentTheme();
  document.querySelectorAll('#theme-grid .theme-card').forEach(c =>
    c.classList.toggle('is-on', (c as HTMLElement).dataset.id === cur),
  );
}

export function openThemePicker(): void {
  renderThemePicker();
  openModal('modal-theme');
}

export function pickTheme(t: string): void {
  applyTheme(t);
}
