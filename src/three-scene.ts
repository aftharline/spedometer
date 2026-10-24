import * as THREE from 'three';

let started = false;

const accentRGB = (): string => getComputedStyle(document.documentElement).getPropertyValue('--acc-rgb').trim() || '212,160,23';
const alertRGB = (): string => getComputedStyle(document.documentElement).getPropertyValue('--alr-rgb').trim() || '204,17,34';

export function initThreeScene(): void {
  if (started) return;
  const canvas3d = document.getElementById('ride-3d-canvas') as HTMLCanvasElement | null;
  if (!canvas3d) return;
  started = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 120);
  camera.position.set(0, 4.2, 9.5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene.add(new THREE.AmbientLight(0x332211, 0.55));
  const key = new THREE.DirectionalLight(0xd4a017, 3.0);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const rim = new THREE.PointLight(0xff2244, 3.5, 28);
  rim.position.set(4, 2.2, 2);
  scene.add(rim);
  const fill = new THREE.PointLight(0xffd700, 1.5, 18);
  fill.position.set(-4, 1, -2);
  scene.add(fill);

  const hud = new THREE.Group();
  scene.add(hud);

  const road = new THREE.Group();
  hud.add(road);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x2a2000, transparent: true, opacity: 0.35 });
  const centerMat = new THREE.LineBasicMaterial({ color: 0xd4a017, transparent: true, opacity: 0.55 });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xcc1122, transparent: true, opacity: 0.3 });
  for (let i = -5; i <= 5; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(i, -0.55, -32),
      new THREE.Vector3(i, -0.55, 8),
    ]);
    const mat = i === 0 ? centerMat : Math.abs(i) === 5 ? edgeMat : lineMat;
    road.add(new THREE.Line(g, mat));
  }
  for (let z = -32; z <= 8; z += 2) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-5, -0.55, z),
      new THREE.Vector3(5, -0.55, z),
    ]);
    road.add(new THREE.Line(g, lineMat));
  }

  const bike = new THREE.Group();
  hud.add(bike);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, emissive: 0xd4a017, emissiveIntensity: 1.5, metalness: 0.7, roughness: 0.2 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xcc1122, emissive: 0xcc1122, emissiveIntensity: 1.8, metalness: 0.5, roughness: 0.3 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, metalness: 0.9, roughness: 0.2 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.78), blackMat);
  body.position.y = 0.35;
  bike.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.1), goldMat);
  stripe.position.set(0, 0.46, 0.35);
  bike.add(stripe);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.3, 0.5), redMat);
  cockpit.position.set(0.12, 0.6, -0.08);
  bike.add(cockpit);

  const wheelGeo = new THREE.TorusGeometry(0.46, 0.045, 10, 42);
  const fw = new THREE.Mesh(wheelGeo, blackMat);
  fw.position.set(1.05, 0.08, 0);
  fw.rotation.y = Math.PI / 2;
  bike.add(fw);
  const rw = fw.clone();
  rw.position.x = -1.05;
  bike.add(rw);

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.8, 10), goldMat);
  exhaust.rotation.z = Math.PI / 2;
  exhaust.position.set(-0.9, 0.1, 0.28);
  bike.add(exhaust);

  bike.scale.set(1.45, 1.45, 1.45);
  bike.position.z = -1.4;

  const points: number[] = [];
  for (let i = 0; i < 180; i++) {
    points.push((Math.random() - 0.5) * 12, Math.random() * 6 - 1.5, Math.random() * -36 + 8);
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0xd4a017, size: 0.025, transparent: true, opacity: 0.55 });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  const pts2: number[] = [];
  for (let i = 0; i < 60; i++) {
    pts2.push((Math.random() - 0.5) * 8, Math.random() * 3 - 0.5, Math.random() * -20 + 4);
  }
  const geo2 = new THREE.BufferGeometry();
  geo2.setAttribute('position', new THREE.Float32BufferAttribute(pts2, 3));
  const mat2 = new THREE.PointsMaterial({ color: 0xcc1122, size: 0.018, transparent: true, opacity: 0.35 });
  const particles2 = new THREE.Points(geo2, mat2);
  scene.add(particles2);

  const retint = (): void => {
    const acc = new THREE.Color(`rgb(${accentRGB()})`);
    const alr = new THREE.Color(`rgb(${alertRGB()})`);
    key.color.copy(acc);
    fill.color.copy(acc);
    rim.color.copy(alr);
    centerMat.color.copy(acc);
    goldMat.color.copy(acc);
    goldMat.emissive.copy(acc);
    particleMat.color.copy(acc);
    edgeMat.color.copy(alr);
    redMat.color.copy(alr);
    redMat.emissive.copy(alr);
    mat2.color.copy(alr);
  };
  retint();
  window.addEventListener('themechange', retint);

  let state = { speed: 0, lean: 0, g: 1, gx: 0, gy: 0, heading: 0 };
  window.addEventListener('ride3d:update', e => {
    state = { ...state, ...(e as CustomEvent).detail };
  });

  let diagnosticsDone = false;

  const resize = (): void => {
    const rect = canvas3d.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w < 10 || h < 10) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    diagnosticsDone = false;
  };
  (window as any).ride3dResize = resize;
  new ResizeObserver(resize).observe(canvas3d);
  resize();

  const clock = new THREE.Clock();

  const markRenderDiagnostics = (): void => {
    if (diagnosticsDone) return;
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    if (w < 10 || h < 10) return;
    const px = new Uint8Array(36);
    const samplePoints = [
      [0.2, 0.2], [0.5, 0.2], [0.8, 0.2],
      [0.2, 0.5], [0.5, 0.5], [0.8, 0.5],
      [0.2, 0.8], [0.5, 0.8], [0.8, 0.8],
    ];
    let nonblank = 0;
    samplePoints.forEach(([x, y], i) => {
      gl.readPixels(Math.floor(w * x), Math.floor(h * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px, i * 4);
      const o = i * 4;
      if (px[o] || px[o + 1] || px[o + 2] || px[o + 3]) nonblank++;
    });
    canvas3d.dataset.rendered = String(nonblank);
    canvas3d.dataset.buffer = `${w}x${h}`;
    diagnosticsDone = nonblank > 0;
  };

  const animate = (): void => {
    requestAnimationFrame(animate);
    const dash = document.getElementById('view-dashboard');
    if (dash && dash.classList.contains('hidden')) return;

    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    resize();
    const leanRad = THREE.MathUtils.degToRad(state.lean || 0);
    const speedFactor = Math.min(1, (state.speed || 0) / 120);
    bike.rotation.z = THREE.MathUtils.lerp(bike.rotation.z, -leanRad, 0.09);
    bike.rotation.y = THREE.MathUtils.lerp(bike.rotation.y, (state.gx || 0) * 0.22, 0.07);
    bike.position.y = 0.35 + Math.sin(t * 3.2) * 0.022 + (state.g - 1) * 0.08;
    fw.rotation.z -= dt * (6 + speedFactor * 28);
    rw.rotation.z -= dt * (6 + speedFactor * 28);
    road.position.z = (t * (2 + speedFactor * 22)) % 2;
    road.rotation.z = THREE.MathUtils.lerp(road.rotation.z, leanRad * 0.16, 0.06);
    hud.rotation.y = THREE.MathUtils.lerp(hud.rotation.y, THREE.MathUtils.degToRad((state.heading || 0) % 360) * 0.018, 0.02);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, (state.gx || 0) * 0.45, 0.05);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 4.2 + (state.g - 1) * 0.18, 0.05);
    camera.lookAt(0, 0.12, -2);

    const pos = particles.geometry.attributes.position;
    for (let i = 2; i < pos.array.length; i += 3) {
      pos.array[i] += dt * (2 + speedFactor * 18);
      if (pos.array[i] > 8) pos.array[i] = -36;
    }
    pos.needsUpdate = true;

    const pos2 = particles2.geometry.attributes.position;
    for (let i = 2; i < pos2.array.length; i += 3) {
      pos2.array[i] += dt * (1 + speedFactor * 10);
      if (pos2.array[i] > 4) pos2.array[i] = -20;
    }
    pos2.needsUpdate = true;

    key.intensity = THREE.MathUtils.lerp(key.intensity, 3.0 + speedFactor * 1.5, 0.05);

    renderer.render(scene, camera);
    markRenderDiagnostics();
  };
  animate();
}
