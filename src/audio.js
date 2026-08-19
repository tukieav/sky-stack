// Sky Stack — procedural audio via WebAudio (no audio files)
let ctx = null;
let masterGain = null;
let muted = false;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (masterGain) masterGain.gain.value = m ? 0 : 0.5;
}

export function unlockAudio() { ensureCtx(); }

function tone(freq, dur, type, vol, delay = 0) {
  if (muted || !ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g); g.connect(masterGain);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

// Block placed with a cut — dull thunk + slice
export function cutSound(level) {
  ensureCtx();
  const base = 180 + (level % 24) * 6;
  tone(base, 0.12, 'sine', 0.3);
  tone(base * 2.2, 0.07, 'square', 0.08, 0.01);
}

// Perfect placement — bright chime, pitch rises with combo
export function perfectSound(combo) {
  ensureCtx();
  const base = 440 * Math.pow(1.12, Math.min(combo, 12));
  tone(base, 0.22, 'sine', 0.32);
  tone(base * 1.5, 0.18, 'triangle', 0.22, 0.03);
  tone(base * 2, 0.14, 'sine', 0.12, 0.06);
}

// Block grows back after perfect streak
export function growSound() {
  ensureCtx();
  [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.2, i * 0.05));
}

export function gameOverSound() {
  ensureCtx();
  [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.15, i * 0.15));
}

export function clickSound() {
  ensureCtx();
  tone(660, 0.06, 'sine', 0.12);
}
