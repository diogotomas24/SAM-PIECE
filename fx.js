// Efectos de SAM PIECE 3D: fondo vivo, inclinación (giroscopio), sonidos y vibración.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rootStyle = document.documentElement.style;

// ---------------- inclinación global (giroscopio / puntero) ----------------
export const tilt = { x: 0, y: 0, tx: 0, ty: 0, gyro: false };
let baseBeta = null;
function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  tilt.gyro = true;
  if (baseBeta === null) baseBeta = Math.min(Math.max(e.beta, 20), 70);
  baseBeta += (e.beta - baseBeta) * 0.004; // se recentra poco a poco según cómo sujete el móvil
  tilt.tx = Math.max(-1, Math.min(1, e.gamma / 28));
  tilt.ty = Math.max(-1, Math.min(1, (e.beta - baseBeta) / 22));
}
function onPointer(e) {
  if (tilt.gyro || e.pointerType === 'touch') return;
  tilt.tx = (e.clientX / innerWidth) * 2 - 1;
  tilt.ty = (e.clientY / innerHeight) * 2 - 1;
}
let gyroAsked = false;
export async function requestGyro() {
  if (gyroAsked) return; gyroAsked = true;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') return;
    }
    addEventListener('deviceorientation', onOrient);
  } catch { }
}
addEventListener('pointermove', onPointer, { passive: true });
function tiltLoop() {
  const k = reduceMotion ? 1 : 0.12;
  tilt.x += (tilt.tx - tilt.x) * k; tilt.y += (tilt.ty - tilt.y) * k;
  rootStyle.setProperty('--tx', tilt.x.toFixed(3));
  rootStyle.setProperty('--ty', tilt.y.toFixed(3));
  requestAnimationFrame(tiltLoop);
}
requestAnimationFrame(tiltLoop);

// ---------------- sonido (sintetizado, sin archivos) ----------------
let actx = null, master = null;
let soundOn = (() => { try { return localStorage.getItem('sp-sound') !== '0'; } catch { return true; } })();
export const isSoundOn = () => soundOn;
export function setSound(on) { soundOn = on; try { localStorage.setItem('sp-sound', on ? '1' : '0'); } catch { } if (on) unlockAudio(); }
export function unlockAudio() {
  try {
    if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination); }
    if (actx.state === 'suspended') actx.resume();
  } catch { }
}
function tone(freq, t0, dur, { type = 'sine', gain = 0.2, attack = 0.005, slide = 0 } = {}) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(t0, dur, { gain = 0.15, from = 400, to = 4000, q = 1 } = {}) {
  const len = Math.floor(actx.sampleRate * dur), b = actx.createBuffer(1, len, actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = actx.createBufferSource(); s.buffer = b;
  const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur);
}
export function sfx(name) {
  if (!soundOn) return;
  unlockAudio(); if (!actx) return;
  const t = actx.currentTime + 0.01;
  switch (name) {
    case 'tap': tone(1320, t, 0.06, { gain: 0.05 }); break;
    case 'nav': tone(660, t, 0.08, { gain: 0.05, type: 'triangle' }); tone(990, t + 0.04, 0.08, { gain: 0.04, type: 'triangle' }); break;
    case 'whoosh': noise(t, 0.9, { gain: 0.25, from: 300, to: 3000, q: 0.7 }); tone(110, t, 0.8, { gain: 0.15, slide: 0.5 }); break;
    case 'shimmer': [2093, 2637, 3136, 4186].forEach((f, i) => tone(f, t + i * 0.05, 0.5, { gain: 0.035 })); break;
    case 'build': noise(t, 1.2, { gain: 0.08, from: 200, to: 1800, q: 2 }); tone(220, t, 1.2, { gain: 0.06, slide: 2, type: 'sawtooth' }); break;
    case 'reveal': [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.06, 1.1, { gain: 0.07, type: 'triangle' })); [2093, 2637, 3136].forEach((f, i) => tone(f, t + 0.3 + i * 0.07, 0.6, { gain: 0.03 })); break;
    case 'epic': tone(55, t, 1.4, { gain: 0.35, slide: 0.6 }); noise(t, 0.6, { gain: 0.3, from: 2000, to: 200 });
      [392, 494, 587, 784, 988].forEach((f, i) => tone(f, t + 0.15 + i * 0.08, 1.6, { gain: 0.07, type: 'triangle' }));
      [2349, 2637, 3136, 3951].forEach((f, i) => tone(f, t + 0.6 + i * 0.08, 0.7, { gain: 0.03 })); break;
    case 'manga': tone(80, t, 0.25, { gain: 0.4, type: 'square', slide: 0.5 }); noise(t, 0.25, { gain: 0.35, from: 3000, to: 300 }); break;
  }
}

