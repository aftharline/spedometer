/* ── RIDE SUMMARY CARD — kartu 4:5 ala Strava setelah END RIDE ──
   Canvas 1000×1200 pakai identitas livery aktif (aksen/tagline/logo),
   dibagikan sebagai PNG via Web Share / fallback unduh. */

import { openModal } from './modals';
import { THEMES, themeLogo } from './themes';
import { showToast } from './toast';
import type { Ride } from './types';

const W = 1000;
const H = 1200;

function paintStats(ride: Ride): [string, string][] {
  return [
    ['WAKTU', fmtDur(ride.movingSec)],
    ['AVG', ride.avgKmh.toFixed(1)],
    ['MAX', String(Math.round(ride.maxKmh))],
    ['ELEV+', ride.gainM != null ? `${Math.round(ride.gainM)} M` : '—'],
    ['CORNERS', String(ride.corners ?? 0)],
    ['BANK MAX', ride.bankMax != null ? `${ride.bankMax}°` : '—'],
    ['VIB MAX', ride.vibMax != null ? String(ride.vibMax) : '—'],
    ['TITIK GPS', String(Math.min(ride.points?.length ?? 0, 5000))],
  ];
}

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} J ${m} M` : `${m} M`;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

export async function openRideCard(ride: Ride): Promise<void> {
  const canvas = document.getElementById('rc-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  await document.fonts.ready;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const id = document.documentElement.getAttribute('data-theme') ?? 'bcr';
  const def = (THEMES.find(x => x.id === id) ?? THEMES[0]);
  const cs = getComputedStyle(document.documentElement);
  const acc = cs.getPropertyValue('--acc-rgb').trim() || '212,160,23';
  const acc2 = cs.getPropertyValue('--acc2-rgb').trim() || '245,200,66';
  const disp = cs.getPropertyValue('--f-display').replace(/['"]/g, '').trim() || 'Bebas Neue';

  /* Latar */
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = `rgba(${acc},.12)`;
  ctx.lineWidth = 1;
  for (let y = 0; y < H; y += 26) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  /* Top bar livery */
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, `rgb(${acc})`);
  grad.addColorStop(1, `rgb(${acc2})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 26);

  /* Brand row */
  const logo = await loadImg(themeLogo(id));
  if (logo && logo.width) {
    const s = Math.min(160 / logo.width, 60 / logo.height);
    ctx.drawImage(logo, 52, 56, logo.width * s, logo.height * s);
  }
  const bx = logo && logo.width ? 52 + Math.min(160, logo.width * Math.min(160 / logo.width, 60 / logo.height)) + 16 : 52;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f0f0f0';
  ctx.font = '900 34px "Exo 2"';
  ctx.fillText('BLACK CROWN RIDERS', bx, 88);
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.font = '600 20px "Rajdhani"';
  ctx.fillText('SURABAYA · BCR TOURING', bx, 116);

  /* Judul */
  ctx.fillStyle = `rgba(${acc},.9)`;
  ctx.font = '700 44px "Exo 2"';
  ctx.fillText('RIDE SUMMARY', 52, 208);

  /* Jarak besar */
  const dist = ctx.createLinearGradient(0, 260, 0, 480);
  dist.addColorStop(0, `rgb(${acc2})`);
  dist.addColorStop(1, `rgb(${acc})`);
  ctx.fillStyle = dist;
  ctx.font = `400 210px "${disp}"`;
  ctx.fillText(ride.distKm.toFixed(1), 48, 470);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = '700 34px "Exo 2"';
  ctx.fillText('KM', 52, 528);

  /* Tanggal — manual: locale id-ID melempar ":00,00" di beberapa engine */
  const d0 = new Date(ride.start);
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = '600 26px "Rajdhani"';
  ctx.fillText(
    `${d0.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }).replace('.', '')} · ` +
    `${String(d0.getHours()).padStart(2, '0')}:${String(d0.getMinutes()).padStart(2, '0')}`,
    52, 588,
  );

  /* Grid statistik 3×2 */
  const stats = paintStats(ride);
  ctx.fillStyle = '#131313';
  ctx.fillRect(52, 640, W - 104, 420);
  ctx.strokeStyle = `rgba(${acc},.4)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 640, W - 104, 420);
  stats.forEach((s, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 72 + col * 222;
    const y = 710 + row * 210;
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    if (col > 0) {
      ctx.beginPath();
      ctx.moveTo(x - 20, y - 24);
      ctx.lineTo(x - 20, y + 120);
      ctx.stroke();
    }
    ctx.fillStyle = i === 2 ? '#ff2244' : `rgb(${acc2})`;
    ctx.font = `600 ${s[1].length > 6 ? 56 : 76}px "${disp}"`;
    ctx.fillText(s[1], x, y + 56);
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.font = '800 20px "Exo 2"';
    ctx.fillText(s[0], x, y + 120);
  });

  /* Garis pemisah */
  ctx.fillStyle = `rgb(${acc})`;
  ctx.fillRect(52, 1096, W - 104, 3);

  /* Footer */
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.font = '800 26px "Rajdhani"';
  ctx.fillText(def.tagline, 52, 1146);

  openModal('modal-ridecard');
}

export async function shareRideCard(): Promise<void> {
  const canvas = document.getElementById('rc-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
  if (!blob) {
    showToast('Gagal membuat kartu', 'warn');
    return;
  }
  const file = new File([blob], 'bcr-ride-card.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'BCR Ride Summary' });
      return;
    }
  } catch { /* dibatalkan → lanjut unduh */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bcr-ride-card.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
