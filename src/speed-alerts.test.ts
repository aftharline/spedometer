import { describe, expect, it } from 'vitest';
import { alertStart, nextAlert } from './speed-alerts';

const feed = (kmhs: number[], s = alertStart()) => {
  let ev;
  for (const c of kmhs) ev = nextAlert(s, c);
  return ev;
};

describe('speed alerts', () => {
  it('getar tiap tier +10 dimulai 20 km/h', () => {
    expect(nextAlert(alertStart(), 10).vibrate).toBe(false);
    expect(nextAlert(alertStart(), 25).vibrate).toBe(true);
    expect(nextAlert(alertStart(), 34).vibrate).toBe(true); // 0→3 tier
  });

  it('tidak spam getar di dalam tier yang sama', () => {
    const a = nextAlert(alertStart(), 25);
    expect(nextAlert(a.next, 27).vibrate).toBe(false);
  });

  it('80 km/h → bunyi tunggal, repeat tidak bunyi ulang', () => {
    const a = nextAlert(alertStart(), 82);
    expect(a.beep).toBe('hot');
    expect(nextAlert(a.next, 84).beep).toBe('none');
  });

  it('re-arm beep 80 setelah turun di bawah 75', () => {
    const a = nextAlert(alertStart(), 82);
    const b = nextAlert(a.next, 60);
    expect(b.beep).toBe('none');
    expect(nextAlert(b.next, 80).beep).toBe('hot');
  });

  it('≥90 pola alarm dan menutupi beep hot', () => {
    const a = nextAlert(alertStart(), 95);
    expect(a.beep).toBe('alarm');
    expect(a.next.hotDone).toBe(true);
  });

  it('jump 0→110: alarm muncul tanpa double beep', () => {
    const a = feed([110]);
    expect(a?.beep).toBe('alarm');
  });

  it('turun lalu naik lagi menembak ulang alarm tier baru', () => {
    const a = nextAlert(alertStart(), 95);
    const b = nextAlert(a.next, 20);
    expect(b.beep).toBe('none');
    const c = nextAlert(b.next, 90);
    expect(c.beep).toBe('alarm');
  });
});
