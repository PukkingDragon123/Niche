/* ============================================================
   DUNGEON SWEEPER — FX
   Particles, screen shake, floating combat text, flashes.
   ============================================================ */
(function (root) {
'use strict';

let canvas, ctx2d;
let particles = [];
let running = false;

function init(canvasEl) {
  canvas = canvasEl;
  ctx2d = canvas.getContext('2d');
  resize();
  root.addEventListener('resize', resize);
  running = true;
  requestAnimationFrame(loop);
}

function resize() {
  if (!canvas) return;
  canvas.width = root.innerWidth;
  canvas.height = root.innerHeight;
}

function loop() {
  if (!running) return;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  const alive = [];
  for (const p of particles) {
    p.life -= 0.016;
    if (p.life <= 0) continue;
    p.vx *= p.drag; p.vy *= p.drag;
    p.vy += p.grav;
    p.x += p.vx; p.y += p.vy;
    p.rot += p.vrot;
    const a = Math.min(1, p.life / (p.maxLife * 0.5));
    ctx2d.save();
    ctx2d.globalAlpha = a;
    ctx2d.translate(p.x, p.y);
    ctx2d.rotate(p.rot);
    ctx2d.fillStyle = p.color;
    if (p.shape === 'rect') ctx2d.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    else if (p.shape === 'spark') {
      ctx2d.beginPath();
      ctx2d.moveTo(-p.size, 0); ctx2d.lineTo(0, -p.size / 3); ctx2d.lineTo(p.size, 0); ctx2d.lineTo(0, p.size / 3);
      ctx2d.closePath(); ctx2d.fill();
    } else {
      ctx2d.beginPath();
      ctx2d.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx2d.fill();
    }
    ctx2d.restore();
    alive.push(p);
  }
  particles = alive;
  requestAnimationFrame(loop);
}

function burst(x, y, opts) {
  opts = opts || {};
  const n = opts.count || 16;
  const colors = opts.colors || ['#f5b942', '#ff9f43', '#fff3d6'];
  for (let i = 0; i < n; i++) {
    const ang = (opts.angle != null ? opts.angle : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (opts.spread || Math.PI * 2);
    const spd = (opts.speed || 5) * (0.4 + Math.random() * 0.9);
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - (opts.up || 0),
      grav: opts.grav != null ? opts.grav : 0.25,
      drag: opts.drag || 0.96,
      size: (opts.size || 7) * (0.6 + Math.random() * 0.8),
      life: (opts.life || 0.9) * (0.6 + Math.random() * 0.7),
      maxLife: opts.life || 0.9,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: opts.shape || (Math.random() > 0.5 ? 'rect' : 'circle'),
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.4,
    });
  }
  if (particles.length > 900) particles = particles.slice(-900);
}

/* ---- element helpers ---- */
function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function burstAt(el, opts) {
  if (!el) return;
  const c = centerOf(el);
  burst(c.x, c.y, opts);
}

/* ---- floating text ---- */
function floater(el, text, cls) {
  if (!el) return;
  const c = centerOf(el);
  floaterAt(c.x, c.y, text, cls);
}
function floaterAt(x, y, text, cls) {
  const d = document.createElement('div');
  d.className = 'floater ' + (cls || '');
  d.textContent = text;
  d.style.left = (x + (Math.random() - 0.5) * 18) + 'px';
  d.style.top = y + 'px';
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1400);
}

/* ---- screen shake ---- */
let shakeTimer = null;
function shake(strength) {
  const el = document.getElementById('game');
  if (!el) return;
  el.classList.remove('shake-sm', 'shake-lg');
  void el.offsetWidth; // restart animation
  el.classList.add(strength === 'lg' ? 'shake-lg' : 'shake-sm');
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => el.classList.remove('shake-sm', 'shake-lg'), 500);
}

/* ---- fullscreen flashes ---- */
function flash(kind) {
  const el = document.getElementById('flash');
  if (!el) return;
  el.className = '';
  void el.offsetWidth;
  el.className = 'flash-' + kind;
}

const PALETTES = {
  gold:  ['#f5b942', '#ffd97a', '#fff3d6', '#e09a2f'],
  blood: ['#ff4757', '#c0263a', '#ff8a94'],
  magic: ['#b07ffa', '#7f5af0', '#e3d0ff'],
  fire:  ['#ff9f43', '#ff6b35', '#ffd166', '#fff3d6'],
  bone:  ['#e8e4d8', '#cfc9b8', '#a8a190'],
  green: ['#2ee6a8', '#7dffce', '#0f8f63'],
  cyan:  ['#3fd8ff', '#a8efff', '#1f9dc4'],
};

root.DS = root.DS || {};
root.DS.FX = { init, burst, burstAt, floater, floaterAt, shake, flash, centerOf, PALETTES };

})(typeof globalThis !== 'undefined' ? globalThis : this);
