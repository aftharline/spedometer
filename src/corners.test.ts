import { describe, expect, it } from 'vitest';
import { cornerPush, cornerReset, cornerStat } from './corners';

/* sintetis: push setiap 100 ms */
const seq = (leans: number[], kmh = 40): void => {
  leans.forEach((l, i) => cornerPush(l, kmh, -7.25, 112.75, i * 100));
};

describe('corner tracker', () => {
  it('motor lurus panjang = 0 tikungan', () => {
    cornerReset();
    seq(Array(40).fill(0.5));
    expect(cornerStat().count).toBe(0);
  });

  it('tikungan kanan 30° 1 detik + lurus = 1 tikungan leanMAX 30', () => {
    cornerReset();
    seq(Array(15).fill(30)); // 1,5 s belok kanan
    seq(Array(25).fill(2)); // 2,5 s lurus → tutup
    const s = cornerStat();
    expect(s.count).toBe(1);
    expect(s.last!.dir).toBe('R');
    expect(s.last!.maxLean).toBe(30);
    expect(s.last!.lat).toBe(-7.25);
  });

  it('lean 13° hanya 0,3 detik lalu lurus → tidak masuk (hysteresis keluar)', () => {
    cornerReset();
    seq([13, 13, 13, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(cornerStat().count).toBe(0);
  });

  it('S-bend: L lalu R → 2 tikungan', () => {
    cornerReset();
    seq(Array(15).fill(-25));
    seq(Array(25).fill(25));
    seq(Array(25).fill(0));
    const s = cornerStat();
    expect(s.count).toBe(2);
    expect(s.last!.dir).toBe('R');
  });

  it('lean 8-11° (zona hysteresis) tak mereset jendela lama & tak masuk', () => {
    cornerReset();
    seq(Array(15).fill(30)); // tikungan dibuka
    seq(Array(5).fill(9)); // 0,5 s di zona tengah → jendela tetap hidup
    seq(Array(10).fill(28)); // balik belok → satu tikungan berlanjut
    seq(Array(25).fill(1)); // lurus → tutup
    expect(cornerStat().count).toBe(1);
    expect(cornerStat().last!.maxLean).toBeGreaterThanOrEqual(30);
  });

  it('bankSum terakumulasi & rekor maxLean se-ride', () => {
    cornerReset();
    seq(Array(15).fill(30));
    seq(Array(25).fill(2));
    seq(Array(15).fill(45));
    seq(Array(25).fill(1));
    const s = cornerStat();
    expect(s.count).toBe(2);
    expect(s.maxLean).toBe(45);
    expect(s.bankSum).toBeGreaterThan(20); // 1,5s×30° + 1,5s×45° ≈ 112
    expect(s.last!.maxLean).toBe(45);
  });

  it('bloke kmh maks per tikungan', () => {
    cornerReset();
    const leans = Array(15).fill(20);
    leans.forEach((l, i) => cornerPush(l, i < 5 ? 30 : 80, null, null, i * 100));
    seq(Array(25).fill(0));
    expect(cornerStat().last!.kmhMax).toBe(80);
  });
});