// ---------------- vibración ----------------
let iosSwitch = null;
export function haptic(kind = 'light') {
  try {
    if (navigator.vibrate) { navigator.vibrate(kind === 'heavy' ? [30, 40, 60] : kind === 'medium' ? 25 : 10); return; }
    // iPhone (iOS 18+): un interruptor nativo produce un toque háptico al cambiar
    if (!iosSwitch) {
      const l = document.createElement('label'); l.setAttribute('aria-hidden', 'true');
      l.style.cssText = 'position:fixed;left:-99px;top:-99px;opacity:0;pointer-events:none';
      const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); l.appendChild(i);
      document.body.appendChild(l); iosSwitch = l;
    }
    iosSwitch.click();
    if (kind === 'heavy') { setTimeout(() => iosSwitch.click(), 90); setTimeout(() => iosSwitch.click(), 200); }
  } catch { }
}

// ---------------- fondo vivo: océano nocturno ----------------
let bgPaused = false;
export const pauseBackground = p => { bgPaused = p; };
export function startBackground(cv) {
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, lite = reduceMotion;
  const stars = [], dust = [];
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, lite ? 1 : 1.5);
    W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr);
    cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
    stars.length = 0; for (let i = 0; i < (lite ? 40 : 90); i++) stars.push({ x: Math.random(), y: Math.random() * 0.55, r: Math.random() * 1.2 + 0.3, p: Math.random() * 6.28, s: 0.5 + Math.random() * 1.5 });
    dust.length = 0; for (let i = 0; i < (lite ? 18 : 46); i++) dust.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.8 + 0.6, v: 0.00006 + Math.random() * 0.00016, p: Math.random() * 6.28 });
  };
  resize(); addEventListener('resize', resize);
  let last = 0, frames = 0, fpsT = performance.now(), checked = false;
  const draw = now => {
    requestAnimationFrame(draw);
    if (bgPaused || document.hidden) return;
    if (now - last < (lite ? 50 : 33)) return; // ~30 fps (20 en modo ligero)
    const dt = Math.min(now - last, 100); last = now; frames++;
    if (!checked && now - fpsT > 4000) { checked = true; if (frames / ((now - fpsT) / 1000) < 22 && !lite) { lite = true; resize(); } }
    const t = now / 1000, px = tilt.x, py = tilt.y;
    const horizon = H * (0.62 + py * 0.01);
    // cielo
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#02040c'); sky.addColorStop(0.55, '#0a1434'); sky.addColorStop(1, '#1b2b62');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon + 2);
    // estrellas
    for (const s of stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
      ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#e9eeff';
      ctx.beginPath(); ctx.arc((s.x * W + px * 6 * dpr + W) % W, s.y * H + py * 4 * dpr, s.r * dpr, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // luna tras la niebla
    const mx = W * (0.84 - px * 0.02), my = H * 0.075;
    let g = ctx.createRadialGradient(mx, my, 0, mx, my, H * 0.32);
    g.addColorStop(0, 'rgba(255,236,190,.55)'); g.addColorStop(0.08, 'rgba(247,217,139,.35)'); g.addColorStop(0.3, 'rgba(120,140,220,.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,246,220,.75)'; ctx.beginPath(); ctx.arc(mx, my, H * 0.016, 0, 6.283); ctx.fill();
    // rayos de luz
    if (!lite) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const sway = Math.sin(t * 0.15 + i * 1.7) * 0.06 + px * 0.05;
        const ang = -0.55 + i * 0.22 + sway;
        const len = H * 1.2, w = W * (0.05 + (i % 3) * 0.025);
        ctx.save(); ctx.translate(mx, my - H * 0.05); ctx.rotate(ang);
        const rg = ctx.createLinearGradient(0, 0, 0, len); rg.addColorStop(0, `rgba(247,217,139,${0.07 + 0.03 * Math.sin(t * 0.4 + i)})`); rg.addColorStop(1, 'rgba(247,217,139,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(-w * 0.15, 0); ctx.lineTo(w * 0.15, 0); ctx.lineTo(w, len); ctx.lineTo(-w, len); ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }
    // mar
    const sea = ctx.createLinearGradient(0, horizon, 0, H);
    sea.addColorStop(0, '#13214e'); sea.addColorStop(0.35, '#08112c'); sea.addColorStop(1, '#02040b');
    ctx.fillStyle = sea; ctx.fillRect(0, horizon, W, H - horizon);
    // reflejo de la luna en el agua
    const rw = W * 0.18;
    g = ctx.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, 'rgba(247,217,139,.28)'); g.addColorStop(1, 'rgba(247,217,139,0)');
    ctx.fillStyle = g;
    for (let i = 0; i < 26; i++) {
      const y = horizon + (H - horizon) * (i / 26) ** 1.4, ww = rw * (0.3 + i / 26) * (0.6 + 0.4 * Math.sin(t * 1.3 + i * 2.1));
      ctx.fillRect(mx - ww / 2 + Math.sin(t + i) * 6 * dpr, y, ww, 2 * dpr);
    }
    // olas
    const layers = lite ? 3 : 5;
    for (let l = 0; l < layers; l++) {
      const yBase = horizon + (H - horizon) * (0.08 + l * 0.19), amp = (3 + l * 3.5) * dpr, freq = 0.006 / dpr / (1 + l * 0.35), sp = 0.35 + l * 0.18;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 10 * dpr) {
        const y = yBase + Math.sin(x * freq + t * sp + l) * amp + Math.sin(x * freq * 2.3 - t * sp * 1.4) * amp * 0.4 + px * (l + 1) * 3 * dpr;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = `rgba(${4 + l * 2},${9 + l * 3},${26 + l * 6},${0.55 + l * 0.08})`; ctx.fill();
      ctx.strokeStyle = `rgba(247,217,139,${0.05 + l * 0.025})`; ctx.lineWidth = dpr; ctx.stroke();
    }
    // niebla
    if (!lite) {
      for (let i = 0; i < 3; i++) {
        const fx = ((t * (8 + i * 5) * dpr + i * W * 0.4) % (W * 1.6)) - W * 0.3, fy = horizon + (i - 1) * H * 0.05;
        g = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.55);
        g.addColorStop(0, 'rgba(140,160,220,.08)'); g.addColorStop(1, 'rgba(140,160,220,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
    // polvo dorado
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const d of dust) {
      d.y -= d.v * dt; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
      const x = (d.x + Math.sin(t * 0.5 + d.p) * 0.01 + px * 0.01) * W, y = d.y * H;
      ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + d.p));
      ctx.fillStyle = '#f7d98b'; ctx.beginPath(); ctx.arc(x, y, d.r * dpr, 0, 6.283); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
    // viñeta
    g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.5, H * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  requestAnimationFrame(draw);
}

// ---------------- bandera ondeando ----------------
export function waveFlag(cv, svgMarkup) {
  const ctx = cv.getContext('2d');
  const img = new Image();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 220, h = cv.clientHeight || 150;
  cv.width = w * dpr; cv.height = h * dpr;
  let stop = false;
  img.onload = () => {
    const fw = cv.width * 0.86, fh = fw * (img.height / img.width), x0 = cv.width * 0.1, y0 = (cv.height - fh) / 2;
    const slices = 48, sw = img.width / slices, dw = fw / slices;
    const frame = now => {
      if (stop) return;
      const t = now / 1000;
      ctx.clearRect(0, 0, cv.width, cv.height);
      // mástil
      ctx.fillStyle = '#a8781f'; ctx.fillRect(x0 - 6 * dpr, y0 - 10 * dpr, 4 * dpr, cv.height - y0);
      ctx.fillStyle = '#f7d98b'; ctx.beginPath(); ctx.arc(x0 - 4 * dpr, y0 - 12 * dpr, 4 * dpr, 0, 6.283); ctx.fill();
      for (let i = 0; i < slices; i++) {
        const k = i / slices;
        const off = Math.sin(t * 3.2 - k * 6) * 7 * dpr * k;
        const shade = 0.9 + 0.1 * Math.cos(t * 3.2 - k * 6);
        ctx.globalAlpha = 1;
        ctx.drawImage(img, i * sw, 0, sw + 1, img.height, x0 + i * dw, y0 + off, dw + 1, fh);
        ctx.globalAlpha = (1 - shade) * 1.6; ctx.fillStyle = '#000';
        ctx.fillRect(x0 + i * dw, y0 + off, dw, fh);
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
  return () => { stop = true; };
}
