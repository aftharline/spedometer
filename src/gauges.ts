import { arcPath, polarXY } from './geo';
import { speedAlerts } from './speed-alerts';
import { updateRideState } from './state';
import { showToast } from './toast';
import { $opt } from './util';

const svgNS = 'http://www.w3.org/2000/svg';

const svgE = (tag: string, attrs: Record<string, string | number> = {}, txt?: string): SVGElement => {
  const el = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  if (txt !== undefined) el.textContent = txt;
  return el as SVGElement;
};

const SG = { CX: 134, CY: 134, R: 108, START: 135, SWEEP: 270, MAX: 240 };
let maxSpeed = 0;
let currentDisplaySpeed = 0;
let targetDisplaySpeed = 0;
let speedAnimReq: number | null = null;
const SPEEDO_ANIM_ALPHA = 0.62;

export function buildSpeedoSVG(): void {
  const track = $opt<SVGPathElement>('sg-track');
  const ticks = $opt<SVGGElement>('sg-ticks');
  if (!track || !ticks) return;
  track.setAttribute('d', arcPath(SG.CX, SG.CY, SG.R, SG.START, SG.START + SG.SWEEP));

  const DIV = 24;
  for (let i = 0; i <= DIV; i++) {
    const ang = SG.START + (SG.SWEEP / DIV) * i;
    const major = i % 4 === 0;
    const rIn = SG.R + 8;
    const rOut = SG.R + (major ? 22 : 13);
    const p1 = polarXY(SG.CX, SG.CY, rIn, ang);
    const p2 = polarXY(SG.CX, SG.CY, rOut, ang);
    const ln = document.createElementNS(svgNS, 'line');
    ln.setAttribute('x1', String(p1.x));
    ln.setAttribute('y1', String(p1.y));
    ln.setAttribute('x2', String(p2.x));
    ln.setAttribute('y2', String(p2.y));
    const isRed = i > 18;
    ln.setAttribute('stroke', major ? (isRed ? 'rgba(var(--alr-rgb),.8)' : 'rgba(var(--acc-rgb),.6)') : 'var(--border2)');
    ln.setAttribute('stroke-width', major ? '2' : '0.8');
    ticks.appendChild(ln);
    if (major) {
      const spd = Math.round((SG.MAX / DIV) * i);
      const tp = polarXY(SG.CX, SG.CY, rOut + 10, ang);
      const tx = document.createElementNS(svgNS, 'text');
      tx.setAttribute('x', String(tp.x));
      tx.setAttribute('y', String(tp.y));
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('dominant-baseline', 'middle');
      tx.setAttribute('font-family', 'Share Tech Mono');
      tx.setAttribute('font-size', '11.5');
      tx.setAttribute('fill', isRed ? 'rgba(var(--alr-rgb),.7)' : 'var(--muted)');
      tx.textContent = String(spd);
      ticks.appendChild(tx);
    }
  }
  setSpeedoArc(0);
}

