/* ── RIDE 3D BACKGROUND — jalan prespektif + speed streaks +
   cakrawala berwarna livery. Murah: grid = 1 draw call, DPR ≤1.5,
   antialias off, tanpa lampu/shadow — loop berhenti saat view bukan
   dashboard, tab hidden, atau prefers-reduced-motion (frame statis). */

import * as THREE from 'three';

let started = false;

const accentRGB = (): string => getComputedStyle(document.documentElement).getPropertyValue('--acc-rgb').trim() || '212,160,23';
const accent2RGB = (): string => getComputedStyle(document.documentElement).getPropertyValue('--acc2-rgb').trim() || '245,200,66';

export function initThreeScene(): void {
  if (started) return;
  const canvas3d = document.getElementById('ride-3d-canvas') as HTMLCanvasElement | null;
  if (!canvas3d) return;
  started = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 140);
  camera.position.set(0, 2.3, 10);
  camera.lookAt(0, 0.4, -24);

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas3d, alpha: true, antialias: false, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── GRID JALAN — satu BufferGeometry, satu draw call ── */
  const LANES = 13;
  const TIES = 18;
  const SPAN = 14;
  const DEPTH = 76;
  const STEP = DEPTH / TIES;
  const verts: number[] = [];
  for (let i = 0; i < LANES; i++) {
    const x = -(SPAN / 2) + (SPAN / (LANES - 1)) * i;
    verts.push(x, 0, -DEPTH + 12, x, 0, 14);
  }
  for (let i = 0; i <= TIES; i++) {
    const z = 14 - STEP * i;
    verts.push(-SPAN / 2, 0, z, SPAN / 2, 0, z);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: new THREE.Color(`rgb(${accentRGB()})`), transparent: true, opacity: 0.55 });
  const grid = new THREE.LineSegments(gridGeo, gridMat);
  grid.position.y = -1.15;
  scene.add(grid);

  /* Garis tengah — jalur "energi" yang mengalir */
  const centerGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -DEPTH + 12),
    new THREE.Vector3(0, 0, 14),
  ]);
  const centerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(`rgb(${accent2RGB()})`), transparent: true, opacity: 1.0 });
  const center = new THREE.Line(centerGeo, centerMat);
  center.position.y = -1.14;
  scene.add(center);

  /* ── CAKRAWALA — pita cahaya additive berwarna livery ── */
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 4;
  glowCanvas.height = 128;
  const gctx = glowCanvas.getContext('2d')!;
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(200, 54), glowMat);
  glow.position.set(0, 6, -68);
  scene.add(glow);
  const repaintGlow = (): void => {
    const g = gctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,.03)');
    g.addColorStop(0.5, `rgba(${accentRGB()},.5)`);
    g.addColorStop(0.78, `rgba(${accentRGB()},.16)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.clearRect(0, 0, 4, 128);
    gctx.fillStyle = g;
    gctx.fillRect(0, 0, 4, 128);
    glowTex.needsUpdate = true;
  };
  repaintGlow();

  /* ── SPEED STREAKS — partikel additive, warna acc/acc2 ── */
  const mkStreaks = (count: number, color: string, size: number, opacity: number): THREE.Points => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * SPAN * 2.4;
      a[i * 3 + 1] = Math.random() * 7 - 0.8;
      a[i * 3 + 2] = 14 - Math.random() * (DEPTH + 12);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      color: new THREE.Color(`rgb(${color})`), size, transparent: true,
      opacity, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
  };
  const streaksA = mkStreaks(130, accentRGB(), 0.08, 0.8);
  const streaksB = mkStreaks(70, accent2RGB(), 0.13, 0.55);
  scene.add(streaksA, streaksB);

  /* ── TINT ulang saat livery berganti ── */
  const retint = (): void => {
    gridMat.color.set(`rgb(${accentRGB()})`);
    centerMat.color.set(`rgb(${accent2RGB()})`);
    (streaksA.material as THREE.PointsMaterial).color.set(`rgb(${accentRGB()})`);
    (streaksB.material as THREE.PointsMaterial).color.set(`rgb(${accent2RGB()})`);
    repaintGlow();
  };
  window.addEventListener('themechange', retint);

  /* ── STATE dari updateRideState (speed/lean/g) ── */
  let state: Record<string, number> = {};
  window.addEventListener('ride3d:update', e => {
    state = { ...state, ...(e as CustomEvent).detail };
  });

  /* Diagnostik e2e: cek buffer tidak blank semua */
  let diagnosticsDone = false;
  const markRenderDiagnostics = (): void => {
    if (diagnosticsDone) return;
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (w < 10 || h < 10) return;
    const px = new Uint8Array(4);
    let nonblank = 0;
    for (const [x, y] of [[0.2, 0.35], [0.5, 0.22], [0.75, 0.6]] as const) {
      gl.readPixels(Math.floor(w * x), Math.floor(h * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px, 0);
      if (px[0] || px[1] || px[2] || px[3]) nonblank++;
    }
    canvas3d.dataset.rendered = String(nonblank);
    diagnosticsDone = nonblank > 0;
  };

  const resize = (): void => {
    const rect = canvas3d.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w < 10 || h < 10) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    diagnosticsDone = false;
    if (reduced) {
      renderer.render(scene, camera); // statis ikut ukuran baru
      markRenderDiagnostics();
    }
  };
  new ResizeObserver(resize).observe(canvas3d);
  resize();

  /* Ember morion: render sekali statis jika pengguna minta kurang gerak */
  if (reduced) {
    renderer.render(scene, camera);
    markRenderDiagnostics();
    return;
  }

  const clock = new THREE.Clock();
  const dashVisible = (): boolean => {
    const dash = document.getElementById('view-dashboard');
    return !!dash && !dash.classList.contains('hidden') && document.visibilityState === 'visible';
  };

  let drift = 0;
  const animate = (): void => {
    requestAnimationFrame(animate);
    if (document.hidden || !dashVisible()) return; // rAF idle — murah
    const now = clock.getElapsedTime();
    const dt = Math.min(0.05, clock.getDelta());
    resize();
    const spd = Math.min(1, (state.speed ?? 0) / 120);
    const lean = THREE.MathUtils.degToRad(state.lean ?? 0);

    /* Jalan mengalir ke belakang; diam pun berjalan pelan */
    drift = (drift + dt * (1.6 + spd * 26)) % STEP;
    grid.position.z = -drift;
    center.position.z = -drift;

    /* Streak menyapu ke arah kamera, makin kencang makin deras */
    const adv = (pts: THREE.Points, base: number, mul: number): void => {
      const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 2; i < arr.length; i += 3) {
        arr[i] += dt * (base + spd * mul);
        if (arr[i] > 14) arr[i] = 14 - (DEPTH + 12);
      }
      attr.needsUpdate = true;
    };
    adv(streaksA, 3, 34);
    adv(streaksB, 2, 22);
    (streaksA.material as THREE.PointsMaterial).opacity = 0.3 + spd * 0.45;
    (streaksB.material as THREE.PointsMaterial).opacity = 0.18 + spd * 0.32;

    /* Kamera hidup: roll mengikuti lean + bob napas halus */
    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, lean * 0.16, 0.06);
    camera.position.y = 2.3 + Math.sin(now * 2.1) * 0.025 + ((state.g ?? 1) - 1);
    camera.rotation.y = Math.sin(now * 0.24) * 0.006;
    glowMat.opacity = 0.45 + Math.sin(now * 1.8) * 0.14 + spd * 0.3;

    renderer.render(scene, camera);
    markRenderDiagnostics();
  };
  animate();
}
