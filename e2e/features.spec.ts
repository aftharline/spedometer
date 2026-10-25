import { expect, test } from '@playwright/test';

test('SPEEDING MODE pop-up muncul ≥90 & hilang 3.5s', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), undefined, { timeout: 15000 });
  await page.evaluate(() => window.switchView('dashboard'));
  await page.waitForTimeout(2600); // tunggu speedo-splash selesai
  await page.evaluate(() => window.setSpeedoArc(95));
  await expect(page.locator('#speeding-mode')).toBeVisible();
  await expect(page.locator('#speeding-mode')).toContainText('SPEEDING');
  await page.waitForTimeout(3700);
  await expect(page.locator('#speeding-mode')).toBeHidden();
});

test('Speedo splash tampil sekali per sesi saat masuk dashboard', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), undefined, { timeout: 15000 });
  await page.evaluate(() => window.switchView('dashboard'));
  await expect(page.locator('#speedo-splash:not(.hidden)')).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.locator('#speedo-splash')).toBeHidden();
  await page.evaluate(() => { window.switchView('garage'); window.switchView('dashboard'); });
  await expect(page.locator('#speedo-splash')).toBeHidden(); // tidak muncul lagi
});

test('Sensor kecelakaan: toggle di settings on/off', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), undefined, { timeout: 15000 });
  await page.evaluate(() => localStorage.setItem('bcr_crash', 'on'));
  await page.locator('#btn-settings').click();
  const dot = page.locator('#set-dot-crash');
  await expect(dot).toHaveClass(/on/);
  await page.locator('#settings-list .set-row', { hasText: 'SENSOR KECELAKAAN' }).click();
  await expect(dot).not.toHaveClass(/on/);
  await page.locator('#settings-list .set-row', { hasText: 'SENSOR KECELAKAAN' }).click();
  await expect(dot).toHaveClass(/on/);
});

test('NAVI MINI landscape: RPM disembunyikan, peta membesar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), undefined, { timeout: 15000 });
  await page.evaluate(() => window.switchView('dashboard'));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.switchDashboardMode('navi-mini'));
  await expect(page.locator('#navi-mode')).toBeVisible();
  await expect(page.locator('#panel-speed.navi-embed')).toBeAttached();
  const rpmVisible = await page.locator('#btn-audio-ls').isVisible();
  expect(rpmVisible).toBe(false);
  const box = await page.locator('#navi-map').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThan(250);
});

test('LAP timer: garis start/finish GPS menutup lap + BEST', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), undefined, { timeout: 15000 });
  await page.evaluate(() => window.switchView('dashboard'));
  await page.waitForTimeout(2600); // speedo-splash selesai
  await page.evaluate(() => window.switchDashboardMode('navi-mini'));
  await page.evaluate(() => window.lapSetLine(-7.25, 112.75));
  await expect(page.locator('#lap-chip')).toBeVisible();
  await expect(page.locator('#lap-chip')).toContainText('LAP 1');
  await page.evaluate(() => window.lapCheck(-7.27, 112.75)); // ~2,2 km dari garis → keluar zona
  await page.evaluate(() => window.lapCheck(-7.25001, 112.75)); // 1,1 m → lintasi garis
  await expect(page.locator('#lap-chip')).toContainText('LAP 2');
  await expect(page.locator('#lap-chip')).toContainText('BEST');
});

test('Ride summary card terbentuk setelah END RIDE', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), undefined, { timeout: 15000 });
  await page.evaluate(() =>
    window.openRideCard({
      vehicleId: '', name: 'Ride QA', start: Date.now(), end: Date.now(),
      distKm: 12.3, movingSec: 1830, avgKmh: 24.6, maxKmh: 98.4,
      gainM: 120, vibMax: 3, points: [],
    })
  );
  await expect(page.locator('#modal-ridecard')).toBeVisible();
  const alpha = await page.evaluate(() => {
    const c = document.getElementById('rc-canvas') as HTMLCanvasElement;
    return c.getContext('2d')!.getImageData(60, 240, 1, 1).data[3];
  });
  expect(alpha).toBe(255); // kartu benar-benar tergambar
});