function animateSpeedo(): void {
  const diff = targetDisplaySpeed - currentDisplaySpeed;
  if (Math.abs(diff) < 0.4) {
    currentDisplaySpeed = targetDisplaySpeed;
  } else {
    const factor = Math.abs(diff) > 15 ? 0.72 : Math.abs(diff) > 5 ? SPEEDO_ANIM_ALPHA : 0.45;
    currentDisplaySpeed += diff * factor;
  }

  const c = Math.min(Math.max(currentDisplaySpeed, 0), SG.MAX);
  const sw = SG.SWEEP * (c / SG.MAX);
  const fill = $opt<SVGPathElement>('sg-fill');
  const needle = $opt<SVGCircleElement>('sg-needle');

  if (fill) {
    if (sw > 0.5) {
      fill.setAttribute('d', arcPath(SG.CX, SG.CY, SG.R, SG.START, SG.START + sw));
      fill.style.opacity = '1';
      if (needle) {
        const p = polarXY(SG.CX, SG.CY, SG.R, SG.START + sw);
        needle.setAttribute('cx', String(p.x));
        needle.setAttribute('cy', String(p.y));
        needle.style.opacity = '1';
        if (c > SG.MAX * 0.75) needle.setAttribute('fill', 'var(--red)');
        else if (c > SG.MAX * 0.5) needle.setAttribute('fill', '#ffffff');
        else needle.setAttribute('fill', 'var(--gold)');
      }
    } else {
      fill.style.opacity = '0';
      if (needle) needle.style.opacity = '0';
    }
  }

  const valEl = $opt('sg-value');
  if (valEl) {
    valEl.textContent = String(Math.round(c));
    valEl.classList.toggle('is-hot', c >= 80); // blink + breath at highway pace
  }
  if (!sweeping) speedAlerts(c); // bunyi 80/90 + getar staircase

  if (c > maxSpeed) {
    maxSpeed = c;
    const maxEl = $opt('sg-max');
    if (maxEl) maxEl.textContent = `MAX ${Math.round(maxSpeed)}`;
    const valMax = $opt('val-maxspd');
    if (valMax) valMax.textContent = String(Math.round(maxSpeed));
  }
  updateRideState({ speed: c, maxSpeed });

  if (Math.abs(diff) >= 0.4) {
    speedAnimReq = requestAnimationFrame(animateSpeedo);
  } else {
    speedAnimReq = null;
  }
}

export function setSpeedoArc(kmh: number): void {
  targetDisplaySpeed = Math.max(0, kmh);
  maybeSpeedingMode(targetDisplaySpeed);
  if (!speedAnimReq) animateSpeedo();
}

/* ── SPEEDING MODE ≥90 km/h — pop-up 3.5s, re-arm di bawah 85 ── */
let speedingShown = false;
let speedingTimer: ReturnType<typeof setTimeout> | null = null;
let sweeping = false;

