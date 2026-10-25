import { expect, test } from '@playwright/test';

test('garage, ride, labs, dan checklist berjalan tanpa error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });

  await page.goto('/');
  await expect(page.locator('#view-garage')).toBeVisible();

  await page.getByRole('button', { name: /TAMBAH/ }).click();
  await page.locator('#v_name').fill('Scoopy Test');
  await page.locator('#v_brand').fill('Honda');
  await page.getByRole('button', { name: /SIMPAN KENDARAAN/ }).click();
  await expect(page.locator('#vehicle-list')).toContainText('Scoopy Test');

  await page.locator('.vehicle-card').first().click();
  await expect(page.locator('#detail-name')).toHaveText('SCOOPY TEST');

  await page.getByRole('button', { name: /SERVIS/ }).click();
  await page.locator('#s_odo').fill('12000');
  await page.locator('#s_parts').fill('Ganti oli');
  await page.getByRole('button', { name: /SIMPAN SERVIS/ }).click();
  await expect(page.locator('#logs-list')).toContainText('Ganti oli');

  await page.locator('#nav-dashboard').click();
  await expect(page.locator('#view-dashboard')).toBeVisible();
  await expect(page.locator('#sg-value')).toHaveText(/\d+/);
  await expect(page.locator('#gps-status')).toContainText('GPS AKTIF');

  await page.locator('#nav-labs').click();
  await expect(page.locator('#view-labs')).toBeVisible();

  await page.locator('#nav-checklist').click();
  await expect(page.locator('#view-checklist')).toBeVisible();
  await page.locator('#c_item').fill('Helm');
  await page.getByLabel('Tambah item checklist').click();
  await expect(page.locator('#checklist-items')).toContainText('Helm');

  expect(errors).toEqual([]);
});

test('PWA tetap terbuka saat offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#view-garage')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#view-garage')).toBeVisible();
  await context.setOffline(false);
});

test('sensor tetap aktif lintas halaman & tema terlihat di landscape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#view-garage')).toBeVisible();

  await page.locator('#nav-dashboard').click();
  await expect(page.locator('#view-dashboard')).toBeVisible();

  await page.locator('#btn-telemetry-p').click();
  await expect(page.locator('#btn-telemetry-p')).toHaveText('STOP');

  await page.locator('#nav-labs').click();
  await expect(page.locator('#view-labs')).toBeVisible();

  await page.locator('#nav-dashboard').click();
  await expect(page.locator('#btn-telemetry-p')).toHaveText('STOP');
  await expect(page.locator('#gps-status')).toContainText('GPS AKTIF');

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#btn-theme-ls')).toBeVisible();
  await page.locator('#btn-theme-ls').click();
  await expect(page.locator('#modal-theme')).toBeVisible();
  await page.locator('.theme-card[data-id="bcr-light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'bcr-light');
  await page.locator('.theme-card[data-id="ninja"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ninja');
  await page.locator('.theme-card[data-id="panigale"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'panigale');
  await page.locator('.theme-card[data-id="bcr"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'bcr');
});

test('BCR Touring: ride list, detail, split, peta', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#view-garage')).toBeVisible();

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('BCRideDB', 7);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        pts.push({ lat: -7.25 + i * 0.00008, lng: 112.75 + i * 0.0004, t: Date.now() - (30 - i) * 60000, alt: 20 + i, spd: 40 });
      }
      const tx = db.transaction('rides', 'readwrite');
      tx.objectStore('rides').add({
        vehicleId: '', name: 'Ride Test BCR', start: Date.now() - 30 * 60000, end: Date.now(),
        distKm: 1.3, movingSec: 1800, avgKmh: 38, maxKmh: 65, gainM: 12, points: pts,
      });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  });

  await page.locator('#nav-touring').click();
  await expect(page.locator('#ride-list')).toContainText('Ride Test BCR');
  await expect(page.locator('#ts-total')).toHaveText('1');

  await page.locator('.ride-card').first().click();
  await expect(page.locator('#rd-name')).toHaveText('Ride Test BCR');
  await expect(page.locator('#rd-splits')).toContainText('KM 1');
  await expect(page.locator('#rd-map .leaflet-overlay-pane path')).toHaveCount(1);
  await expect(page.locator('#rd-chart polyline')).toHaveCount(1);
});

test('REC: mulai, stop, ride pendek ditolak', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#view-garage')).toBeVisible();

  await page.getByRole('button', { name: /TAMBAH/ }).click();
  await page.locator('#v_name').fill('Scoopy Test');
  await page.locator('#v_brand').fill('Honda');
  await page.getByRole('button', { name: /SIMPAN KENDARAAN/ }).click();
  await page.locator('.vehicle-card').first().click();
  await expect(page.locator('#detail-name')).toHaveText('SCOOPY TEST');

  await page.locator('#nav-dashboard').click();
  await expect(page.locator('#view-dashboard')).toBeVisible();

  await page.locator('#btn-rec').click();
  await expect(page.locator('#btn-rec')).toHaveClass(/recording/);
  await expect(page.locator('#rec-time')).toBeVisible();

  await page.locator('#btn-rec').click();
  await expect(page.locator('#toast')).toContainText('terlalu pendek', { ignoreCase: true });
  await expect(page.locator('#btn-rec')).not.toHaveClass(/recording/);
});

