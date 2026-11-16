// Procedural sound for FOUNDRY LINE: every effect is synthesised with the
// Web Audio API, so the game ships no audio files. The context is created on
// the first user gesture; before that every call is a safe no-op.

let ctx = null;
let master = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return true;
  } catch {
    return false;
  }
}

function noiseBuffer(duration) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function burst({ freq = 1000, dur = 0.1, type = 'square', gain = 0.3, slideTo = null, noise = false }) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  g.connect(master);
  if (noise) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    src.connect(f); f.connect(g);
    src.start(t); src.stop(t + dur);
  } else {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    o.connect(g);
    o.start(t); o.stop(t + dur);
  }
}

const SHOT_TONE = {
  p2000: { freq: 900, dur: 0.09, gain: 0.32 },
  mp5: { freq: 1200, dur: 0.07, gain: 0.26 },
  vk47: { freq: 700, dur: 0.11, gain: 0.4 },
  longbow: { freq: 420, dur: 0.22, gain: 0.5 },
  breacher: { freq: 500, dur: 0.16, gain: 0.45 },
};

export function playShot(weapon, distance) {
  if (!ctx) return;
  const tone = SHOT_TONE[weapon] || SHOT_TONE.vk47;
  const atten = distance == null ? 1 : Math.max(0.08, 1 - distance / 70);
  burst({ freq: tone.freq, dur: tone.dur, gain: tone.gain * atten, slideTo: tone.freq * 0.4, noise: true });
  burst({ freq: 160, dur: 0.08, type: 'sine', gain: 0.25 * atten, slideTo: 60 });
}

export function playHit(head) {
  burst({ freq: head ? 2400 : 1800, dur: 0.05, type: 'sine', gain: 0.22 });
}

export function playDry() {
  burst({ freq: 1400, dur: 0.03, type: 'square', gain: 0.12 });
}

export function playReload() {
  burst({ freq: 600, dur: 0.04, type: 'square', gain: 0.12 });
  setTimeout(() => burst({ freq: 900, dur: 0.04, type: 'square', gain: 0.12 }), 260);
  setTimeout(() => burst({ freq: 500, dur: 0.05, type: 'square', gain: 0.14 }), 520);
}

export function playExplosion(big) {
  if (!ctx) return;
  burst({ freq: 900, dur: big ? 1.1 : 0.6, gain: big ? 0.8 : 0.55, noise: true });
  burst({ freq: 90, dur: big ? 1.0 : 0.5, type: 'sine', gain: 0.6, slideTo: 30 });
}

export function playBeep() {
  burst({ freq: 1200, dur: 0.07, type: 'sine', gain: 0.18 });
}

export function playBuy() {
  burst({ freq: 880, dur: 0.06, type: 'sine', gain: 0.16 });
  setTimeout(() => burst({ freq: 1320, dur: 0.08, type: 'sine', gain: 0.16 }), 70);
}

export function playRoundEnd(won) {
  const notes = won ? [523, 659, 784] : [392, 330, 262];
  notes.forEach((f, i) => setTimeout(() => burst({ freq: f, dur: 0.22, type: 'triangle', gain: 0.2 }), i * 140));
}

export function playPlant() {
  burst({ freq: 1000, dur: 0.1, type: 'sine', gain: 0.2 });
  setTimeout(() => burst({ freq: 1000, dur: 0.1, type: 'sine', gain: 0.2 }), 160);
}
