import { describe, expect, it } from 'vitest';
import {
  elevGainFrom,
  firstRainIdx,
  fuelAvgKml,
  fuelCostPer10,
  fuelSisaKm,
  lastFuelLiter,
  litersFor,
  pickArrivalIdx,
  pricePerLiter,
  serviceRows,
  svcRowOf,
  warnMsg,
  wmoInfo,
} from './kit';
import type { LogEntry } from './types';

const L = (odo: number, liter = 0, cost = 0, parts?: string): LogEntry => ({
  vehicleId: 'v1',
  logType: parts ? 'service' : 'fuel',
  date: '2026-01-01',
  odo,
  liter: parts ? undefined : liter,
  cost,
  ...(parts ? { parts } : {}),
});

describe('wmoInfo', () => {
  it('petakan kode ikon & wet', () => {
    expect(wmoInfo(0)).toMatchObject({ icon: 'fa-sun', wet: false });
    expect(wmoInfo(2)).toMatchObject({ icon: 'fa-cloud-sun', wet: false });
    expect(wmoInfo(61)).toMatchObject({ label: 'Hujan', wet: true });
    expect(wmoInfo(95)).toMatchObject({ label: 'Badai', wet: true });
    expect(wmoInfo(99).wet).toBe(true);
  });
});

describe('firstRainIdx', () => {
  it('deteksi pp>=60 atau kode hujan, else -1', () => {
    expect(firstRainIdx([10, 20, 70], [1, 2, 1])).toBe(2);
    expect(firstRainIdx([10, 10, 10], [2, 61, 2])).toBe(1);
    expect(firstRainIdx([10, 59, 10], [2, 3, 2])).toBe(-1);
  });
});

describe('fuel', () => {
  it('kml dari pasangan Δodo>=20', () => {
    expect(fuelAvgKml([L(1000, 3, 0), L(1200, 2, 0)])).toBe(100);
    expect(fuelAvgKml([L(1000, 3, 0), L(1010, 2, 0)])).toBeNull(); // Δ10 di-skip
  });
  it('sisa, cost/10km, liter akhir, harga/liter', () => {
    expect(fuelSisaKm(5, 40)).toBe(200);
    expect(fuelSisaKm(5, null)).toBe(175); // default 35
    expect(lastFuelLiter([L(0, 0, 0), L(900, 3.5, 30000)])).toBe(3.5);
    expect(pricePerLiter([L(900, 2, 20000)])).toBe(10000);
    expect(fuelCostPer10([L(100, 2, 20000), L(600, 2, 20000)])).toBe(800); // 80/km → 800/10km
  });
  it('data kurang → null', () => {
    expect(fuelAvgKml([])).toBeNull();
    expect(pricePerLiter([L(100, 2, 0)])).toBeNull();
    expect(fuelCostPer10([L(0, 2, 20000)])).toBeNull();
  });
});

describe('serviceRows', () => {
  it('km sejak per bagian + warn >=90%', () => {
    const rows = serviceRows(
      [L(0, 0, 0, 'oli mesin'), L(0, 0, 0, 'kampas + rantai')],
      10200,
    );
    const oil = rows.find(r => r.name === 'oli mesin')!;
    expect(oil.sinceKm).toBe(10200);
    expect(oil.warn).toBe(true);
    const chain = rows.find(r => r.name === 'rantai')!;
    expect(chain.sinceKm).toBe(10200);
    const ban = rows.find(r => r.name === 'ban')!;
    expect(ban.sinceKm).toBeNull();
  });
  it('svcRowOf tanpa riwayat', () => {
    expect(svcRowOf('ban', null, 1000, 8000)).toMatchObject({ sinceKm: null, pct: 0 });
  });
  it('parts "bantalan mesin" BUKAN servis ban (kata utuh)', () => {
    const rows = serviceRows(
      [L(0, 0, 0, 'bantalan mesin baru'), L(0, 0, 0, 'servis kampas rem')],
      5000,
    );
    const ban = rows.find(r => r.name === 'ban')!;
    expect(ban.sinceKm).toBeNull(); // tidak salah cocok dengan 'bantalan'
    const oil = rows.find(r => r.name === 'oli mesin')!;
    expect(oil.sinceKm).toBeNull();
  });
  it('parts "servis ban & rantai" membaca dua bucket', () => {
    const rows = serviceRows([L(0, 0, 0, 'ganti ban belakang & rantai')], 5000);
    expect(rows.find(r => r.name === 'ban')!.sinceKm).toBe(5000);
    expect(rows.find(r => r.name === 'rantai')!.sinceKm).toBe(5000);
  });
});

describe('pickArrivalIdx', () => {
  const now = new Date('2026-01-01T12:00:00');
  const times = ['2026-01-01T10:00', '2026-01-01T11:00', '2026-01-01T12:00', '2026-01-01T13:00', '2026-01-01T14:00'];
  it('jam terdekat dgn ETA (toleransi 10 menit)', () => {
    expect(pickArrivalIdx(times, now.getTime(), 3600)).toBe(3); // tiba 13:10
    expect(pickArrivalIdx(times, now.getTime(), 300)).toBe(2); // 12:10
  });
});

describe('warnMsg', () => {
  const h = (t: string, pp: number) => ({ t, pp });
  const hours = [
    h('2026-10-25T14:00', 5), h('2026-10-25T15:00', 5), h('2026-10-25T16:00', 70), h('2026-10-25T17:00', 10),
    h('2026-10-25T18:00', 10), h('2026-10-25T19:00', 65),
  ];
  it('hujan ≤3 jam → hot, ajak kejar', () => {
    const m = warnMsg(hours, 2);
    expect(m.hot).toBe(true);
    expect(m.html).toContain('16:00');
    expect(m.html).toContain('kejar');
  });
  it('hujan >3 jam → bukan hot, "aman sebelum itu"', () => {
    const m = warnMsg(hours, 5);
    expect(m.hot).toBe(false);
    expect(m.html).toContain('19:00');
    expect(m.html).toContain('aman sebelum itu');
  });
  it('tanpa hujan → clear', () => {
    expect(warnMsg(hours, -1).html).toContain('tidak ada hujan');
  });
});

describe('elevGainFrom & litersFor', () => {
  it('jumlah naik ≥1m', () => {
    expect(elevGainFrom([10, 12, 11, 20])).toBe(11);
    expect(elevGainFrom([5, 5, 5])).toBe(0);
  });
  it('liter pakai kml atau default 35', () => {
    expect(litersFor(140, 40)).toBe(3.5);
    expect(litersFor(70, null)).toBe(2);
  });
});