test('Master button: aktifkan & matikan semua sensor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#nav-dashboard').click();
  await expect(page.locator('#view-dashboard')).toBeVisible();

  await page.locator('#btn-master').click();
  await expect(page.locator('#btn-master')).toHaveClass(/all-on/);
  await expect(page.locator('#btn-master')).toContainText('LIVE');
  await expect(page.locator('#btn-telemetry-p')).toHaveText('STOP');
  await expect(page.locator('#btn-audio-ls')).toHaveText('STOP');

  await page.locator('#btn-master').click();
  await expect(page.locator('#btn-telemetry-p')).toHaveText('START');
  await expect(page.locator('#btn-audio-ls')).toHaveText('MIC ON');
});

test('NAVI: cari tujuan, rute, mulai navigasi', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ display_name: 'Monumen Nasional, Jakarta Pusat, DKI Jakarta', lat: '-6.1754', lon: '106.8272' }]),
    }),
  );
  await page.route('**/router.project-osrm.org/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        routes: [{
          distance: 4000,
          duration: 480,
          geometry: { coordinates: [[112.75, -7.25], [112.752, -7.252], [112.754, -7.254], [112.756, -7.256], [112.758, -7.258]] },
          legs: [{ steps: [
            { distance: 2000, duration: 240, name: 'Jl. Raya BCR', maneuver: { type: 'depart', location: [112.75, -7.25] } },
            { distance: 2000, duration: 240, name: 'Jl. Kenjeran', maneuver: { type: 'turn', modifier: 'right', location: [112.754, -7.254] } },
          ] }],
        }],
      }),
    }),
  );

  await page.goto('/');
  await page.locator('#nav-dashboard').click();
  await expect(page.locator('#view-dashboard')).toBeVisible();
  await page.waitForTimeout(800);

  await page.locator('#mode-navi-mini').click();
  await expect(page.locator('#navi-mode.navi-embedded')).toBeVisible();
  await expect(page.locator('#instrument-cluster')).toBeVisible();

  await page.locator('#navi-q').fill('Monas');
  await page.locator('.navi-result').first().click();
  await expect(page.locator('#navi-preview')).toContainText('4,0 km');
  await page.locator('#navi-map .leaflet-overlay-pane path').first().waitFor();

  await page.locator('#navi-actions button', { hasText: 'MULAI' }).click();
  await expect(page.locator('#navi-banner')).toBeVisible();

  await context.setGeolocation({ latitude: -7.253, longitude: 112.755 });
  await expect(page.locator('#navi-eta')).toContainText('km');
  await expect(page.locator('#navi-eta')).toContainText('tiba');
  await expect(page.locator('#nb-dist')).not.toHaveText('—');

  // geser peta → lock lepas, chip pusatkan muncul; tap chip → lock balik
  const mapBox = await page.locator('#navi-map').boundingBox();
  if (!mapBox) throw new Error('navi-map hilang');
  const cx = mapBox.x + mapBox.width / 2;
  const cy = mapBox.y + mapBox.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 60, cy + 40, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('#navi-recenter')).toBeVisible();
  await page.locator('#navi-recenter').click();
  await expect(page.locator('#navi-recenter')).toBeHidden();

  await page.locator('#navi-banner button').click();
  await expect(page.locator('#navi-banner')).toBeHidden();

  await page.locator('#mode-navi-mini').click();
  await expect(page.locator('#navi-mode')).toBeVisible();
  await expect(page.locator('#instrument-cluster')).toBeVisible();
  await expect(page.locator('#bcr-mini-instruments')).toBeVisible();
  await expect(page.locator('#speedo-svg')).toBeHidden();

  await page.locator('#mode-speedo').click();
  await expect(page.locator('#instrument-cluster')).toBeVisible();
  await expect(page.locator('#speedo-svg')).toBeVisible();
  await expect(page.locator('#navi-mode')).toBeHidden();
});

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('Foto ride: strip di detail + modal fullscreen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1200);

  await page.evaluate(async TINY => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('BCRideDB', 7);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise(res => {
      const now = Date.now() - 60_000;
      const tx = db.transaction(['rides', 'photos', 'vehicles'], 'readwrite');
      tx.objectStore('rides').add({
        vehicleId: 'e2e', name: 'Ride Foto', start: now, end: now + 50_000,
        distKm: 1.2, movingSec: 60, avgKmh: 50, maxKmh: 60, gainM: 0,
        points: [
          { lat: -7.25, lng: 112.75, t: now, spd: 30 },
          { lat: -7.252, lng: 112.752, t: now + 50_000, spd: 45 },
        ],
      });
      tx.objectStore('photos').add({ rideKey: now, at: now + 10_000, dataUrl: TINY, lat: -7.25, lng: 112.75, spd: 42 });
      tx.objectStore('vehicles').add({ id: 'e2e-veh', name: 'Test Moto', brand: 'Honda', type: 'motor' });
      tx.oncomplete = () => res(null);
    });
  }, TINY_PNG);

  await page.reload();
  await page.locator('#nav-touring').click();
  await page.locator('.ride-card').first().click();
  await expect(page.locator('#rd-photos')).toBeVisible();
  const thumb = page.locator('.rd-photo-thumb').first();
  await expect(thumb).toBeVisible();

  await thumb.click();
  await expect(page.locator('#modal-photo')).toBeVisible();
  await expect(page.locator('#pv-stats')).toContainText('42');
  await expect(page.locator('#pv-img')).toBeVisible();

  await page.locator('.pv-top .pv-btn').first().click();
  await expect(page.locator('#modal-photo')).toBeHidden();
});