test('Background 3D: hidup di speedo, ikut tema, tak mengganggu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), undefined, { timeout: 15000 });
  await page.evaluate(() => window.switchView('dashboard'));
  await page.waitForTimeout(600);
  const canvas3d = page.locator('#ride-3d-canvas');
  await expect(canvas3d).toBeVisible();
  await page.waitForFunction(() => Number(document.getElementById('ride-3d-canvas')?.dataset.rendered ?? 0) > 0, undefined, { timeout: 8000 });
  // Ganti livery → retint jalan (tetap terrender, diagnostik > 0)
  await page.evaluate(() => window.pickTheme('mandalika'));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.closeModal('modal-theme'));
  const rendered = await page.evaluate(() => document.getElementById('ride-3d-canvas')!.dataset.rendered);
  expect(Number(rendered)).toBeGreaterThan(0);
  // Di halaman lain scene tidak menggambar (loop idle) — layer tetap di dalam dashboard
  await page.evaluate(() => window.switchView('garage'));
  await expect(page.locator('#ride-3d-layer')).toBeHidden();
});

test('BANKING/TOOL: slot, cuaca otomatis, tab, pulih sempurna', async ({ page }) => {
  await page.addInitScript(() => {
    const g = navigator.geolocation as unknown as Record<string, (cb: (...a: unknown[]) => void) => unknown>;
    g.getCurrentPosition = (cb: (pos: { coords: { latitude: number; longitude: number } }) => void) =>
      cb({ coords: { latitude: 6.2, longitude: 106.8 } });
    g.watchPosition = () => 1;
  });
  const H = 12;
  const fc = {
    current: { temperature_2m: 27.4, weather_code: 2, wind_speed_10m: 12 },
    hourly: {
      time: Array.from({ length: H }, (_, i) => `2026-10-25T${String(14 + i).padStart(2, '0')}:00`),
      temperature_2m: Array.from({ length: H }, () => 28),
      weather_code: Array.from({ length: H }, () => 1),
      precipitation_probability: Array.from({ length: H }, (_, i) => (i === 2 ? 70 : 5)),
    },
  };
  await page.route('**/api.open-meteo.com/v1/forecast*', r => r.fulfill({ json: fc }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => !document.getElementById('splash'), undefined, { timeout: 15000 });
  await page.evaluate(() => window.switchView('dashboard'));
  await page.waitForTimeout(400);
  await page.locator('#mode-navi').click();
  await expect(page.locator('#panel-speed.bank-embed')).toBeAttached();
  await expect(page.locator('#speedo-container')).toBeHidden();
  await expect(page.locator('#banking-mode')).toBeVisible();
  // TOOLKIT: 4 tab & cuaca otomatis ter-paint dari GPS
  await expect(page.locator('.kit-tab')).toHaveCount(4);
  await expect(page.locator('#cw-temp')).toHaveText(/^27°|—/);
  await expect(page.locator('#cw-hours .cw-hour')).toHaveCount(12);
  await expect(page.locator('#cw-warn')).toContainText('Hujan');
  // tab lain: RUTE visible, knob inputs ada
  await page.locator('.kit-tab[data-tab="planner"]').click();
  await expect(page.locator('#kit-planner')).toBeVisible();
  await expect(page.locator('#kp-to')).toBeVisible();
  await expect(page.locator('#kit-cuaca')).toBeHidden();
  // BBM tanpa kendaraan: banner + form tersembunyi (bukan error saat submit)
  await page.locator('.kit-tab[data-tab="bbm"]').click();
  await expect(page.locator('#kb-list')).toContainText('Pilih kendaraan di GARASI');
  await expect(page.locator('#kb-form')).toBeHidden();
  // NAVI MINI: chip sense tampil, slot pulang ke homenya
  await page.locator('#mode-navi-mini').click();
  await expect(page.locator('#sense-chip')).toBeVisible();
  await expect(page.locator('#banking-mode')).toBeHidden();
  await expect(page.locator('#panel-speed.navi-embed')).toBeAttached();
  // balik ke SPEEDO: dial utuh kembali & panel pulang ke cluster
  await page.locator('#mode-speedo').click();
  await expect(page.locator('#speedo-container')).toBeVisible();
  await expect(page.locator('#banking-mode')).toBeHidden(); // blok tidak bocor di bawah
  expect(await page.evaluate(() => document.getElementById('banking-mode')?.parentElement?.id))
    .toBe('view-dashboard');
  expect(await page.evaluate(() => document.getElementById('panel-lean')?.parentElement?.id))
    .toBe('instrument-cluster');
  await expect(page.locator('#bcr-mini-instruments')).toBeVisible();
});
