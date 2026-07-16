/* ============================================================
   DUNGEON SWEEPER — AUDIO
   Synthesized WebAudio SFX — zero asset files needed.
   ============================================================ */
(function (root) {
'use strict';

let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (ctx) return true;
  try {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch (e) { return false; }
  return true;
}
function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

function now() { return ctx.currentTime; }

function tone(freq, dur, opts) {
  if (!ensure() || muted) return;
  resume();
  opts = opts || {};
  const t0 = now() + (opts.delay || 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.type || 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, opts.slide), t0 + dur);
  const vol = opts.vol || 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

function noise(dur, opts) {
  if (!ensure() || muted) return;
  resume();
  opts = opts || {};
  const t0 = now() + (opts.delay || 0);
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(opts.vol || 0.4, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const filt = ctx.createBiquadFilter();
  filt.type = opts.filter || 'lowpass';
  filt.frequency.value = opts.freq || 800;
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t0);
}

const SFX = {
  click()      { tone(700, 0.05, { type: 'triangle', vol: 0.25 }); },
  reveal(n)    { tone(320 + Math.min(n, 12) * 45, 0.07, { type: 'triangle', vol: 0.3 }); },
  cascade(i)   { tone(360 + i * 55, 0.06, { type: 'triangle', vol: 0.22, delay: i * 0.035 }); },
  energy()     { tone(980, 0.06, { type: 'sine', vol: 0.15 }); },
  hurt()       { noise(0.25, { vol: 0.5, freq: 400 }); tone(140, 0.22, { type: 'sawtooth', vol: 0.4, slide: 60 }); },
  bump()       { noise(0.12, { vol: 0.35, freq: 900 }); tone(220, 0.1, { type: 'square', vol: 0.3, slide: 120 }); },
  kill()       { noise(0.15, { vol: 0.3, freq: 1200, filter: 'highpass' }); tone(520, 0.14, { type: 'square', vol: 0.3, slide: 900 }); },
  card()       { noise(0.08, { vol: 0.2, freq: 2500, filter: 'highpass' }); tone(600, 0.08, { type: 'sine', vol: 0.2, slide: 900 }); },
  cardHover()  { tone(500, 0.03, { type: 'sine', vol: 0.08 }); },
  coin()       { tone(1250, 0.07, { type: 'square', vol: 0.2 }); tone(1670, 0.12, { type: 'square', vol: 0.18, delay: 0.06 }); },
  heal()       { [440, 550, 660].forEach((f, i) => tone(f, 0.12, { type: 'sine', vol: 0.2, delay: i * 0.07 })); },
  chest()      { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.25, delay: i * 0.09 })); },
  levelup()    { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.2, delay: i * 0.08 })); },
  relic()      { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.2, { type: 'sine', vol: 0.22, delay: i * 0.1 })); },
  boss()       { tone(80, 0.6, { type: 'sawtooth', vol: 0.45, slide: 55 }); noise(0.5, { vol: 0.3, freq: 300 }); },
  omen()       { tone(200, 0.3, { type: 'sine', vol: 0.2, slide: 150 }); },
  web()        { noise(0.15, { vol: 0.2, freq: 3000, filter: 'highpass' }); },
  arrow()      { noise(0.1, { vol: 0.25, freq: 4000, filter: 'highpass' }); tone(900, 0.08, { type: 'sine', vol: 0.15, slide: 300 }); },
  fireball()   { noise(0.5, { vol: 0.5, freq: 500 }); tone(160, 0.4, { type: 'sawtooth', vol: 0.3, slide: 40 }); },
  zap()        { tone(1400, 0.12, { type: 'sawtooth', vol: 0.25, slide: 200 }); noise(0.1, { vol: 0.25, freq: 2000, filter: 'highpass' }); },
  stairs()     { [523, 494, 440, 392].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.25, delay: i * 0.1 })); },
  death()      { [330, 277, 220, 165, 110].forEach((f, i) => tone(f, 0.35, { type: 'sawtooth', vol: 0.3, delay: i * 0.22 })); },
  victory()    { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, { type: 'square', vol: 0.25, delay: i * 0.13 })); },
  lethal()     { tone(110, 0.4, { type: 'sawtooth', vol: 0.4 }); tone(116, 0.4, { type: 'sawtooth', vol: 0.4 }); },
  buff()       { tone(180, 0.35, { type: 'sawtooth', vol: 0.25, slide: 320 }); },
};

function setMuted(m) {
  muted = m;
  try { localStorage.setItem('ds_muted', m ? '1' : '0'); } catch (e) {}
}
function init() {
  try { muted = localStorage.getItem('ds_muted') === '1'; } catch (e) {}
}

root.DS = root.DS || {};
root.DS.Audio = { SFX, setMuted, get muted() { return muted; }, init, ensure };

})(typeof globalThis !== 'undefined' ? globalThis : this);