test('NAVI lanjutan: rotasi, speed limit, junction card', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/router.project-osrm.org/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        routes: [{
          distance: 5200,
          duration: 620,
          geometry: { coordinates: [
            [112.75, -7.25], [112.751, -7.25], [112.752, -7.251], [112.753, -7.251],
            [112.754, -7.25], [112.756, -7.248], [112.758, -7.248], [112.759, -7.247],
          ] },
          legs: [{
            annotation: { lanes: [2, 2, 2, 4, 2, 2, 3] },
            steps: [
              { distance: 800, duration: 120, name: 'Jl. Kalimulyo', geometry: { coordinates: [[112.75, -7.25], [112.751, -7.25], [112.752, -7.251], [112.753, -7.251], [112.754, -7.25]] }, maneuver: { type: 'depart', location: [112.75, -7.25] } },
              { distance: 3000, duration: 320, name: 'Jl. Kusuma Bangsa', geometry: { coordinates: [[112.754, -7.25], [112.756, -7.248], [112.758, -7.248]] }, maneuver: { type: 'turn', modifier: 'left', location: [112.754, -7.25] } },
              { distance: 1400, duration: 180, name: 'Jl. Darmo Satok', geometry: { coordinates: [[112.758, -7.248], [112.759, -7.247]] }, maneuver: { type: 'arrive', location: [112.759, -7.247] } },
            ],
          }],
        }],
      }),
    }),
  );
  await page.route('**/overpass-api.de/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ elements: [{ type: 'way', tags: { maxspeed: '50' } }] }),
    }),
  );

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('bcr_navi_favs', JSON.stringify([{ name: 'Jl. Kusuma Bangsa', lat: -7.2475, lng: 112.759 }]));
  });
  await page.reload();
  await page.locator('#nav-dashboard').click();
  await page.waitForTimeout(700);
  await page.locator('#mode-navi-mini').click();
  await page.locator('.fav-chip').first().click();
  await expect(page.locator('#navi-preview')).toContainText('km');
  await page.locator('#navi-actions button', { hasText: 'MULAI' }).click();
  await expect(page.locator('#navi-banner')).toBeVisible();
  await page.evaluate(() => window.setSpeedoArc?.(60)); // gate limit: speed > 5
  await page.context().setGeolocation({ latitude: -7.2505, longitude: 112.7535 });
  await expect(page.locator('#navi-junction')).toBeVisible();
  await expect(page.locator('#navi-junction')).toContainText('LAJUR');
  await expect(page.locator('#nb-limit')).toBeVisible();
  await expect(page.locator('#nb-limit')).toHaveText('50');
  await expect(page.locator('#navi-rotor.is-rotating')).toBeAttached();

  await page.locator('#navi-banner button').click();
  await expect(page.locator('#navi-junction')).toBeHidden();
  const rotReset = await page.evaluate(() => document.getElementById('navi-rotor')?.style.getPropertyValue('--rot') ?? '');
  expect(rotReset).toBe('0deg');
});

test('Live camera PIP: buka, jepret, tutup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#nav-dashboard').click();
  await expect(page.locator('#view-dashboard')).toBeVisible();

  await page.locator('#btn-livecam').click();
  await expect(page.locator('#livecam-box')).toBeVisible();
  await expect(page.locator('#livecam-video')).toBeVisible();
  await expect(page.locator('#btn-livecam')).toHaveClass(/lc-on/);

  await page.locator('.lc-btn').first().click();
  await expect(page.locator('#toast')).toContainText('Foto tersimpan', { ignoreCase: true });

  await page.locator('.lc-top .lc-btn').nth(1).click();
  await expect(page.locator('#livecam-box')).toBeHidden();
  await expect(page.locator('#btn-livecam')).not.toHaveClass(/lc-on/);
});
