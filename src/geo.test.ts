import { describe, expect, it } from 'vitest';
import {
  adaptiveGpsAlpha,
  bearingDeg,
  fuseSpeed,
  haversineMeters,
  headingToCompass,
  isPlausibleMove,
  medianSpeed,
  smoothVal,
} from './geo';

describe('haversineMeters', () => {
  it('measures one degree of latitude close to 111.2 km', () => {
    const d = haversineMeters({ lat: -7.25, lng: 112.75 }, { lat: -6.25, lng: 112.75 });
    expect(d).toBeGreaterThan(111000);
    expect(d).toBeLessThan(111500);
  });

  it('returns zero for the same point', () => {
    expect(haversineMeters({ lat: -7.25, lng: 112.75 }, { lat: -7.25, lng: 112.75 })).toBe(0);
  });
});

describe('bearingDeg', () => {
  it('points north', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 5);
  });

  it('points east', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 5);
  });
});

describe('headingToCompass', () => {
  it.each([
    [0, 'N'],
    [22.5, 'NNE'],
    [90, 'E'],
    [180, 'S'],
    [270, 'W'],
    [359, 'N'],
    [null, '—'],
    [Number.NaN, '—'],
  ])('maps %s to %s', (deg, expected) => {
    expect(headingToCompass(deg as number | null)).toBe(expected);
  });
});

describe('fuseSpeed', () => {
  it('trusts native GPS more with good accuracy', () => {
    expect(fuseSpeed(60, 40, 10)).toBeCloseTo(60 * 0.65 + 40 * 0.35);
  });

  it('balances sources at fair accuracy', () => {
    expect(fuseSpeed(60, 40, 30)).toBeCloseTo(50);
  });

  it('falls back to whichever source exists', () => {
    expect(fuseSpeed(42, null, 10)).toBe(42);
    expect(fuseSpeed(null, 42, 10)).toBe(42);
    expect(fuseSpeed(null, null, 10)).toBe(0);
  });
});

describe('adaptiveGpsAlpha', () => {
  it('responds faster when accuracy is better', () => {
    expect(adaptiveGpsAlpha(10)).toBeGreaterThan(adaptiveGpsAlpha(30));
    expect(adaptiveGpsAlpha(30)).toBeGreaterThan(adaptiveGpsAlpha(55));
    expect(adaptiveGpsAlpha(55)).toBeGreaterThan(adaptiveGpsAlpha(100));
  });
});

describe('isPlausibleMove', () => {
  it('rejects GPS jitter below the accuracy threshold', () => {
    expect(isPlausibleMove(1, 1, 50)).toBe(false);
  });

  it('accepts a realistic movement', () => {
    expect(isPlausibleMove(20, 1, 10)).toBe(true);
  });

  it('rejects teleport-sized movement', () => {
    expect(isPlausibleMove(500, 1, 10)).toBe(false);
  });
});

describe('medianSpeed', () => {
  it('rejects a single spike', () => {
    expect(medianSpeed([10, 11, 400])).toBe(11);
  });

  it('handles empty input', () => {
    expect(medianSpeed([])).toBe(0);
  });
});

describe('smoothVal', () => {
  it('moves toward the target', () => {
    expect(smoothVal(0, 100, 0.5)).toBe(50);
  });
});

import { elevationGain, movingTime, rideDistance, speedoDisplayKmh, splitsPerKm } from './geo';
import type { RidePoint } from './types';

const pt = (lat: number, lng: number, t: number, spd = 30, alt: number | null = null): RidePoint => ({
  lat, lng, t, spd, alt,
});

describe('rideDistance', () => {
  it('sums segments', () => {
    const d = rideDistance([pt(0, 0, 0), pt(0, 0.001, 1000), pt(0, 0.002, 2000)]);
    expect(d).toBeGreaterThan(180);
    expect(d).toBeLessThan(230);
  });

  it('is zero for empty or single point', () => {
    expect(rideDistance([])).toBe(0);
    expect(rideDistance([pt(0, 0, 0)])).toBe(0);
  });
});

describe('movingTime', () => {
  it('counts only intervals with speed above stop threshold', () => {
    const t = movingTime([pt(0, 0, 0, 0), pt(0, 0.001, 10000, 0), pt(0, 0.0011, 20000, 30)]);
    expect(t).toBe(10);
  });

  it('ignores huge gaps (app suspended)', () => {
    const t = movingTime([pt(0, 0, 0, 30), pt(0, 0.001, 300000, 30)]);
    expect(t).toBe(0);
  });
});

describe('elevationGain', () => {
  it('accumulates only climbs above threshold', () => {
    const pts = [
      pt(0, 0, 0, 30, 100),
      pt(0, 0.001, 1000, 30, 102),
      pt(0, 0.002, 2000, 30, 107),
      pt(0, 0.003, 3000, 30, 105),
      pt(0, 0.004, 4000, 30, 110),
    ];
    expect(elevationGain(pts, 3)).toBe(7 + 5);
  });

  it('returns zero when altitude missing', () => {
    expect(elevationGain([pt(0, 0, 0), pt(0, 0.001, 1000)])).toBe(0);
  });
});

describe('splitsPerKm', () => {
  it('creates one split per km travelled', () => {
    const pts: RidePoint[] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      pts.push(pt(0, (i * 0.018) / steps, i * 10000, 36));
    }
    const splits = splitsPerKm(pts);
    expect(splits.length).toBe(2);
    expect(splits[0].km).toBe(1);
    expect(splits[0].sec).toBeGreaterThan(0);
    expect(splits[0].spdKmh).toBeGreaterThan(0);
  });

  it('returns empty for short ride', () => {
    expect(splitsPerKm([pt(0, 0, 0), pt(0, 0.0003, 1000)])).toEqual([]);
  });
});

describe('speedoDisplayKmh', () => {
  it('reads 10 km/h higher than true speed, like an OEM cluster', () => {
    expect(speedoDisplayKmh(60)).toBe(70);
    expect(speedoDisplayKmh(40.8)).toBeCloseTo(50.8);
  });

  it('shows zero when stationary — offset never applies at rest', () => {
    expect(speedoDisplayKmh(0)).toBe(0);
    expect(speedoDisplayKmh(0.3)).toBe(0);
  });

  it('offset can be calibrated', () => {
    expect(speedoDisplayKmh(60, 7)).toBe(67);
  });
});