function maybeSpeedingMode(c: number): void {
  if (sweeping) return;
  if (c < 85) { speedingShown = false; return; }
  if (speedingShown || c < 90) return;
  speedingShown = true;
  const el = document.getElementById('speeding-mode');
  if (!el) return;
  el.classList.remove('hidden');
  if (speedingTimer) clearTimeout(speedingTimer);
  speedingTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

/* ── Cek sensor (ALL ON): jarum menyapu penuh lalu kembali ke 0 ── */
export function sensorCheckSweep(): Promise<void> {
  return new Promise(resolve => {
    sweeping = true;
    const dur = 1600;
    const t0 = performance.now();
    const step = (t: number): void => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = p < 0.5 ? p * 2 : (1 - p) * 2; // naik ke MAX lalu turun
      targetDisplaySpeed = eased * SG.MAX;
      currentDisplaySpeed = targetDisplaySpeed;
      animateSpeedo();
      if (p < 1) requestAnimationFrame(step);
      else {
        targetDisplaySpeed = 0;
        currentDisplaySpeed = 0;
        animateSpeedo();
        sweeping = false;
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

export function resetSpeedEngine(): void {
  maxSpeed = 0;
  currentDisplaySpeed = 0;
  targetDisplaySpeed = 0;
  const maxEl = $opt('sg-max');
  if (maxEl) maxEl.textContent = 'MAX 0';
  const valMax = $opt('val-maxspd');
  if (valMax) valMax.textContent = '0';
  setSpeedoArc(0);
}

export function resetMaxSpeed(): void {
  resetSpeedEngine();
  showToast('Max speed direset', 'muted');
}

const GF = { CX: 110, CY: 110, R: 80, RARC: 96 };

export function buildGForceSVG(): void {
  const svg = $opt<SVGSVGElement>('gf-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const defs = svgE('defs');
  defs.innerHTML = `
      <filter id="gfGlow"><feGaussianBlur stdDeviation="3" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <radialGradient id="gfBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stop-color="rgba(var(--alr-rgb),0.07)"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>`;
  svg.appendChild(defs);

  svg.appendChild(svgE('circle', { cx: 110, cy: 110, r: 108, fill: 'none', stroke: 'var(--border)', 'stroke-width': '.5' }));
  svg.appendChild(svgE('circle', { cx: 110, cy: 110, r: 100, fill: 'none', stroke: 'var(--border2)', 'stroke-width': '.5' }));

  const arcTrack = svgE('path', { fill: 'none', stroke: 'var(--s3)', 'stroke-width': '8', 'stroke-linecap': 'round', opacity: '.5' });
  arcTrack.setAttribute('d', arcPath(GF.CX, GF.CY, GF.RARC, 135, 405));
  svg.appendChild(arcTrack);

  const arcFill = svgE('path', {
    id: 'gf-arc', fill: 'none', stroke: 'var(--red2)', 'stroke-width': '8', 'stroke-linecap': 'round', opacity: '0', filter: 'url(#gfGlow)',
  });
  svg.appendChild(arcFill);

  svg.appendChild(svgE('circle', { cx: 110, cy: 110, r: GF.R, fill: 'url(#gfBg)' }));

  [
    { r: GF.R * 0.25, lbl: '0.5G' },
    { r: GF.R * 0.5, lbl: '1G' },
    { r: GF.R * 0.75, lbl: '1.5G' },
    { r: GF.R, lbl: '2G' },
  ].forEach(({ r, lbl }) => {
    svg.appendChild(svgE('circle', { cx: 110, cy: 110, r, fill: 'none', stroke: 'var(--border2)', 'stroke-width': '0.7', 'stroke-dasharray': '2 5' }));
    const lp = polarXY(110, 110, r, 20);
    svg.appendChild(svgE('text', {
      x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': 'Share Tech Mono', 'font-size': '6.5', fill: 'var(--muted)',
    }, lbl));
  });

  svg.appendChild(svgE('line', { x1: 22, y1: 110, x2: 198, y2: 110, stroke: 'var(--border2)', 'stroke-width': '.5' }));
  svg.appendChild(svgE('line', { x1: 110, y1: 22, x2: 110, y2: 198, stroke: 'var(--border2)', 'stroke-width': '.5' }));

  [['F', 110, 18], ['B', 110, 206], ['L', 18, 113], ['R', 202, 113]].forEach(([t, x, y]) => {
    svg.appendChild(svgE('text', {
      x: x as number, y: y as number, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': 'Exo 2', 'font-size': '7', 'font-weight': '700', fill: 'var(--muted)',
    }, t as string));
  });

  svg.appendChild(svgE('circle', { id: 'gf-ring', cx: 110, cy: 110, r: 16, fill: 'none', stroke: 'var(--muted)', 'stroke-width': '1', opacity: '0' }));
  svg.appendChild(svgE('circle', { id: 'gf-dot', cx: 110, cy: 110, r: 9, fill: 'var(--muted)', stroke: 'none', filter: 'url(#gfGlow)' }));
  svg.appendChild(svgE('text', { id: 'gf-sv', x: 110, y: 104, 'text-anchor': 'middle', 'font-family': 'Share Tech Mono', 'font-size': '24', fill: 'var(--red2)', filter: 'url(#gfGlow)' }, '1.0'));
  svg.appendChild(svgE('text', { x: 110, y: 122, 'text-anchor': 'middle', 'font-family': 'Exo 2', 'font-size': '7', fill: 'var(--muted2)', 'font-weight': '700', 'letter-spacing': '2' }, 'G-FORCE'));
}

export function updateGForceMeter(G: number, gx: number, gy: number): void {
  const MAX = 2;
  const CX = GF.CX, CY = GF.CY, R = GF.R, RARC = GF.RARC;
  let dx = CX + (gx / MAX) * R;
  let dy = CY - (gy / MAX) * R;
  const dist = Math.hypot(dx - CX, dy - CY);
  if (dist > R) {
    dx = CX + (dx - CX) * R / dist;
    dy = CY + (dy - CY) * R / dist;
  }

  const dot = $opt<SVGCircleElement>('gf-dot');
  const ring = $opt<SVGCircleElement>('gf-ring');
  const sv = $opt('gf-sv');
  const arc = $opt<SVGPathElement>('gf-arc');

  const color = G < 0.4 ? 'var(--muted)' : G < 1.0 ? 'var(--gold)' : G < 1.5 ? 'var(--gold2)' : 'var(--red2)';

  if (dot) {
    dot.setAttribute('cx', dx.toFixed(1));
    dot.setAttribute('cy', dy.toFixed(1));
    dot.setAttribute('fill', color);
  }
  if (ring) {
    ring.setAttribute('cx', dx.toFixed(1));
    ring.setAttribute('cy', dy.toFixed(1));
    ring.setAttribute('stroke', color);
    ring.setAttribute('opacity', Math.min(0.7, G * 0.45).toFixed(2));
  }
  if (sv) {
    sv.textContent = G.toFixed(1);
    sv.setAttribute('fill', color);
  }

  if (arc) {
    const g = Math.min(G, MAX);
    if (g > 0.05) {
      const sw = (g / MAX) * 270;
      arc.setAttribute('d', arcPath(CX, CY, RARC, 135, 135 + sw));
      arc.setAttribute('stroke', color);
      arc.style.opacity = '1';
    } else {
      arc.style.opacity = '0';
    }
  }

  ['gforce-val', 'gforce-val-p'].forEach(id => {
    const el = $opt(id);
    if (el) el.textContent = G.toFixed(1);
  });
}

const LS = { CX: 110, CY: 110, R: 90, START: 150, SWEEP: 240 };

export function buildLeanSVG(): void {
  const svg = $opt<SVGSVGElement>('lean-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const defs = svgE('defs');
  defs.innerHTML = `
      <filter id="lsGlow"><feGaussianBlur stdDeviation="2.5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg.appendChild(defs);

  svg.appendChild(svgE('circle', { cx: 110, cy: 110, r: 108, fill: 'none', stroke: 'var(--border)', 'stroke-width': '.5' }));
  svg.appendChild(svgE('circle', { cx: 110, cy: 110, r: 100, fill: 'none', stroke: 'var(--border2)', 'stroke-width': '.5' }));

  const addZone = (s: number, e: number, col: string, op = 0.28): void => {
    const p = svgE('path', { fill: 'none', stroke: col, 'stroke-width': '14', 'stroke-linecap': 'round', opacity: String(op) });
    p.setAttribute('d', arcPath(LS.CX, LS.CY, LS.R, s, e));
    svg.appendChild(p);
  };
  addZone(150, 216, 'var(--red)', 0.3);
  addZone(324, 390, 'var(--red)', 0.3);
  addZone(216, 240, '#ff6600', 0.25);
  addZone(300, 324, '#ff6600', 0.25);
  addZone(240, 300, 'var(--gold)', 0.2);

  const track = svgE('path', { fill: 'none', stroke: 'var(--s3)', 'stroke-width': '14', 'stroke-linecap': 'round', opacity: '.35' });
  track.setAttribute('d', arcPath(LS.CX, LS.CY, LS.R, LS.START, LS.START + LS.SWEEP));
  svg.appendChild(track);

  const fill = svgE('path', {
    id: 'ls-fill', fill: 'none', stroke: 'var(--gold)', 'stroke-width': '14', 'stroke-linecap': 'round', opacity: '0', filter: 'url(#lsGlow)',
  });
  svg.appendChild(fill);

  for (let lean = -90; lean <= 90; lean += 15) {
    const major = lean % 45 === 0;
    const gaugeAng = 270 + (lean / 90) * 120;
    const rIn = LS.R + (major ? 15 : 8);
    const rOut = LS.R + (major ? 26 : 17);
    const p1 = polarXY(LS.CX, LS.CY, rIn, gaugeAng);
    const p2 = polarXY(LS.CX, LS.CY, rOut, gaugeAng);
    svg.appendChild(svgE('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      stroke: major ? 'rgba(var(--acc-rgb),.6)' : 'var(--border2)',
      'stroke-width': major ? '1.8' : '0.8',
    }));
    if (major) {
      const lbl = lean === 0 ? '0' : Math.abs(lean).toString();
      const col = Math.abs(lean) >= 60 ? 'var(--red2)' : Math.abs(lean) >= 40 ? 'var(--warn)' : 'var(--gold)';
      const tp = polarXY(LS.CX, LS.CY, rOut + 10, gaugeAng);
      svg.appendChild(svgE('text', {
        x: tp.x, y: tp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': 'Share Tech Mono', 'font-size': '7.5', fill: col,
      }, lbl));
    }
  }

  svg.appendChild(svgE('circle', { cx: 110, cy: 110, r: 72, fill: 'var(--s1)' }));
  svg.appendChild(svgE('circle', { cx: 110, cy: 110, r: 71, fill: 'none', stroke: 'var(--border)', 'stroke-width': '.5' }));

  const nTip0 = polarXY(LS.CX, LS.CY, LS.R, 270);
  svg.appendChild(svgE('line', {
    id: 'ls-needle', x1: LS.CX, y1: LS.CY, x2: nTip0.x, y2: nTip0.y,
    stroke: 'var(--gold)', 'stroke-width': '2.5', 'stroke-linecap': 'round', filter: 'url(#lsGlow)',
  }));

  svg.appendChild(svgE('circle', {
    cx: 110, cy: 110, r: 7, fill: 'var(--gold)', stroke: 'var(--s1)', 'stroke-width': '2.5', filter: 'url(#lsGlow)',
  }));

  svg.appendChild(svgE('text', {
    id: 'ls-sv', x: 110, y: 104, 'text-anchor': 'middle', 'font-family': 'Share Tech Mono',
    'font-size': '34', fill: 'var(--gold)', filter: 'url(#lsGlow)',
  }, '0'));

  svg.appendChild(svgE('text', {
    x: 110, y: 122, 'text-anchor': 'middle', 'font-family': 'Exo 2', 'font-size': '8',
    fill: 'var(--muted2)', 'font-weight': '700', 'letter-spacing': '2',
  }, 'DEGREES'));

  svg.appendChild(svgE('text', {
    id: 'ls-dir', x: 110, y: 138, 'text-anchor': 'middle', 'font-family': 'Share Tech Mono',
    'font-size': '8', fill: 'var(--muted)',
  }, 'CENTER'));

  const lp = polarXY(LS.CX, LS.CY, LS.R + 30, LS.START);
  const rp = polarXY(LS.CX, LS.CY, LS.R + 30, LS.START + LS.SWEEP);
  svg.appendChild(svgE('text', {
    x: lp.x, y: lp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-family': 'Exo 2', 'font-size': '8', 'font-weight': '700', fill: 'var(--red2)',
  }, 'L'));
  svg.appendChild(svgE('text', {
    x: rp.x, y: rp.y, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    'font-family': 'Exo 2', 'font-size': '8', 'font-weight': '700', fill: 'var(--red2)',
  }, 'R'));
}

export function updateLeanGauge(angle: number): void {
  const CX = LS.CX, CY = LS.CY, R = LS.R;
  const CENTER = 270;
  const needleDeg = CENTER + (angle / 90) * 120;
  const tip = polarXY(CX, CY, R, needleDeg);
  const absA = Math.abs(angle);

  const needle = $opt<SVGLineElement>('ls-needle');
  if (needle) {
    needle.setAttribute('x2', tip.x.toFixed(2));
    needle.setAttribute('y2', tip.y.toFixed(2));
  }

  const fillEl = $opt<SVGPathElement>('ls-fill');
  if (fillEl) {
    if (absA > 0.5) {
      const s = angle >= 0 ? CENTER : needleDeg;
      const e = angle >= 0 ? needleDeg : CENTER;
      fillEl.setAttribute('d', arcPath(CX, CY, R, s, e));
      const col = absA < 40 ? 'var(--gold)' : absA < 60 ? 'var(--warn)' : 'var(--red2)';
      fillEl.setAttribute('stroke', col);
      fillEl.style.opacity = '1';
    } else {
      fillEl.style.opacity = '0';
    }
  }

  const sv = $opt('ls-sv');
  if (sv) sv.textContent = String(Math.round(absA));
  const dir = $opt('ls-dir');
  if (dir) dir.textContent = absA < 3 ? 'CENTER' : angle > 0 ? '→ RIGHT' : 'LEFT ←';

  const hdr = $opt('lean-dir-hdr');
  if (hdr) hdr.textContent = absA < 3 ? '—' : angle > 0 ? 'R →' : '← L';

  ['lean-val', 'lean-val-p'].forEach(id => {
    const el = $opt(id);
    if (el) el.textContent = String(Math.round(absA));
  });
  const labsN = $opt('lean-needle');
  if (labsN) (labsN as HTMLElement).style.transform = `translateX(-50%) rotate(${angle}deg)`;
}

/* ── ROUND COMPASS ──────────────────────────────────── */
export function buildCompassSVG(): void {
  document.querySelectorAll<SVGSVGElement>('svg.compass-svg').forEach(svg => {
    if (svg.dataset.built) return;
    svg.dataset.built = '1';

    svg.appendChild(svgE('circle', { cx: 60, cy: 60, r: 58, fill: 'var(--s1)', stroke: 'var(--border2)', 'stroke-width': '1' }));
    svg.appendChild(svgE('circle', { cx: 60, cy: 60, r: 54, fill: 'none', stroke: 'rgba(var(--acc-rgb),.35)', 'stroke-width': '2' }));

    const rose = svgE('g', { class: 'compass-rose' });
    for (let d = 0; d < 360; d += 15) {
      const major = d % 90 === 0;
      const p1 = polarXY(60, 60, major ? 42 : 47, d);
      const p2 = polarXY(60, 60, 51, d);
      rose.appendChild(svgE('line', {
        x1: p1.x.toFixed(1), y1: p1.y.toFixed(1), x2: p2.x.toFixed(1), y2: p2.y.toFixed(1),
        stroke: major ? 'rgba(var(--acc-rgb),.8)' : 'var(--muted)',
        'stroke-width': major ? '1.6' : '0.7',
      }));
    }
    [
      { t: 'N', d: 0, col: 'var(--red2)' },
      { t: 'E', d: 90, col: 'var(--gold2)' },
      { t: 'S', d: 180, col: 'var(--off-wh)' },
      { t: 'W', d: 270, col: 'var(--off-wh)' },
    ].forEach(({ t, d, col }) => {
      const p = polarXY(60, 60, 33, d);
      rose.appendChild(svgE('text', {
        x: p.x.toFixed(1), y: p.y.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-family': 'Exo 2', 'font-size': '11', 'font-weight': '800', fill: col,
      }, t));
    });
    svg.appendChild(rose);

    svg.appendChild(svgE('polygon', { points: '60,1.5 56.5,9.5 63.5,9.5', fill: 'var(--gold)' }));
    svg.appendChild(svgE('circle', { cx: 60, cy: 60, r: 12.5, fill: 'var(--s2)', stroke: 'var(--border2)', 'stroke-width': '1' }));
    svg.appendChild(svgE('text', {
      class: 'compass-hdg', x: 60, y: 60.5, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': 'Share Tech Mono', 'font-size': '11', fill: 'var(--gold)',
    }, '—'));
  });
}
