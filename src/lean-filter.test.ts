import { describe, expect, it } from 'vitest';
import { LeanFilter, LEAN_CFG, median, tiltFromGravity } from './lean-filter';

/* Sintetis per frame @50 Hz (dt 0,02 s) */
const run = (tilts: number[], shake = false): number => {
  const f = new LeanFilter();
  let out = 0;
  tilts.forEach(t => {
    out = f.push(t, 0.02, shake);
  });
  return out;
};

describe('lean filter', () => {
  it('median helper & tilt portrait 90° phone-flat = 0°', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(tiltFromGravity({ x: 0, y: 0, z: 1 }, 0)).toBeCloseTo(0);
    expect(tiltFromGravity({ x: 1, y: 0, z: 0 }, 0)).toBeCloseTo(90);
    expect(tiltFromGravity({ x: 0, y: 0.7, z: 0.7 }, 90)).toBeCloseTo(45);
  });

  it('motor lurus + wobble ±1,2° → jarum ~0', () => {
    const wobble = Array.from({ length: 60 }, (_, i) => 1.2 * Math.sin(i * 0.9));
    const out = run(wobble);
    expect(Math.abs(out)).toBeLessThan(1);
  });

  it('steady 30° tercapai & stabil', () => {
    const out = run(Array(80).fill(30));
    expect(out).toBeGreaterThan(28);
    expect(out).toBeLessThan(32);
  });

  it('lonjakan satu frame +25° ditolak median (balik < 3°)', () => {
    const seq = Array(40).fill(1);
    seq[20] = 25; // lubang jalan
    const out = run(seq);
    expect(Math.abs(out)).toBeLessThan(3);
  });

  it('slew cap: lompatan 60° berjalan bertahap', () => {
    const f = new LeanFilter();
    run(Array(20).fill(0));
    let first = 0;
    for (let i = 0; i < 5; i++) first = f.push(60, 0.02, false);
    expect(first).toBeLessThan(7); // 20 frame × 55×0,02 = hanya beberapa derajat
    const fin = run(Array(120).fill(60));
    expect(fin).toBeGreaterThan(58);
  });

  it('shake membekukan jarum, tanpa lonjakan', () => {
    const out = run(Array(30).fill(0), false);
    expect(out).toBe(0);
  });

  it('kalibrasi jendela 1,5 s: nol = tilt pemakaian, output jadi 0 di belakang', () => {
    const f = new LeanFilter();
    f.beginCalibrate(0);
    // fisik: tilt 4° + wobble 0.4° → vektor x = tan(tilt) di atas z normal
    const toG = (tiltDeg: number): { x: number; y: number; z: number } => ({
      x: Math.tan((tiltDeg * Math.PI) / 180),
      y: 0,
      z: 1,
    });
    Array.from({ length: 100 }, (_, i) => 4 + 0.4 * Math.sin(i)).forEach((tiltDeg, i) => {
      f.feed(toG(tiltDeg), 0, i * 40);
    });
    expect(f.calibratedZero).not.toBeNull();
    expect(f.calibratedZero!).toBeGreaterThan(3);
    expect(f.calibratedZero!).toBeLessThan(5);
  });

  it('regresi: pipeline HIDUP kembali setelah jendela kalibrasi selesai', () => {
    const f = new LeanFilter();
    f.beginCalibrate(0);
    const toG = (tiltDeg: number): { x: number; y: number; z: number } => ({
      x: Math.tan((tiltDeg * Math.PI) / 180),
      y: 0,
      z: 1,
    });
    // jendela 1,5 s tegak → nol tersimpan
    for (let i = 0; i < 100; i++) f.feed(toG(0), 0, i * 40);
    expect(f.calibratedZero).not.toBeNull();
    // setelah kalibrasi: miring 30° konstan → jarum HARUS bergerak lagi
    let out = 0;
    for (let i = 0; i < 150; i++) {
      const { tilt, shake } = f.feed(toG(30), 0, 2000 + i * 20);
      out = f.push(tilt, 0.02, shake);
    }
    expect(out).toBeGreaterThan(20); // beku = bug lama (calEnd tak di-null-kan)
  });

  it('setelah nol tersimpan 4°, tilt 4° → jarum ~0', () => {
    const f2 = new LeanFilter();
    f2.setSavedZero(4);
    let after = 0;
    Array(40).fill(4).forEach(t => {
      after = f2.push(t, 0.02, false);
    });
    expect(Math.abs(after)).toBeLessThan(1.5);
  });

  it('LP gravitasi meredam getaran akselerasi', () => {
    const f = new LeanFilter();
    // getar ±0.4g memancar di sekitar rata-rata nol (motor lurus)
    let last = 0;
    for (let i = 0; i < 200; i++) {
      const raw = { x: 0.4 * Math.sin(i * 1.7), y: 0, z: 1 };
      const { tilt, shake } = f.feed(raw, 0, i * 16);
      last = f.push(tilt, 0.016, shake);
    }
    expect(Math.abs(last)).toBeLessThan(2);
  });
});
