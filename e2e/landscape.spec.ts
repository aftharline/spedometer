import { expect, test } from '@playwright/test';

/* Boot menutup view dengan splash ~2.9s lalu switchView('garage'); tunggu sampai tuntas. */
const bootDone = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.waitForFunction(() => !document.getElementById('splash'), undefined, { timeout: 15000 });
  await page.waitForTimeout(400);
};

const routeMocks = (page: import('@playwright/test').Page) => {
  void page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ display_name: 'Monumen Nasional, Jakarta Pusat', lat: '-6.1754', lon: '106.8272' }]),
    }),
  );
  void page.route('**/router.project-osrm.org/**', route =>
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
};

test('Landscape dasbor: speedo full-height, dash-bottom di kolom tengah, CAM+RST pindah', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('#view-garage')).toBeVisible();
  await bootDone(page);
  await page.evaluate(() => (window as any).switchView('dashboard'));
  await expect(page.locator('#view-dashboard')).toBeVisible();
  await page.waitForTimeout(300);

  await expect(page.locator('#ls-right')).toBeVisible();
  await expect(page.locator('#instrument-cluster.ls-split')).toBeAttached();

  const rects = await page.evaluate(() => {
    const r = (c: string) => {
      const el = document.querySelector(c);
      return (el as HTMLElement).getBoundingClientRect();
    };
    return {
      speed: r('#panel-speed'),
      gforce: r('#panel-gforce'),
      bottom: r('#dash-bottom'),
      gfSvg: r('#gf-svg'),
      camParent: document.querySelector('#btn-livecam')?.parentElement?.id,
      rstParent: document.querySelector('#btn-rst-max')?.parentElement?.id,
      bottomParentId: document.querySelector('#dash-bottom')?.parentElement?.id,
      midParentId: document.querySelector('#panel-gforce')?.parentElement?.id,
    };
  });
  expect(rects.bottomParentId).toBe('ls-right');
  expect(rects.midParentId).toBe('ls-mid');
  expect(rects.camParent).toBe('dash-bottom');
  expect(rects.rstParent).toBe('dash-bottom');
  // dash-bottom berakhir mulai di batas kiri kolom tengah
  expect(rects.bottom.x).toBeGreaterThanOrEqual(rects.gforce.x - 2);
  // panel speedo memanjang sampai dasar (sempurna tinggi cluster)
  expect(rects.speed.y + rects.speed.height).toBeGreaterThan(rects.bottom.y + rects.bottom.height - 4);
  // G-FORCE tetap tergambar
  expect(rects.gfSvg.height).toBeGreaterThan(60);
});

test('Landscape NAVI MINI: tombol MULAI terlihat dalam viewport', async ({ page }) => {
  routeMocks(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('#view-garage')).toBeVisible();
  await bootDone(page);
  await page.evaluate(() => (window as any).switchView('dashboard'));
  await page.locator('#mode-navi-mini').click();
  await expect(page.locator('#navi-mode.navi-embedded')).toBeVisible();
  await expect(page.locator('#instrument-cluster')).toBeVisible();
  await page.waitForTimeout(600);

  await page.locator('#navi-q').fill('Monas');
  await page.locator('.navi-result').first().click();
  await expect(page.locator('#navi-preview')).toContainText('4,0 km');
  await page.locator('#navi-map .leaflet-overlay-pane path').first().waitFor();

  const mulai = page.locator('#navi-actions button', { hasText: 'MULAI' });
  await mulai.scrollIntoViewIfNeeded();
  await expect(mulai).toBeVisible();
  const box = await mulai.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(720 + 2);
  // dash-bottom tetap tampil (bukan tersembunyi dalam cluster) saat NAVI landscape
  await expect(page.locator('#dash-bottom')).toBeVisible();
});

test('BCR Settings: sembunyikan placeholder, semua tombol berfungsi', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#view-garage')).toBeVisible();
  await bootDone(page);

  await page.locator('#btn-settings').click();
  await expect(page.locator('#modal-settings')).toBeVisible();
  await expect(page.locator('#settings-list .set-row')).toHaveCount(11);

  await page.locator('#set-dot-master').waitFor();
  await expect(page.locator('#set-dot-master')).not.toHaveClass(/on/);
  await expect(page.locator('#set-trip')).toContainText('km');

  await page.locator('#settings-list .set-row', { hasText: 'TRIP COUNTER' }).click();
  await expect(page.locator('#toast')).toContainText('Trip counter direset');

  await page.locator('#modal-settings .set-row', { hasText: 'ROTASI LAYAR' }).click();
  await expect(page.locator('#set-rot')).toContainText('Portrait terkunci');
});
