import { describe, expect, it, vi } from 'vitest';
import { pushVibrationSample, vibPeak, vibReset, type VibResult } from './vibration';

vi.stubGlobal('window', { dispatchEvent: () => {} });
vi.stubGlobal('document', { getElementById: () => null, querySelectorAll: () => [] });

/* Engine input is in g-units; ampMs2 is converted. Returns last emitted result. */
const synth = (hz: number, ampMs2: number, durSec = 4, fs = 60): VibResult | null => {
  let last: VibResult | null = null;
  for (let i = 0; i < durSec * fs; i++) {
    const t = (i / fs) * 1000;
    const a = (Math.sin((2 * Math.PI * hz * i) / fs) * ampMs2) / 9.81;
    const r = pushVibrationSample(a, 0, 1, t);
    if (r) last = r;
  }
  return last;
};

describe('vibration diagnostic', () => {
  it('classifies 12 Hz into the wheel/bearing band', () => {
    vibReset();
    const r = synth(12, 2.2);
    expect(r?.band).toBe('roda / ban / bearing');
    expect(r?.idx).toBeGreaterThan(25);
  });

  it('assigns near-zero severity to stillness', () => {
    vibReset();
    const r = synth(0.001, 0.01);
    expect(r?.idx ?? 0).toBeLessThanOrEqual(2);
    expect(r?.level).toBe('ok');
  });

  it('severity rises with amplitude', () => {
    vibReset();
    const a = synth(10, 0.4)?.idx ?? 0;
    vibReset();
    const b = synth(10, 1.6)?.idx ?? 0;
    expect(b).toBeGreaterThan(a);
  });

  it('tracks peak across windows', () => {
    vibReset();
    synth(10, 0.8);
    expect(vibPeak()).toBeGreaterThan(0);
  });
});
