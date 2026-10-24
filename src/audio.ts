import { smoothVal } from './geo';
import { rideState } from './state';
import { showToast } from './toast';
import { $opt } from './util';

const AUDIO_ON =
  'background:rgba(var(--acc-rgb),.12);border:1px solid rgba(var(--acc-rgb),.4);color:var(--gold);font-family:"Exo 2",sans-serif;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;';
const AUDIO_OFF =
  'background:var(--s2);border:1px solid var(--border2);color:var(--muted2);font-family:"Exo 2",sans-serif;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer;';

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let animReq: number | null = null;
let audioStream: MediaStream | null = null;
let rpmFiltered = 0;

export const isAudioActive = (): boolean => audioCtx !== null;

export function updateAudioBtns(active: boolean): void {
  ['btn-audio', 'btn-audio-ls'].forEach(id => {
    const b = $opt(id);
    if (!b) return;
    b.textContent = active ? 'STOP' : 'MIC ON';
    b.setAttribute('style', active ? AUDIO_ON : AUDIO_OFF);
  });
  void import('./ui').then(m => m.updateMasterBtn()).catch(() => {});
}

export async function toggleAudioRPM(): Promise<void> {
  if (audioCtx) {
    stopAudioRPM();
    return;
  }
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(audioStream).connect(analyser);
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const hzPerBin = audioCtx.sampleRate / analyser.fftSize;
    rpmFiltered = 0;
    updateAudioBtns(true);

    const draw = (): void => {
      animReq = requestAnimationFrame(draw);
      analyser!.getByteFrequencyData(buf);
      let peak = 0;
      let peakIdx = 0;
      const start = Math.max(1, Math.floor(30 / hzPerBin));
      const end = Math.min(buf.length - 1, Math.ceil(400 / hzPerBin));
      for (let i = start; i <= end; i++) {
        const weighted = buf[i] * (i / start);
        if (weighted > peak) {
          peak = weighted;
          peakIdx = i;
        }
      }
      const pct = (peak / 255) * 100;
      const peakHz = peakIdx * hzPerBin;
      const currentSpeed = rideState.speed || 0;
      const synRpm = currentSpeed < 2 ? 1200 + Math.random() * 150 : 2000 + currentSpeed * 60;
      let rawRpm = synRpm;
      if (pct > 12) {
        const acoustic = Math.min(12000, Math.max(800, peakHz * 120));
        rawRpm = acoustic * 0.35 + synRpm * 0.65;
      }
      rpmFiltered = smoothVal(rpmFiltered, rawRpm, 0.08);
      const rpm = Math.round(rpmFiltered / 10) * 10;
      const uiPct = Math.min(100, Math.max(0, (rpmFiltered / 10000) * 100));
      ['audio-visual', 'audio-visual-ls'].forEach(id => {
        const el = $opt(id);
        if (el) el.style.width = uiPct + '%';
      });
      ['rpm-val', 'rpm-val-ls'].forEach(id => {
        const el = $opt(id);
        if (el) el.textContent = String(rpm);
      });
    };
    draw();
  } catch (_) {
    showToast('Akses mikrofon ditolak', 'alert');
  }
}

export function stopAudioRPM(): void {
  if (!audioCtx) return;
  if (animReq) cancelAnimationFrame(animReq);
  if (audioStream) {
    audioStream.getTracks().forEach(t => t.stop());
    audioStream = null;
  }
  audioCtx.close();
  audioCtx = null;
  analyser = null;
  animReq = null;
  rpmFiltered = 0;
  updateAudioBtns(false);
  ['audio-visual', 'audio-visual-ls'].forEach(id => {
    const el = $opt(id);
    if (el) el.style.width = '0%';
  });
  ['rpm-val', 'rpm-val-ls'].forEach(id => {
    const el = $opt(id);
    if (el) el.textContent = '0';
  });
}
