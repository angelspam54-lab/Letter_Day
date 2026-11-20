import { store } from './storage';

// Tiny synthesized sound effects (no audio files to download) + haptics.
let ctx: AudioContext | null = null;
let muted = store.get('ld.muted') === '1';

export const isMuted = () => muted;
export function setMuted(m: boolean) { muted = m; store.set('ld.muted', m ? '1' : '0'); }

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

export const fx = {
  tap() { tone(660, 0, 0.06, 'triangle', 0.08); buzz(8); },
  correct() { tone(660, 0, 0.12, 'triangle'); tone(990, 0.09, 0.2, 'triangle'); buzz(30); },
  wrong() { tone(180, 0, 0.25, 'sawtooth', 0.08); buzz([60, 40, 60]); },
  tick() { tone(1200, 0, 0.03, 'square', 0.04); },
  go() { tone(523, 0, 0.1); tone(784, 0.1, 0.18); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.25, 'triangle', 0.12)); buzz([40, 60, 40, 60, 80]); },
};
