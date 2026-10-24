import { describe, expect, it, vi } from 'vitest';
import {
  bearingOfSegment,
  courseAhead,
  cumulativeNodeOffsets,
  distToSegmentM,
  etaClockStr,
  formatDist,
  formatEta,
  loadFavs,
  maneuverIcon,
  maneuverLabel,
  nearestStepIndex,
  remainingDist,
  remainingDurSec,
  saveFav,
  smoothAngle,
  snapToRoute,
  type LatLng,
  type NaviStep,
} from './navi-math';

describe('maneuverIcon', () => {
  it.each([
    ['turn', 'left', 'fa-turn-up fa-flip-horizontal'],
    ['turn', 'right', 'fa-turn-up'],
    ['new name', 'straight', 'fa-arrow-up'],
    ['arrive', undefined, 'fa-location-dot'],
    ['roundabout', undefined, 'fa-rotate-right'],
    ['uturn-fallback', 'uturn', 'fa-rotate-left'],
  ])('maps %s/%s to %s', (type, modifier, expected) => {
    expect(maneuverIcon(type, modifier)).toBe(expected);
  });
});

describe('maneuverLabel', () => {
  it('speaks Indonesian', () => {
    expect(maneuverLabel('turn', 'right')).toBe('Belok kanan');
    expect(maneuverLabel('arrive')).toBe('Tiba di tujuan');
    expect(maneuverLabel('turn', 'uturn')).toBe('Putar balik');
  });
});

describe('formatDist', () => {
  it('rounds meters to tens', () => {
    expect(formatDist(844)).toBe('840 m');
  });
  it('formats km with Indonesian decimal', () => {
    expect(formatDist(12400)).toBe('12 km');
    expect(formatDist(8400)).toBe('8,4 km');
  });
});

describe('formatEta', () => {
  it('shows minutes under an hour', () => {
    expect(formatEta(1500)).toBe('25 mnt');
  });
  it('shows hours + minutes', () => {
    expect(formatEta(5400)).toBe('1 j 30 mnt');
  });
});

describe('distToSegmentM', () => {
  const a: LatLng = { lat: 0, lng: 0 };
  const b: LatLng = { lat: 0, lng: 0.001 };

  it('measures perpendicular distance', () => {
    const mid: LatLng = { lat: 0.0002, lng: 0.0005 };
    const d = distToSegmentM(mid, a, b);
    expect(d).toBeGreaterThan(15);
    expect(d).toBeLessThan(30);
  });

  it('clamps to nearest endpoint', () => {
    const far: LatLng = { lat: 0, lng: 0.005 };
    const d = distToSegmentM(far, a, b);
    expect(d).toBeGreaterThan(440);
    expect(d).toBeLessThan(450);
  });
});

describe('snapToRoute', () => {
  const poly: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0, lng: 0.002 },
  ];

  it('snaps to closest segment with fraction', () => {
    const sn = snapToRoute({ lat: 0, lng: 0.0015 }, poly);
    expect(sn.idx).toBe(2);
    expect(sn.frac).toBeCloseTo(0.5);
    expect(sn.distM).toBeLessThan(1);
  });

  it('reports distance when off the line', () => {
    const sn = snapToRoute({ lat: 0.001, lng: 0.001 }, poly);
    expect(sn.distM).toBeGreaterThan(50);
  });
});

describe('nearestStepIndex', () => {
  const poly: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0, lng: 0.002 },
    { lat: 0, lng: 0.003 },
  ];
  const steps: NaviStep[] = [
    { dist: 100, dur: 10, name: 'Jl. A', type: 'turn', modifier: 'right', location: { lat: 0, lng: 0.001 } },
    { dist: 100, dur: 10, name: 'Jl. B', type: 'turn', modifier: 'left', location: { lat: 0, lng: 0.002 } },
  ];

  it('returns the active step for the snapped position', () => {
    expect(nearestStepIndex(poly, steps, 0)).toBe(0);
    expect(nearestStepIndex(poly, steps, 2)).toBe(0);
    expect(nearestStepIndex(poly, steps, 3)).toBe(1);
  });
});

