/* ── LEAN FILTER — anti-pualing untuk sensor lean di holder bergetar ──
   Tahap: vektor gravitasi low-pass → tilt atan2 sesuai orientasi →
   median ring (tahan lonjakan g) → dead-zone+hysteresis → slew cap.
   Freeze per-frame saat shake (|g_raw - g_LP| besar) — belokan tetap
   jalan karena gravitasi menyatu selama gema konstan.
   Murni (tanpa DOM) → unit vitest. Persistensi baseline di telemetry. */

export const LEAN_CFG = {
  gravityAlpha: 0.02,   // LP gravitasi — konvergen ~2 s @60 Hz
  medianN: 8,           // ring median sudut ≈ 130 ms @60 Hz
  deadZoneDeg: 2.5,     // |rel| < deadZone-hyst → pasti 0
  hysteresisDeg: 2,     // lonjakan < hyst tidak digerakkan
  slewDegPerSec: 55,    // batas laju jarum (belok cepat tetap ikut)
  calibrateMs: 1500,    // jendela kalibrasi (rata→median jendela)
  shakeG: 0.35,         // selisih g raw vs LP → freeze frame itu
} as const;

export interface Vec3 { x: number; y: number; z: number }

export const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((m, n) => m - n);
  return s[Math.floor((s.length - 1) / 2)];
};

/* Tilt mentah (°) dari vektor gravitasi + sudut orientasi layar —
   rumus setara leanFromAcceleration lama, tapi input sudah terfilter. */
export const tiltFromGravity = (g: Vec3, orient: number): number => {
  if (orient === 0 || orient === 180) return (Math.atan2(g.x, g.z) * 180) / Math.PI;
  const sign = orient === 270 ? -1 : 1;
  return (sign * Math.atan2(g.y, g.z) * 180) / Math.PI;
};

export class LeanFilter {
  private zero = 0;
  private gravity: Vec3 | null = null;
  private magLP: number | null = null;
  private buf: number[] = [];
  private aim = 0;
  private disp = 0;
  private calEnd: number | null = null;
  private calBuf: number[] = [];

  /* Marker hasil kalibrasi — telemetry membaca lalu menyimpan. */
  calibratedZero: number | null = null;

  reset(): void {
    this.gravity = null;
    this.magLP = null;
    this.buf = [];
    this.aim = 0;
    this.disp = 0;
    this.calEnd = null;
    this.calBuf = [];
    this.calibratedZero = null;
  }

  setSavedZero(z: number): void {
    this.zero = z;
  }

  get zeroOffset(): number {
    return this.zero;
  }

  /* Pitch (derajat) — kemiringan depan/belakang SLOPE dari vektor LP yang
     sama: ponsel ikut postur motor → ≈ kemiringan jalan naik/turun.
     Porosnya kebalikan poros tilt, mengikuti orientasi layar. */
  getPitchDeg(orient: number): number | null {
    if (!this.gravity) return null;
    const g = this.gravity;
    const deg = (n: number): number => (n * 180) / Math.PI;
    if (orient === 0 || orient === 180) return deg(Math.atan2(-g.y, Math.hypot(g.x, g.z)));
    const s = orient === 270 ? -1 : 1;
    return deg(s * Math.atan2(-g.x, Math.hypot(g.y, g.z)));
  }

  beginCalibrate(tMs: number): void {
    this.calEnd = tMs + LEAN_CFG.calibrateMs;
    this.calBuf = [];
  }

  /* Kalibrasi instan (saat bengkel diam): nol = median ring sekarang. */
  zeroNow(): void {
    if (this.buf.length >= 3) this.zero = median(this.buf);
  }

  /* Feed accel mentah (g): LP gravitasi + deteksi shake. */
  feed(raw: Vec3, orient: number, tMs: number): { tilt: number | null; shake: boolean } {
    const mag = Math.hypot(raw.x, raw.y, raw.z);
    const shake = this.magLP !== null && Math.abs(mag - this.magLP) > LEAN_CFG.shakeG;
    if (this.gravity === null) {
      this.gravity = { ...raw }; // seed: start dari sampel pertama
      this.magLP = mag;
    } else {
      const a = LEAN_CFG.gravityAlpha;
      const lerp = (p: number, q: number): number => p + (q - p) * a;
      this.gravity.x = lerp(this.gravity.x, raw.x);
      this.gravity.y = lerp(this.gravity.y, raw.y);
      this.gravity.z = lerp(this.gravity.z, raw.z);
      this.magLP = lerp(this.magLP, mag);
    }

    const tilt = tiltFromGravity(this.gravity, orient);

    if (this.calEnd !== null && this.calibratedZero === null) {
      this.calBuf.push(tilt);
      if (tMs >= this.calEnd) {
        this.zero = median(this.calBuf);
        this.calibratedZero = this.zero;
        this.calBuf = [];
        this.aim = 0;
        this.disp = 0;
      }
      return { tilt, shake };
    }
    return { tilt, shake };
  }

  /* Tahap 2–7: median → dead-zone/hysteresis → freeze shake → slew. */
  push(tilt: number | null, dtSec: number, shake: boolean): number {
    if (tilt !== null && !shake) this.buf.push(tilt);
    if (this.buf.length > LEAN_CFG.medianN) this.buf.shift();

    if (tilt === null || shake || this.calEnd !== null) return this.disp;

    if (this.buf.length >= 3) {
      const rel = median(this.buf) - this.zero;
      const abs = Math.abs(rel);
      if (abs < LEAN_CFG.deadZoneDeg - LEAN_CFG.hysteresisDeg) {
        this.aim = 0;
      } else if (this.aim === 0 && abs < LEAN_CFG.deadZoneDeg) {
        /* tetap 0 — zona tenang */
      } else if (Math.abs(rel - this.aim) > LEAN_CFG.hysteresisDeg) {
        this.aim = rel;
      }
    }

    const maxStep = LEAN_CFG.slewDegPerSec * Math.max(0, dtSec);
    const d = this.aim - this.disp;
    this.disp += Math.abs(d) > maxStep ? (d > 0 ? maxStep : -maxStep) : d;
    if (Math.abs(this.aim - this.disp) < 0.15) this.disp = this.aim;
    return this.disp;
  }
}
