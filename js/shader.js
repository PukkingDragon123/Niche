/* ============================================================
   DUNGEON SWEEPER — BACKGROUND SHADER
   A Balatro-style swirling paint vortex, rendered low-res on a
   WebGL quad and upscaled with pixelated sampling. Falls back
   to a CSS gradient if WebGL is unavailable.
   ============================================================ */
(function (root) {
'use strict';

const VERT = `
attribute vec2 p;
void main(){ gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uPulse;

// hash / noise
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for(int i = 0; i < 5; i++){
    v += a * noise(p);
    p = p * 2.03 + vec2(11.3, 7.7);
    a *= 0.55;
  }
  return v;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.06;

  // swirl: rotate by angle depending on radius
  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float swirl = ang + 2.6 * sin(t * 0.7) * exp(-r * 1.1) + t * 0.5 + r * 2.0;
  vec2 sp = vec2(cos(swirl), sin(swirl)) * r;

  // domain-warped fbm paint
  vec2 q = vec2(fbm(sp * 3.0 + t), fbm(sp * 3.0 - t * 0.7 + 4.2));
  float n = fbm(sp * 2.5 + q * 1.8 + t * 0.35);
  float m = fbm(sp * 4.0 - q * 1.2 - t * 0.22);

  vec3 col = mix(uColA, uColB, smoothstep(0.25, 0.75, n));
  col = mix(col, uColC, smoothstep(0.55, 0.95, m) * 0.6);

  // soft ambient light: gentle center brightening, feather-light vignette
  col += uColC * 0.10 * exp(-r * 2.5) * (1.0 + uPulse * 2.0);
  col *= 1.0 - smoothstep(0.45, 1.25, r) * 0.22;
  col *= 0.97 + 0.03 * sin(t * 3.1);

  gl_FragColor = vec4(col, 1.0);
}
`;

let gl, prog, canvas, uni = {}, raf = 0;
let target = { a: [0.93, 0.89, 0.80], b: [0.85, 0.78, 0.88], c: [0.72, 0.82, 0.70] };
let current = null;
let pulse = 0;
let running = false;

function hueToCols(hue) {
  // three tones of one hue family: abyss, mid, glow
  const h = hue / 360;
  const f = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hsl = (hh, s, l) => {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [f(p, q, hh + 1 / 3), f(p, q, hh), f(p, q, hh - 1 / 3)];
  };
  // three pastel clay tones of one hue family: cream base, mid, accent
  return {
    a: hsl(h, 0.38, 0.88),
    b: hsl((h + 0.055) % 1, 0.45, 0.76),
    c: hsl((h + 0.11) % 1, 0.50, 0.66),
  };
}

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function init(canvasEl) {
  canvas = canvasEl;
  try {
    gl = canvas.getContext('webgl', { antialias: false, depth: false, alpha: false });
    if (!gl) throw new Error('no webgl');
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link fail');
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uRes', 'uTime', 'uColA', 'uColB', 'uColC', 'uPulse'].forEach(n => uni[n] = gl.getUniformLocation(prog, n));
    resize();
    root.addEventListener('resize', resize);
    current = { a: target.a.slice(), b: target.b.slice(), c: target.c.slice() };
    running = true;
    loop(0);
  } catch (e) {
    document.body.classList.add('no-webgl');
    return false;
  }
  return true;
}

function resize() {
  if (!canvas) return;
  // render at quarter res for that chunky paint look
  canvas.width = Math.max(160, Math.floor(root.innerWidth / 4));
  canvas.height = Math.max(120, Math.floor(root.innerHeight / 4));
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}

function lerp3(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }

function loop(tms) {
  if (!running) return;
  const t = tms / 1000;
  const k = 0.02;
  current.a = lerp3(current.a, target.a, k);
  current.b = lerp3(current.b, target.b, k);
  current.c = lerp3(current.c, target.c, k);
  pulse *= 0.94;
  gl.uniform2f(uni.uRes, canvas.width, canvas.height);
  gl.uniform1f(uni.uTime, t);
  gl.uniform3fv(uni.uColA, current.a);
  gl.uniform3fv(uni.uColB, current.b);
  gl.uniform3fv(uni.uColC, current.c);
  gl.uniform1f(uni.uPulse, pulse);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  raf = requestAnimationFrame(loop);
}

function setHue(hue) { target = hueToCols(hue); }
function kick(amount) { pulse = Math.min(1, pulse + (amount || 0.4)); }

root.DS = root.DS || {};
root.DS.Shader = { init, setHue, kick };

})(typeof globalThis !== 'undefined' ? globalThis : this);