describe('remainingDist', () => {
  const poly: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0, lng: 0.002 },
  ];

  it('decreases as navigation progresses', () => {
    const start = remainingDist(poly, 0, 0);
    const mid = remainingDist(poly, 1, 0.5);
    const end = remainingDist(poly, 2, 1);
    expect(start).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(end);
    expect(end).toBeLessThan(10);
  });
});

describe('favorites', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    clear: () => store.clear(),
  });

  it('stores max 5, most recent first, no duplicates by name', () => {
    store.clear();
    for (let i = 0; i < 7; i++) {
      saveFav({ name: 'Tempat ' + i, lat: i, lng: i });
    }
    saveFav({ name: 'Tempat 6', lat: 99, lng: 99 });
    const favs = loadFavs();
    expect(favs.length).toBe(5);
    expect(favs[0].name).toBe('Tempat 6');
    expect(favs[0].lat).toBe(99);
    expect(favs.map(f => f.name)).not.toContain('Tempat 0');
    store.clear();
  });
});

describe('live ETA helpers', () => {
  const steps: NaviStep[] = [
    { dist: 1000, dur: 60, name: 'A', type: 'depart', location: { lat: 0, lng: 0 } },
    { dist: 2000, dur: 120, name: 'B', type: 'turn', modifier: 'right', location: { lat: 0.01, lng: 0.01 } },
    { dist: 500, dur: 30, name: 'C', type: 'arrive', location: { lat: 0.02, lng: 0.02 } },
  ];

  it('sums full durations after current step + fraction of current', () => {
    expect(remainingDurSec(steps, 0, 1000)).toBe(60 + 120 + 30);
    expect(remainingDurSec(steps, 0, 0)).toBe(120 + 30);
    expect(remainingDurSec(steps, 1, 500)).toBe(120 / 4 + 30);
    expect(remainingDurSec(steps, 2, 100)).toBeCloseTo(30 * 0.2);
    expect(remainingDurSec(steps, 2, 900)).toBe(30); // clamp overshoot
    expect(remainingDurSec([], 0, 0)).toBe(0);
  });

  it('formats arrival clock HH:MM, never negative', () => {
    const base = new Date('2026-03-05T10:00:00').getTime();
    expect(etaClockStr(900, base)).toBe('10:15');
    expect(etaClockStr(-5, base)).toBe('10:00');
  });
});

describe('course-up helpers', () => {
  it('bearingOfSegment: timur 90°, utara 0°, barat 270°', () => {
    const o = { lat: -7.25, lng: 112.75 };
    expect(Math.round(bearingOfSegment(o, { lat: o.lat, lng: o.lng + 0.01 }))).toBe(90);
    expect(Math.round(bearingOfSegment(o, { lat: o.lat + 0.01, lng: o.lng }))).toBe(0);
    expect(Math.round(bearingOfSegment(o, { lat: o.lat, lng: o.lng - 0.01 }))).toBe(270);
  });

  it('courseAhead memakai segmen berikutnya saat hampir selesai', () => {
    const poly = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
    ];
    const east = courseAhead(poly, 1, 0.5);
    const north = courseAhead(poly, 1, 0.99);
    expect(Math.round(east!)).toBe(90);
    expect(Math.round(north!)).toBe(0);
    expect(courseAhead([], 0, 0)).toBeNull();
  });

  it('smoothAngle tidak melompat 359→0, dan k=0 diam', () => {
    expect(smoothAngle(350, 350, 0.4)).toBeCloseTo(350 % 360, 5);
    expect(smoothAngle(350, 10, 0).toFixed(3)).toBe('350.000');
    expect(smoothAngle(350, 10, 1).toFixed(3)).toBe('10.000');
  });

  it('cumulativeNodeOffsets menggeser 1 node guru persimpangan', () => {
    expect(cumulativeNodeOffsets([5, 4, 3])).toEqual([0, 4, 7]);
  });
});
