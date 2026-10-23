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
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('BCR Touring: ride list, detail, split, peta', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#view-garage')).toBeVisible();

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('BCRideDB', 6);
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
