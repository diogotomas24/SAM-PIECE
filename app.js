// SAM PIECE 3D — web app independiente. El progreso se guarda en el propio teléfono.
// Rutas por fragmento: #coleccion, #carta-001, #figura-001, #escaner, #perfil, #sp-xxxxxxxxxx (QR)
// Rutas ocultas para pruebas: #pruebas, #diagnostico, #grupo

import { startBackground, pauseBackground, requestGyro, unlockAudio, sfx, haptic, isSoundOn, setSound, waveFlag } from './fx.js';

const VERSION = '0.2.0';
const KEY = 'sampiece.v1';
const $ = (s, el = document) => el.querySelector(s);
const root = document.getElementById('root');
const initialHash = location.hash;
const T0 = performance.now();
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

const S = { cards: [], byNum: new Map(), unlocked: {}, storageOK: true, persisted: null, lastNew: null };
const diag = {};

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const count = () => Object.keys(S.unlocked).length;
function toast(text, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}
function dialog({ title, body, ok = 'Aceptar', cancel = null }) {
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'dialog';
    d.innerHTML = `<div class="box"><h3></h3><p class="muted"></p><div class="row">
      ${cancel ? '<button class="btn ghost small" data-v="0"></button>' : ''}<button class="btn small" data-v="1"></button></div></div>`;
    $('h3', d).textContent = title; $('p', d).textContent = body;
    $('[data-v="1"]', d).textContent = ok; if (cancel) $('[data-v="0"]', d).textContent = cancel;
    d.addEventListener('click', e => { const v = e.target.closest('[data-v]'); if (v) { d.remove(); res(v.dataset.v === '1'); } });
    document.body.appendChild(d);
  });
}

// ---------- progreso local ----------
function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    S.unlocked = raw ? (JSON.parse(raw).cartas || {}) : {};
  } catch { S.storageOK = false; S.unlocked = {}; }
}
function saveProgress() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, actualizado: new Date().toISOString(), cartas: S.unlocked })); return true; }
  catch { S.storageOK = false; return false; }
}
async function askPersist() {
  try { if (navigator.storage?.persist) S.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch { }
}
// Copia de seguridad: los propios códigos de las cartas (se validan al importar)
const exportBackup = () => 'SAMPIECE1:' + Object.values(S.unlocked).map(u => u.c.slice(3)).sort().join('.');
async function importBackup(text) {
  const codes = (text.match(/[a-z0-9]{10}/gi) || []).map(c => 'sp-' + c.toLowerCase());
  let added = 0, bad = 0;
  for (const code of codes) {
    const card = await cardForCode(code);
    if (!card) { bad++; continue; }
    if (!S.unlocked[card.num]) { S.unlocked[card.num] = { t: new Date().toISOString(), c: code }; added++; }
  }
  if (added) saveProgress();
  return { added, bad, total: codes.length };
}

// SHA-256 (WebCrypto en https; respaldo propio por si acaso)
async function sha256(str) {
  try {
    if (crypto?.subtle) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      diag.crypto = 'subtle';
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
  } catch { }
  diag.crypto = 'respaldo JS';
  return sha256js(str);
}
function sha256js(ascii) {
  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  const K = [], H = []; let p = 2, n = 0; const isP = {};
  for (; n < 64; p++) { if (!isP[p]) { for (let i = 0; i < 313; i += p) isP[i] = p; H[n] = (Math.pow(p, .5) * 2 ** 32) | 0; K[n++] = (Math.pow(p, 1 / 3) * 2 ** 32) | 0; } }
  const bytes = [...new TextEncoder().encode(ascii)]; const bl = bytes.length * 8;
  bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bl >>> (i * 8)) & 255);
  let h = H.slice(0, 8);
  for (let j = 0; j < bytes.length; j += 64) {
    const w = []; for (let i = 0; i < 16; i++) w[i] = (bytes[j + i * 4] << 24) | (bytes[j + i * 4 + 1] << 16) | (bytes[j + i * 4 + 2] << 8) | bytes[j + i * 4 + 3];
    const o = h.slice(0);
    for (let i = 0; i < 64; i++) {
      if (i >= 16) { const w15 = w[i - 15], w2 = w[i - 2]; w[i] = (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0; }
      const [a, b, c, d, e, f, g, hh] = h;
      const t1 = hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      h = [(t1 + t2) | 0, a, b, c, (d + t1) | 0, e, f, g];
    }
    h = h.map((x, i) => (x + o[i]) | 0);
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
async function cardForCode(code) {
  const h = await sha256('sampiece:' + code);
  return S.cards.find(c => c.h === h) || null;
}

// ---------- iconos (originales) ----------
const ICON = {
  compass: `<svg viewBox="0 0 100 100" class="compass"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d98b"/><stop offset="1" stop-color="#a8781f"/></linearGradient></defs>
    <circle cx="50" cy="50" r="46" fill="none" stroke="url(#g)" stroke-width="2.5"/><circle cx="50" cy="50" r="38" fill="none" stroke="url(#g)" stroke-width="1" stroke-dasharray="2 4"/>
    <path d="M50 6 L57 50 L50 94 L43 50Z" fill="url(#g)"/><path d="M6 50 L50 43 L94 50 L50 57Z" fill="url(#g)" opacity=".7"/>
    <path d="M19 19 L52 48 L81 81 L48 52Z" fill="url(#g)" opacity=".35"/><path d="M81 19 L52 52 L19 81 L48 48Z" fill="url(#g)" opacity=".35"/><circle cx="50" cy="50" r="5" fill="#060a18" stroke="url(#g)" stroke-width="2"/></svg>`,
  q: `<svg viewBox="0 0 60 80"><path d="M30 6a20 20 0 0 0-20 20h11a9 9 0 1 1 13 8c-6 3-9 7-9 14v4h11v-3c0-3 1-5 5-7a20 20 0 0 0-11-36zM24 60h12v12H24z" fill="#e8b54a"/></svg>`,
  sil: `<svg viewBox="0 0 100 140"><g fill="#060a18" opacity=".85"><circle cx="50" cy="34" r="22"/><path d="M28 22l8-14 6 10 8-14 8 14 6-10 8 14z"/><path d="M18 140c0-38 12-62 32-62s32 24 32 62z"/></g></svg>`,
  lock: `<svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#e8b54a" stroke-width="2"/><rect x="4" y="10" width="16" height="11" rx="2.5" fill="#e8b54a"/><circle cx="12" cy="15" r="1.8" fill="#060a18"/></svg>`,
  shadow: `<svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMax meet"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24346b"/><stop offset="1" stop-color="#070c1f"/></linearGradient></defs>
    <g fill="url(#sg)"><circle cx="50" cy="40" r="19"/><path d="M30 30l6-15 7 9 7-14 7 14 7-9 6 15z"/><path d="M14 140c0-40 14-70 36-70s36 30 36 70z"/></g></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10v4h4l5 4V6L8 10z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10v4h4l5 4V6L8 10z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/></svg>`,
  scan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`,
};

// Emblema propio de SAM PIECE: calavera con cascos de gamer, balón de baloncesto y tibias
const EMBLEM = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 300 200">
  <defs><linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#e8b54a"/><stop offset="1" stop-color="#8a5d12"/></linearGradient>
  <radialGradient id="fl" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#1a2246"/><stop offset="1" stop-color="#05070f"/></radialGradient></defs>
  <rect width="300" height="200" fill="url(#fl)"/><rect x="5" y="5" width="290" height="190" fill="none" stroke="url(#gd)" stroke-width="3"/>
  <g transform="translate(150 104)">
    <circle r="56" fill="#e8742a" opacity=".9"/><path d="M-56 0H56M0-56V56M-40-40C-15-15-15 15-40 40M40-40C15-15 15 15 40 40" stroke="#05070f" stroke-width="3" fill="none" opacity=".8"/>
    <g stroke="#f4f2ec" stroke-width="13" stroke-linecap="round"><path d="M-62 46L62-46"/><path d="M-62-46L62 46"/></g>
    <g fill="#f4f2ec"><circle cx="-66" cy="40" r="9"/><circle cx="-58" cy="52" r="9"/><circle cx="66" cy="-40" r="9"/><circle cx="58" cy="-52" r="9"/>
      <circle cx="-66" cy="-40" r="9"/><circle cx="-58" cy="-52" r="9"/><circle cx="66" cy="40" r="9"/><circle cx="58" cy="52" r="9"/></g>
    <path d="M-36-6a36 38 0 1 1 72 0c0 14-6 22-12 26v12h-48v-12c-6-4-12-12-12-26z" fill="#f4f2ec"/>
    <ellipse cx="-14" cy="-4" rx="10" ry="12" fill="#05070f"/><ellipse cx="14" cy="-4" rx="10" ry="12" fill="#05070f"/>
    <path d="M0 8l-6 10h12z" fill="#05070f"/><path d="M-14 26v10M-5 26v10M5 26v10M14 26v10" stroke="#05070f" stroke-width="3"/>
    <path d="M-42-4a42 46 0 0 1 84 0" fill="none" stroke="url(#gd)" stroke-width="8"/>
    <rect x="-52" y="-12" width="16" height="28" rx="6" fill="url(#gd)"/><rect x="36" y="-12" width="16" height="28" rx="6" fill="url(#gd)"/>
    <path d="M-44 14c0 18 12 26 26 26" fill="none" stroke="url(#gd)" stroke-width="4"/><circle cx="-16" cy="40" r="5" fill="url(#gd)"/>
  </g></svg>`;

// ---------- rarezas -> animación ----------
const TIERS = {
  comun: { label: 'Nueva carta', parts: 40, rays: false, shake: false, delay: 700 },
  sr: { label: 'Super Rare', parts: 140, rays: false, shake: false, delay: 1100 },
  sec: { label: 'Secret Rare', parts: 220, rays: true, shake: true, delay: 1500 },
  manga: { label: 'Manga Rare', parts: 0, rays: false, shake: true, delay: 1500, manga: true },
  samuel: { label: 'Exclusiva de Samuel', parts: 320, rays: true, shake: true, delay: 2000, gold: true },
};
const RAREZA_A_TIER = { C: 'comun', UC: 'comun', R: 'comun', L: 'sr', SR: 'sr', SEC: 'sec', SP: 'sec', MR: 'manga', MANGA: 'manga', SAM: 'samuel' };
const tierOf = card => RAREZA_A_TIER[(card.rareza || '').toUpperCase()] || 'comun';

// ---------- cartas ----------
const RAREZA_CLASE = { C: 'comun', UC: 'comun', R: 'comun', L: 'sr', SR: 'sr', SEC: 'sec', SP: 'sec', MR: 'manga', MANGA: 'manga', SAM: 'samuel' };
const rarityClass = card => 'r-' + (RAREZA_CLASE[(card.rareza || '').toUpperCase()] || (card.rareza ? 'sr' : 'none'));
const SAM_STARS = '<div class="stars">' + [[12, 10], [82, 18], [20, 60], [88, 66], [50, 4]].map(([x, y], i) => `<i style="left:${x}%;top:${y}%;animation-delay:${i * .45}s"></i>`).join('') + '</div>';
function cardHTML(card, { link = true, forceFront = false, isNew = false } = {}) {
  const open = forceFront || !!S.unlocked[card.num];
  const tag = link ? 'a' : 'div';
  const href = link ? ` href="#carta-${card.num}"` : '';
  if (!open) return `<${tag} class="card locked"${href} aria-label="Carta ${card.num} bloqueada"><div class="face back">
    <div class="num">Nº ${card.num}</div><div class="sil">${ICON.shadow}</div><div class="fog"></div><div class="lock">${ICON.lock}</div></div></${tag}>`;
  const name = card.nombre || `Carta ${card.num}`;
  const rc = rarityClass(card);
  return `<${tag} class="card open ${rc}${isNew ? ' new' : ''}"${href} aria-label="${esc(name)}"><div class="face front">
    <div class="inner"><div class="art">${card.imagen ? `<img src="${esc(card.imagen)}" alt="">` : ICON.sil}</div>
    <div class="meta"><b>${esc(name)}</b><span>Nº ${card.num}/054</span></div></div>
    ${card.rareza ? `<div class="badge">${esc(card.rareza)}</div>` : ''}
    <div class="holo"></div><div class="glare"></div><div class="edge"></div>${rc === 'r-samuel' ? SAM_STARS : ''}</div></${tag}>`;
}
function backHTML() {
  return `<div class="card"><div class="face back" style="display:grid;place-items:center">
    <div style="text-align:center"><div class="gold-text" style="font-family:var(--title);font-weight:900;font-size:clamp(20px,6vw,30px);letter-spacing:.08em">SAM<br>PIECE</div>
    <div style="width:46%;margin:10px auto 0">${ICON.compass.replace('class="compass"', '')}</div></div></div></div>`;
}

// ---------- vistas ----------
function shell(active, inner) {
  root.innerHTML = `<div class="app">
    <div class="top"><div class="brand"><span class="gold-text">SAM PIECE</span><small>3D</small></div>
      <div class="top-r"><button class="icon-btn" id="snd" aria-label="Sonido">${isSoundOn() ? ICON.soundOn : ICON.soundOff}</button><div class="pill" id="cnt">${count()}/${S.cards.length}</div></div></div>
    <div id="view" class="fade-in">${inner}</div></div>
    <nav class="nav"><div class="nav-in">
      <a href="#coleccion" class="${active === 'coleccion' ? 'on' : ''}">${ICON.grid}Colección</a>
      <a href="#escaner" class="${active === 'escaner' ? 'on' : ''}">${ICON.scan}Escanear</a>
      <a href="#perfil" class="${active === 'perfil' ? 'on' : ''}">${ICON.user}Perfil</a>
    </div></nav>`;
  $('#snd').onclick = () => { setSound(!isSoundOn()); $('#snd').innerHTML = isSoundOn() ? ICON.soundOn : ICON.soundOff; sfx('tap'); haptic(); };
}
function installBanner() {
  if (isStandalone()) return '';
  let hidden = false; try { hidden = !!sessionStorage.getItem('sp-nobanner'); } catch { }
  if (hidden) return '';
  const how = isIOS ? 'toca <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>' : 'usa el menú del navegador y elige <b>Instalar app</b>';
  return `<div class="banner" id="banner"><p>Instala SAM PIECE: ${how}. Así tu colección queda guardada en tu móvil.</p><button class="btn ghost small" id="nob">OK</button></div>`;
}
// Mapa de navegación: 12 islas, una por sobre
const ISLANDS = Array.from({ length: 12 }, (_, i) => {
  const x = 70 + i * 94, y = 100 + Math.sin(i * 1.25) * 38 + (i % 2 ? 6 : -6);
  return { n: i + 1, x, y, r: 21 + ((i * 7) % 5) * 2.2, seed: i * 3.7 };
});
function islandPath(cx, cy, r, seed) {
  let d = ''; const pts = 14;
  for (let k = 0; k <= pts; k++) {
    const a = k / pts * Math.PI * 2, rr = r * (0.78 + 0.22 * Math.sin(a * 3 + seed) + 0.1 * Math.cos(a * 5 + seed * 2));
    const x = cx + Math.cos(a) * rr * 1.25, y = cy + Math.sin(a) * rr * 0.72;
    d += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return d + 'Z';
}
let sobreFiltro = null;
function islandState(n) {
  const cards = S.cards.filter(c => c.sobre === n);
  const got = cards.filter(c => S.unlocked[c.num]).length;
  return { total: cards.length, got, done: cards.length > 0 && got === cards.length, started: got > 0 };
}
function mapHTML() {
  const states = ISLANDS.map(is => islandState(is.n));
  const cur = Math.max(0, states.findIndex(st => !st.done));
  const route = ISLANDS.map((is, i) => (i ? 'L' : 'M') + is.x + ' ' + is.y).join('');
  return `<div class="map" id="map"><div class="map-in"><div class="map-title">RUTA DE LOS 12 SOBRES</div>
    <svg viewBox="0 0 1180 190" preserveAspectRatio="none">
      <defs><radialGradient id="isl" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#3f6a52"/><stop offset=".6" stop-color="#25442f"/><stop offset="1" stop-color="#16261c"/></radialGradient>
        <radialGradient id="sand" cx=".5" cy=".5" r=".5"><stop offset=".75" stop-color="#d9c08a"/><stop offset="1" stop-color="#d9c08a" stop-opacity="0"/></radialGradient>
        <radialGradient id="glw" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f7d98b" stop-opacity=".7"/><stop offset="1" stop-color="#f7d98b" stop-opacity="0"/></radialGradient>
        <filter id="fogf"><feGaussianBlur stdDeviation="6"/></filter></defs>
      ${Array.from({ length: 22 }, (_, i) => `<path d="M${(i * 57) % 1180} ${20 + (i * 37) % 160}q8 -4 16 0t16 0" stroke="rgba(154,165,196,.18)" fill="none" stroke-width="1.4"/>`).join('')}
      <path d="${route}" fill="none" stroke="#e8b54a" stroke-width="2" stroke-dasharray="6 7" opacity=".7"/>
      ${ISLANDS.map((is, i) => {
        const st = states[i];
        const cls = `island${st.done ? ' done' : ''}${sobreFiltro === is.n ? ' sel' : ''}`;
        const fog = !st.started && !st.done;
        return `<g class="${cls}" data-sobre="${is.n}">
          ${st.done ? `<ellipse class="halo" cx="${is.x}" cy="${is.y}" rx="${is.r * 2.2}" ry="${is.r * 1.5}" fill="url(#glw)"/>` : ''}
          <path d="${islandPath(is.x, is.y + 3, is.r * 1.18, is.seed)}" fill="url(#sand)" opacity=".75"/>
          <path class="ring" d="${islandPath(is.x, is.y, is.r, is.seed)}" fill="url(#isl)" stroke="${st.done ? '#f7d98b' : 'rgba(247,217,139,.35)'}" stroke-width="1.5"/>
          <path d="M${is.x - 4} ${is.y - 2}v-16" stroke="#6b4a1c" stroke-width="2"/><path d="M${is.x - 4} ${is.y - 18}c-8 -2 -12 2 -14 6M${is.x - 4} ${is.y - 18}c8 -3 12 1 14 5M${is.x - 4} ${is.y - 18}c-2 -6 -8 -8 -12 -7" stroke="#4f8a5e" stroke-width="3" fill="none" stroke-linecap="round"/>
          ${st.done ? `<path d="M${is.x + 8} ${is.y - 6}v-20" stroke="#e8b54a" stroke-width="2"/><path d="M${is.x + 8} ${is.y - 26}h14l-4 5 4 5h-14z" fill="#e8b54a"/>` : ''}
          ${fog ? `<ellipse cx="${is.x}" cy="${is.y}" rx="${is.r * 1.6}" ry="${is.r}" fill="rgba(150,165,210,.38)" filter="url(#fogf)"/>` : ''}
          <text class="lbl" x="${is.x}" y="${is.y + is.r + 18}">SOBRE ${is.n}</text>
          <text class="cnt" x="${is.x}" y="${is.y + is.r + 32}">${st.total ? `${st.got}/${st.total}` : '?'}</text></g>`;
      }).join('')}
      <g class="ship" transform="translate(${ISLANDS[cur].x - 46} ${ISLANDS[cur].y - 44})">
        <path d="M4 26h40l-6 10H10z" fill="#6b4a1c" stroke="#e8b54a" stroke-width="1.2"/><path d="M23 4v22" stroke="#e8b54a" stroke-width="2"/>
        <path d="M24 6c10 3 14 9 12 17H24z" fill="#f4f2ec"/><path d="M22 8c-8 3-11 8-10 14h10z" fill="#dfe4ee"/><path d="M23 4h9l-2 3 2 3h-9z" fill="#05070f"/></g>
    </svg></div></div>`;
}
function viewColeccion() {
  const n = count(), total = S.cards.length;
  const visibles = sobreFiltro ? S.cards.filter(c => c.sobre === sobreFiltro) : S.cards;
  shell('coleccion', `
    ${installBanner()}
    <div class="h"><h1 class="gold-text">Colección</h1><span class="sub">Doce sobres · ${total} cartas</span></div>
    <div class="progress"><div class="num gold-text">${n}<small>/${total}</small></div><div class="bar"><i style="width:${total ? (n / total * 100) : 0}%"></i></div></div>
    ${mapHTML()}
    ${sobreFiltro ? `<div class="filter-note"><span>Sobre ${sobreFiltro} · ${visibles.length} cartas</span><button class="btn ghost small" id="clearf">Ver todas</button></div>` : ''}
    ${S.storageOK ? '' : '<p><span class="tag bad">Sin guardado</span> Este navegador no permite guardar la colección (¿modo privado?).</p>'}
    <div class="grid">${visibles.map(c => cardHTML(c, { isNew: S.lastNew === c.num })).join('')}</div>`);
  const nb = $('#nob'); if (nb) nb.onclick = () => { try { sessionStorage.setItem('sp-nobanner', '1'); } catch { } $('#banner').remove(); };
  $('#clearf')?.addEventListener('click', () => { sobreFiltro = null; sfx('tap'); viewColeccion(); });
  const map = $('#map');
  if (map) {
    const states = ISLANDS.map(is => islandState(is.n)); const cur = Math.max(0, states.findIndex(st => !st.done));
    map.scrollLeft = Math.max(0, ISLANDS[sobreFiltro ? sobreFiltro - 1 : cur].x - map.clientWidth / 2);
    map.addEventListener('click', e => {
      const g = e.target.closest('.island'); if (!g) return;
      const sb = +g.dataset.sobre; sfx('tap'); haptic();
      if (!islandState(sb).total) { toast(`El sobre ${sb} aún no tiene cartas asignadas`); return; }
      sobreFiltro = sobreFiltro === sb ? null : sb; viewColeccion();
    });
  }
  S.lastNew = null;
}
function viewFicha(num) {
  const c = S.byNum.get(num);
  if (!c) return go('coleccion');
  const u = S.unlocked[num];
  const fecha = u ? new Date(u.t).toLocaleDateString('es-ES', { dateStyle: 'long' }) : null;
  const rz = { comun: 'Común', sr: 'Super Rare', sec: 'Secret Rare', manga: 'Manga Rare', samuel: 'Exclusiva de Samuel' }[rarityClass(c).slice(2)];
  shell('coleccion', `
    <div class="h"><h1 class="gold-text">Nº ${c.num}</h1><a class="btn ghost small" href="#coleccion">Volver</a></div>
    <div class="ficha">
      <div><div class="showcase" id="show"><div class="aura"></div><div class="stage3d">${cardHTML(c, { link: false })}</div><div class="shadow"></div></div>
        ${u ? '<div class="hint-tilt">Inclina el móvil o arrastra la carta</div>' : ''}</div>
      <div>
        ${u ? `<div class="poster">
          <div class="kicker">TRIPULACIÓN SAM PIECE</div>
          <h2>RECOMPENSA</h2>
          <div class="rule"></div>
          <div class="name">${esc(c.nombre || 'Carta ' + c.num)}</div>
          <div class="bounty"><span class="coin">S</span>${c.recompensa ? esc(Number(c.recompensa).toLocaleString('es-ES')) : '¿?.???.???'}</div>
          <dl><dt>Rareza</dt><dd>${esc(c.rareza ? (rz || c.rareza) : 'Por definir')}</dd>
          <dt>Número</dt><dd>${c.num}/054</dd>
          <dt>Personajes</dt><dd>${c.personajes?.length ? esc(c.personajes.join(', ')) : 'Por definir'}</dd>
          <dt>Sobre</dt><dd>${c.sobre ? 'Sobre ' + c.sobre : 'Por definir'}</dd>
          <dt>Capturada</dt><dd>${esc(fecha)}</dd></dl>
          <p class="quote">${c.frase ? '«' + esc(c.frase) + '»' : '«Frase por escribir»'}</p>
          <div class="seal">SAM<br>PIECE</div></div>
          <a class="btn" href="#figura-${c.num}" style="width:100%;margin-top:30px">Ver figura 3D</a>`
        : `<div class="panel"><h2>Carta bloqueada</h2><p>Encuentra esta carta en uno de tus sobres y escanea su código para desbloquear su figura.</p></div>
           <a class="btn" href="#escaner" style="width:100%">Escanear</a>`}
      </div></div>`);
  // arrastrar para inclinar la carta
  const show = $('#show'), card = $('.card', show);
  let drag = null;
  show.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; show.setPointerCapture(e.pointerId); });
  show.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = Math.max(-1, Math.min(1, (e.clientX - drag.x) / 120)), dy = Math.max(-1, Math.min(1, (e.clientY - drag.y) / 120));
    card.style.setProperty('--rx', (dx * 28).toFixed(1)); card.style.setProperty('--ry', (-dy * 24).toFixed(1));
    card.style.setProperty('--tx', dx.toFixed(2)); card.style.setProperty('--ty', dy.toFixed(2));
  });
  const end = () => { if (!drag) return; drag = null; card.style.transition = 'transform .6s cubic-bezier(.2,1.4,.4,1)';
    ['--rx', '--ry', '--tx', '--ty'].forEach(p => card.style.removeProperty(p)); setTimeout(() => card.style.transition = '', 600); };
  show.addEventListener('pointerup', end); show.addEventListener('pointercancel', end);
  if (u) sfx('shimmer');
}
function viewEscaner() {
  shell('escaner', `
    <div class="h"><h1>Escanear</h1></div>
    <div class="panel"><h2>Cámara</h2>
      <p>Apunta al código QR de la carta.</p>
      <button class="btn" id="cam" style="margin-top:8px;width:100%">Abrir cámara</button>
      <div class="msg" id="cammsg"></div></div>
    <div class="panel"><h2>Desde una foto</h2>
      <p>Si la cámara no funciona, haz o elige una foto del código.</p>
      <label class="btn ghost" style="margin-top:8px">Elegir foto<input type="file" accept="image/*" id="qrfile" hidden></label>
      <div class="msg" id="qrmsg"></div></div>
    <div class="panel"><h2>Código manual</h2>
      <p>Escribe el código impreso bajo el QR.</p>
      <form class="row" id="codeform" style="margin-top:8px"><input type="text" id="code" placeholder="sp-xxxxxxxxxx" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button class="btn" type="submit">Abrir</button></form>
      <div class="msg" id="codemsg"></div></div>`);
  $('#cam').onclick = () => openScanner().catch(e => { const m = $('#cammsg'); if (m) { m.className = 'msg bad'; m.textContent = 'No se pudo abrir la cámara: ' + e.message + '. Usa una foto o el código.'; } });
  $('#codeform').addEventListener('submit', e => {
    e.preventDefault();
    let v = $('#code').value.trim().toLowerCase().replace(/\s+/g, '');
    if (!v.startsWith('sp-')) v = 'sp-' + v.replace(/^sp/, '');
    if (!/^sp-[a-z0-9]{10}$/.test(v)) { const m = $('#codemsg'); m.className = 'msg bad'; m.textContent = 'El código tiene 10 caracteres después de «sp-».'; return; }
    handleCode(v);
  });
  $('#qrfile').addEventListener('change', async e => {
    const f = e.target.files?.[0]; const m = $('#qrmsg'); if (!f) return;
    m.className = 'msg'; m.textContent = 'Leyendo código…';
    try {
      const text = await decodeQRFromFile(f);
      const code = extractCode(text);
      if (!code) { m.className = 'msg bad'; m.textContent = text ? 'Ese QR no es de SAM PIECE.' : 'No se encontró ningún QR en la foto.'; return; }
      m.textContent = ''; handleCode(code);
    } catch (err) { m.className = 'msg bad'; m.textContent = 'No se pudo leer la foto: ' + err.message; }
  });
}
const extractCode = text => (text || '').match(/sp-[a-z0-9]{10}/i)?.[0]?.toLowerCase() || null;

function viewPerfil() {
  const n = count(), total = S.cards.length;
  shell('perfil', `
    <div class="h"><h1>Perfil</h1></div>
    <div class="panel"><h2>Progreso</h2>
      <div class="progress" style="margin:8px 0 0"><div class="num">${n}<small>/${total}</small></div><div class="bar"><i style="width:${total ? n / total * 100 : 0}%"></i></div></div>
      <p class="muted" style="margin-top:10px">Tu colección se guarda en este teléfono${isStandalone() ? '' : ' (en este navegador)'}.</p></div>
    <div class="panel"><h2>Copia de seguridad</h2>
      <p>Guarda este texto (por ejemplo, en Notas). Si cambias de móvil, pégalo aquí para recuperar tus cartas. También puedes volver a escanearlas.</p>
      <textarea id="bk" readonly>${n ? esc(exportBackup()) : 'Aún no tienes cartas.'}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn small" id="bcopy"${n ? '' : ' disabled'}>Copiar</button></div></div>
    <div class="panel"><h2>Recuperar colección</h2>
      <textarea id="bi" placeholder="Pega aquí tu copia SAMPIECE1:…"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn ghost small" id="bimp">Recuperar</button></div><div class="msg" id="bmsg"></div></div>
    <p class="muted" style="text-align:center;font-size:14px">SAM PIECE 3D · v${VERSION}</p>`);
  $('#bcopy').onclick = async () => { try { await navigator.clipboard.writeText(exportBackup()); toast('Copia guardada en el portapapeles'); } catch { $('#bk').select(); toast('Selecciona y copia el texto'); } };
  $('#bimp').onclick = async () => {
    const m = $('#bmsg'); const r = await importBackup($('#bi').value);
    if (!r.total) { m.className = 'msg bad'; m.textContent = 'No se encontró ninguna copia en el texto.'; return; }
    m.className = 'msg ok'; m.textContent = `${r.added} carta${r.added === 1 ? '' : 's'} recuperada${r.added === 1 ? '' : 's'}${r.bad ? ` · ${r.bad} código${r.bad === 1 ? '' : 's'} no válido${r.bad === 1 ? '' : 's'}` : ''}.`;
    $('#cnt').textContent = `${count()}/${S.cards.length}`;
  };
}
function viewMuestrario() {
  const demo = [['C', 'Común'], ['SR', 'Super Rare'], ['SEC', 'Secret Rare'], ['MR', 'Manga Rare'], ['SAM', 'Exclusiva']].map(([r, n], i) =>
    ({ num: String(i + 1).padStart(3, '0'), nombre: n, rareza: r }));
  shell('perfil', `<div class="h"><h1 class="gold-text">Muestrario</h1><a class="btn ghost small" href="#pruebas">Volver</a></div>
    <p class="muted">Inclina el móvil para ver el brillo holográfico.</p>
    <div class="grid">${demo.map(c => cardHTML(c, { link: false, forceFront: true })).join('')}</div>`);
}
function viewPruebas() {
  shell('perfil', `
    <div class="h"><h1>Pruebas</h1><a class="btn ghost small" href="#perfil">Volver</a></div>
    <div class="panel"><h2>Animaciones</h2><p>Previsualiza una animación sin desbloquear nada.</p>
      <div class="row" style="margin-top:10px">
        <select id="tnum">${S.cards.map(c => `<option value="${c.num}">Carta ${c.num}</option>`).join('')}</select>
        <select id="ttier">${Object.entries(TIERS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
        <button class="btn small" id="tprev">Ver</button></div></div>
    <div class="panel"><h2>Rarezas</h2><p>Muestra de los cinco marcos de carta.</p><a class="btn ghost small" href="#muestrario">Ver muestrario</a></div>
    <div class="panel"><h2>3D</h2><div class="row"><a class="btn ghost small" href="#figura-prueba">Figura de prueba</a><a class="btn ghost small" href="#grupo">Escena grupal</a></div></div>
    <div class="panel"><h2>Diagnóstico</h2><a class="btn ghost small" href="#diagnostico">Abrir diagnóstico</a></div>
    <div class="panel"><h2>Reiniciar</h2><p>Borra todas las cartas desbloqueadas de este teléfono.</p><button class="btn ghost small" id="treset">Reiniciar progreso</button></div>`);
  $('#tprev').onclick = () => {
    const tier = $('#ttier').value, rz = { comun: 'C', sr: 'SR', sec: 'SEC', manga: 'MR', samuel: 'SAM' }[tier];
    playUnlock({ ...S.byNum.get($('#tnum').value), rareza: rz }, tier, { preview: true });
  };
  $('#treset').onclick = async () => {
    if (!(await dialog({ title: 'Reiniciar progreso', body: 'Se borrarán todas las cartas desbloqueadas de este teléfono.', ok: 'Reiniciar', cancel: 'Cancelar' }))) return;
    S.unlocked = {}; saveProgress(); toast('Progreso reiniciado'); viewPruebas();
  };
}

// ---------- códigos ----------
const attempts = [];
async function handleCode(code) {
  const now = Date.now(); while (attempts.length && now - attempts[0] > 60000) attempts.shift();
  if (attempts.length >= 6) { await dialog({ title: 'Demasiados intentos', body: 'Espera un minuto antes de probar otro código.' }); return go('escaner'); }
  const card = await cardForCode(code);
  if (!card) { attempts.push(now); await dialog({ title: 'Código no reconocido', body: 'Este código no pertenece a ninguna carta de SAM PIECE.' }); return go('escaner'); }
  if (S.unlocked[card.num]) { toast('Ya tenías esta carta en tu colección'); return go('carta-' + card.num); }
  S.unlocked[card.num] = { t: new Date().toISOString(), c: code };
  if (!saveProgress()) toast('Atención: este navegador no guarda la colección', 4000);
  S.lastNew = card.num;
  await playUnlock(card, tierOf(card));
}

// ---------- animación de desbloqueo ----------
function playUnlock(card, tierKey, { preview = false } = {}) {
  return new Promise(resolve => {
    const T = TIERS[tierKey] || TIERS.comun;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const o = document.createElement('div'); o.className = 'unlock' + (T.manga ? ' manga' : '');
    o.innerHTML = `<canvas></canvas><div class="stage hover"><div class="flip">${backHTML()}${cardHTML(card, { link: false, forceFront: true }).replace('class="card', 'class="card f')}</div></div>
      <div class="label">${esc(T.label)}<small>Nº ${card.num}/054</small></div>
      <div class="actions">${preview ? '<button class="btn" data-a="close">Cerrar</button>' : `<button class="btn ghost" data-a="ficha">Ver ficha</button><button class="btn" data-a="fig">Ver figura 3D</button>`}</div>`;
    document.body.appendChild(o); sfx('build');
    const cv = $('canvas', o), ctx = cv.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const resize = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    resize(); addEventListener('resize', resize);
    let parts = [], start = performance.now(), opened = false, raf;
    const cx = () => cv.width / 2, cy = () => cv.height * 0.38;
    const burst = n => {
      n = reduce ? Math.min(n, 30) : n;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 9) * dpr;
        parts.push({ x: cx(), y: cy(), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2 * dpr, life: 1, r: (1 + Math.random() * 3) * dpr,
          c: T.gold || Math.random() < .6 ? `hsl(${40 + Math.random() * 12},95%,${60 + Math.random() * 25}%)` : `hsl(${Math.random() * 360},90%,75%)` });
      }
    };
    const frame = t => {
      const el = t - start; ctx.clearRect(0, 0, cv.width, cv.height);
      if (T.manga) {
        ctx.save(); ctx.translate(cx(), cy()); ctx.fillStyle = '#050505';
        for (let i = 0; i < 90; i++) {
          const a = i / 90 * Math.PI * 2 + (i % 3) * .01, w = .006 + (i % 5) * .002, r0 = (opened ? 170 : 230 - Math.min(el / 8, 60)) * dpr;
          ctx.beginPath(); ctx.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0); ctx.lineTo(Math.cos(a) * 2000, Math.sin(a) * 2000); ctx.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0); ctx.fill();
        }
        ctx.restore();
      } else {
        const g = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), 320 * dpr);
        const glow = opened ? .55 : Math.min(el / T.delay, 1) * .35;
        g.addColorStop(0, `rgba(232,181,74,${glow})`); g.addColorStop(1, 'rgba(232,181,74,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
        if (T.rays && !reduce) {
          ctx.save(); ctx.translate(cx(), cy()); ctx.rotate(el / 3000);
          for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.fillStyle = `rgba(247,217,139,${opened ? .10 : .05})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40 * dpr, -1400 * dpr); ctx.lineTo(40 * dpr, -1400 * dpr); ctx.fill(); }
          ctx.restore();
        }
      }
      if (!opened && !T.manga && el < T.delay && Math.random() < .5) parts.push({ x: cx() + (Math.random() - .5) * 200 * dpr, y: cy() + 150 * dpr, vx: 0, vy: -(1 + Math.random() * 2) * dpr, life: .8, r: 1.5 * dpr, c: '#f7d98b' });
      parts = parts.filter(p => (p.life -= .012) > 0);
      for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += .12 * dpr; p.vx *= .985; ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (!opened && el >= T.delay) {
        opened = true; $('.flip', o).classList.add('open'); burst(T.parts);
        sfx(T.manga ? 'manga' : T.gold || T.rays ? 'epic' : 'reveal'); haptic(T.shake ? 'heavy' : 'medium');
        if (T.shake && !reduce) { o.classList.add('shake'); setTimeout(() => o.classList.remove('shake'), 500); }
        if (T.gold) setTimeout(() => burst(T.parts / 2), 450);
        $('.label', o).classList.add('show'); $('.actions', o).classList.add('show');
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    o.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      cancelAnimationFrame(raf); removeEventListener('resize', resize); o.remove();
      if (a === 'ficha') go('carta-' + card.num); else if (a === 'fig') go('figura-' + card.num); else if (!preview) go('coleccion');
      resolve();
    });
  });
}

// ---------- visor 3D ----------
let threeP = null, viewer = null;
function loadThree() {
  if (!threeP) {
    const t = performance.now();
    threeP = Promise.all([
      import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'), import('three/addons/environments/RoomEnvironment.js'),
    ]).then(([THREE, O, G, M, R]) => {
      diag.three = { ok: true, ms: Math.round(performance.now() - t), v: THREE.REVISION };
      return { THREE, OrbitControls: O.OrbitControls, GLTFLoader: G.GLTFLoader, MeshoptDecoder: M.MeshoptDecoder, RoomEnvironment: R.RoomEnvironment };
    }).catch(e => { diag.three = { ok: false, err: e.message }; threeP = null; throw e; });
  }
  return threeP;
}
const glbCache = new Map();
async function fetchGLB(url) {
  if (glbCache.has(url)) return glbCache.get(url);
  const t = performance.now(); const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = await r.arrayBuffer(); const info = { buf, bytes: buf.byteLength, ms: Math.round(performance.now() - t) };
  glbCache.set(url, info); return info;
}
async function openViewer(models, title) {
  closeViewer();
  const v = document.createElement('div'); v.className = 'viewer';
  v.innerHTML = `<div class="loading">Cargando figura…</div>
    <div class="bar3d"><button class="btn ghost small" data-a="back">Volver</button><div class="title3d"></div><span></span></div>
    <div class="stats"></div>
    <div class="tools"><button class="btn ghost small" data-a="rot">Girar: sí</button><button class="btn ghost small" data-a="reset">Centrar</button></div>`;
  $('.title3d', v).textContent = title;
  document.body.appendChild(v); pauseBackground(true);
  const state = { el: v, raf: 0, disposed: false };
  viewer = state;
  v.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'back') history.length > 1 ? history.back() : go('coleccion');
    if (a === 'rot' && state.controls) { state.controls.autoRotate = !state.controls.autoRotate; e.target.textContent = 'Girar: ' + (state.controls.autoRotate ? 'sí' : 'no'); }
    if (a === 'reset' && state.reset) state.reset();
  });
  try {
    const { THREE, OrbitControls, GLTFLoader, MeshoptDecoder, RoomEnvironment } = await loadThree();
    if (state.disposed) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    v.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
    const key = new THREE.DirectionalLight(0xfff1d6, 2.2); key.position.set(2, 4, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8b54a, 2.5); rim.position.set(-3, 2.5, -3); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0x8fa6ff, 0x0b1430, 0.6));

    const plat = new THREE.Group(); scene.add(plat);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0b1430, metalness: .6, roughness: .35 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe8b54a, metalness: 1, roughness: .25, emissive: 0x3a2604, emissiveIntensity: .6 });
    const n = models.length, radius = n > 1 ? 0.75 + n * 0.45 : 0.85;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, 0.14, 64), baseMat); base.position.y = -0.07; plat.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.005, 0.018, 12, 96), goldMat); ring.rotation.x = Math.PI / 2; plat.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.065, 0.012, 12, 96), goldMat); ring2.rotation.x = Math.PI / 2; ring2.position.y = -0.14; plat.add(ring2);
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const g2 = gc.getContext('2d');
    const rg = g2.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(232,181,74,.55)'); rg.addColorStop(1, 'rgba(232,181,74,0)'); g2.fillStyle = rg; g2.fillRect(0, 0, 128, 128);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(radius * 3.4, radius * 3.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = -0.155; plat.add(glow);
    const pg = new THREE.BufferGeometry(), pc = 160, pos = new Float32Array(pc * 3);
    for (let i = 0; i < pc; i++) { const a = Math.random() * 6.28, r = radius * (0.4 + Math.random() * 1.6); pos.set([Math.cos(a) * r, Math.random() * 2.6, Math.sin(a) * r], i * 3); }
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf7d98b, size: 0.02, transparent: true, opacity: .7, depthWrite: false }));
    scene.add(dust);

    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    let bytes = 0, ms = 0, tris = 0; const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const info = await fetchGLB(models[i]); bytes += info.bytes; ms += info.ms;
      const gltf = await new Promise((res, rej) => loader.parse(info.buf.slice(0), '', res, rej));
      const obj = gltf.scene;
      const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3());
      obj.scale.setScalar(1.8 / (size.y || 1));
      const box2 = new THREE.Box3().setFromObject(obj); const c = box2.getCenter(new THREE.Vector3());
      obj.position.x += -c.x + (i - (n - 1) / 2) * 1.05; obj.position.z += -c.z; obj.position.y += -box2.min.y;
      if (n > 1) obj.rotation.y = (i - (n - 1) / 2) * -0.25;
      obj.traverse(m => { if (m.isMesh) { const g = m.geometry; tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3; } });
      scene.add(obj);
    }
    if (state.disposed) { renderer.dispose(); return; }
    diag.glb = { ok: true, bytes, ms, tris, figuras: n };
    $('.loading', v)?.remove();
    $('.stats', v).innerHTML = `${n} figura${n > 1 ? 's' : ''} · ${(tris / 1000).toFixed(1)}k triángulos<br>${(bytes / 1048576).toFixed(2)} MB · descarga ${ms} ms · total ${Math.round(performance.now() - t0)} ms`;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false; controls.autoRotate = true; controls.autoRotateSpeed = 1.2;
    controls.minDistance = 1.2; controls.maxDistance = 6 + n * 1.5; controls.maxPolarAngle = Math.PI * 0.62;
    const home = () => { const d = n > 1 ? 3.6 + n * 0.9 : 4.2; camera.position.set(0, 1.35, d); controls.target.set(0, 0.95, 0); controls.update(); };
    home(); state.reset = home; state.controls = controls;
    const resize = () => { const w = v.clientWidth, h = v.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize(); addEventListener('resize', resize);
    let frames = 0, fpsStart = performance.now();
    const loop = t => {
      if (state.disposed) return;
      controls.update(); dust.rotation.y += 0.0015; glow.material.opacity = .75 + Math.sin(t / 700) * .25;
      renderer.render(scene, camera); frames++;
      if (fpsStart && t - fpsStart > 3000) { diag.fps = Math.round(frames * 1000 / (t - fpsStart)); fpsStart = 0; $('.stats', v).innerHTML += ` · ${diag.fps} fps`; }
      state.raf = requestAnimationFrame(loop);
    };
    state.raf = requestAnimationFrame(loop);
    state.cleanup = () => { removeEventListener('resize', resize); controls.dispose(); scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => { m.map?.dispose?.(); m.dispose(); }); }); pmrem.dispose(); renderer.dispose(); };
  } catch (e) {
    diag.glb = diag.glb || { ok: false, err: e.message };
    const l = $('.loading', v); if (l) { l.style.textTransform = 'none'; l.style.letterSpacing = '0'; l.textContent = 'No se pudo cargar el visor 3D: ' + e.message; }
  }
}
function closeViewer() {
  if (!viewer) return; viewer.disposed = true; cancelAnimationFrame(viewer.raf);
  try { viewer.cleanup?.(); } catch { } viewer.el.remove(); viewer = null; pauseBackground(false);
}

// ---------- lector de QR ----------
let jsqrP = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsqrP) jsqrP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = () => window.jsQR ? res(window.jsQR) : rej(new Error('lector no disponible')); s.onerror = () => { jsqrP = null; rej(new Error('no se pudo cargar el lector')); };
    document.head.appendChild(s);
  });
  return jsqrP;
}
async function decodeQRFromFile(file) {
  const jsQR = await loadJsQR();
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('imagen no válida')); i.src = url; });
    for (const max of [1400, 900, 2000]) {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
      const r = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
      if (r?.data) return r.data;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}
let scanner = null;
async function openScanner() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('este navegador no da acceso a la cámara');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  const el = document.createElement('div'); el.className = 'scan';
  el.innerHTML = `<video playsinline muted autoplay></video><div class="frame"></div>
    <div class="bar3d"><button class="btn ghost small" data-a="close">Cerrar</button></div>
    <div class="hint">Apunta al código QR de la carta</div>`;
  document.body.appendChild(el);
  const video = $('video', el); video.srcObject = stream; await video.play().catch(() => { });
  const st = { el, stream, stop: false }; scanner = st;
  const close = () => { st.stop = true; stream.getTracks().forEach(t => t.stop()); el.remove(); if (scanner === st) scanner = null; };
  st.close = close;
  el.addEventListener('click', e => { if (e.target.closest('[data-a="close"]')) close(); });
  let detector = null;
  try { if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch { }
  const jsQR = detector ? null : await loadJsQR();
  const c = document.createElement('canvas'); const x = c.getContext('2d', { willReadFrequently: true });
  while (!st.stop) {
    await sleep(160);
    if (st.stop || video.readyState < 2) continue;
    let text = null;
    try {
      if (detector) { const r = await detector.detect(video); text = r[0]?.rawValue || null; }
      else {
        const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
        c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
        x.drawImage(video, 0, 0, c.width, c.height);
        text = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data || null;
      }
    } catch { }
    const code = extractCode(text);
    if (code) { close(); handleCode(code); return; }
    if (text) $('.hint', el).textContent = 'Ese QR no es de SAM PIECE';
  }
}

// ---------- diagnóstico ----------
async function viewDiagnostico() {
  shell('perfil', `<div class="h"><h1>Diagnóstico</h1><a class="btn ghost small" href="#pruebas">Volver</a></div>
    <div class="diag-list" id="dl"></div>
    <div class="row" style="margin-top:14px"><button class="btn small" id="copy">Copiar informe</button></div>`);
  const list = $('#dl'), report = [];
  const add = (st, name, detail) => {
    const tag = { ok: ['ok', 'OK'], warn: ['warn', 'Aviso'], bad: ['bad', 'Falla'], info: ['wait', 'Info'] }[st];
    const d = document.createElement('div'); d.className = 'diag-item';
    d.innerHTML = `<span class="tag ${tag[0]}">${tag[1]}</span><b></b><div class="d"></div>`;
    $('b', d).textContent = name; $('.d', d).textContent = detail; list.appendChild(d);
    report.push(`[${tag[1]}] ${name}: ${detail}`);
  };
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(`SAM PIECE 3D v${VERSION} · diagnóstico\n` + report.join('\n')); toast('Informe copiado'); } catch { toast('No se pudo copiar'); } };
  const ua = navigator.userAgent;
  const iosV = ua.match(/OS (\d+)_(\d+)/);
  add('info', 'Dispositivo', `${isIOS ? 'iOS ' + (iosV ? iosV[1] + '.' + iosV[2] : '') : /Android/.test(ua) ? 'Android' : 'Ordenador'} · ${screen.width}×${screen.height} @${devicePixelRatio}x`);
  add(isStandalone() ? 'ok' : 'warn', 'Instalada en pantalla de inicio', isStandalone() ? 'Sí' : 'No (se recomienda instalarla)');
  add(S.storageOK ? 'ok' : 'bad', 'Guardado en el teléfono', S.storageOK ? `${count()} cartas guardadas` : 'No disponible');
  add(S.persisted ? 'ok' : 'info', 'Almacenamiento persistente', S.persisted ? 'Concedido' : 'No concedido (normal en iPhone si no está instalada)');
  add('ok', 'Service worker', 'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'Activo (funciona sin conexión)' : 'Registrado; activo en la próxima apertura') : 'No disponible');
  add(/^#sp-/.test(initialHash) ? 'ok' : 'info', 'Código en el enlace', initialHash ? `Recibido: ${initialHash.slice(0, 6)}…` : 'Esta vez se abrió sin código');
  await sha256('x'); add(diag.crypto === 'subtle' ? 'ok' : 'warn', 'Validación de códigos', diag.crypto === 'subtle' ? 'WebCrypto' : 'Respaldo JS (funciona igual)');
  add(navigator.mediaDevices?.getUserMedia ? 'ok' : 'bad', 'Cámara', navigator.mediaDevices?.getUserMedia ? `Disponible (${'BarcodeDetector' in window ? 'lector nativo' : 'lector jsQR'})` : 'No disponible');
  const gl = document.createElement('canvas').getContext('webgl2');
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  add(gl ? 'ok' : 'bad', 'WebGL 2', gl ? (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'Disponible') : 'No disponible');
  try { await loadThree(); add('ok', 'Motor 3D (three.js)', `r${diag.three.v} cargado en ${diag.three.ms} ms`); } catch (e) { add('bad', 'Motor 3D (three.js)', e.message); }
  try {
    const info = await fetchGLB('/models/prueba.glb');
    const { GLTFLoader, MeshoptDecoder } = await loadThree(); const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    const t = performance.now(); await new Promise((res, rej) => l.parse(info.buf.slice(0), '', res, rej));
    add('ok', 'Modelo GLB', `${(info.bytes / 1024).toFixed(0)} KB · descarga ${info.ms} ms · lectura ${Math.round(performance.now() - t)} ms`);
  } catch (e) { add('bad', 'Modelo GLB', e.message); }
  if (diag.fps) add(diag.fps >= 50 ? 'ok' : diag.fps >= 30 ? 'warn' : 'bad', 'Fluidez del visor', `${diag.fps} fps en la última figura abierta`);
  else add('info', 'Fluidez del visor', 'Abre una figura 3D y vuelve aquí para medirla');
  add('info', 'Carga inicial', `${Math.round(performance.now() - T0)} ms`);
}

// ---------- splash ----------
function splash() {
  const s = document.createElement('div'); s.className = 'splash';
  s.innerHTML = `<canvas class="flag"></canvas>
    <div class="cmp"><div class="ring">${ICON.compass.replace('class="compass"', 'style="width:100%;height:100%"').replace(/<path d="M50 6[^>]*>/, '')}</div>
      <div class="needle"><svg viewBox="0 0 100 100" style="width:100%;height:100%"><path d="M50 8 L57 50 L50 56 L43 50Z" fill="#f7d98b"/><path d="M50 92 L56 50 L50 44 L44 50Z" fill="#a8781f"/><circle cx="50" cy="50" r="4" fill="#060a18" stroke="#f7d98b" stroke-width="2"/></svg></div></div>
    <div class="logo emboss"><span class="gold-text sheen">SAM<br>PIECE</span><span class="sub gold-text">3D</span></div>
    <p class="tag">La colección privada de Samuel</p>
    <div class="cta">TOCA PARA ZARPAR</div><div class="flash"></div>`;
  document.body.appendChild(s);
  const stopFlag = waveFlag($('canvas.flag', s), EMBLEM);
  s.addEventListener('click', () => {
    unlockAudio(); requestGyro(); sfx('whoosh'); haptic('medium');
    s.classList.add('out'); try { sessionStorage.setItem('sp-splash', '1'); } catch { }
    setTimeout(() => { stopFlag(); s.remove(); }, 900);
  }, { once: true });
}

// ---------- router ----------
function go(h) { if (location.hash.slice(1) === h) route(); else location.hash = h; }
function route() {
  const h = location.hash.slice(1);
  if (scanner && h !== 'escaner') scanner.close();
  if (/^sp-[a-z0-9]{10}$/i.test(h)) { try { history.replaceState(null, '', '#coleccion'); } catch { } viewColeccion(); handleCode(h.toLowerCase()); return; }
  if (!h.startsWith('figura-') && h !== 'grupo') closeViewer();
  if (h.startsWith('carta-')) viewFicha(h.slice(6));
  else if (h === 'figura-prueba') openViewer(['/models/prueba.glb'], 'Figura de prueba');
  else if (h.startsWith('figura-')) {
    const c = S.byNum.get(h.slice(7));
    if (!c) return go('coleccion');
    if (!S.unlocked[c.num]) { toast('Primero desbloquea esta carta'); return go('carta-' + c.num); }
    openViewer(c.modelos?.length ? c.modelos.map(m => '/' + m.replace(/^\//, '')) : ['/models/prueba.glb'], c.nombre || 'Carta ' + c.num);
  }
  else if (h === 'grupo') openViewer(['/models/prueba.glb', '/models/prueba.glb', '/models/prueba.glb'], 'Escena grupal de prueba');
  else if (h === 'escaner') viewEscaner();
  else if (h === 'perfil') viewPerfil();
  else if (h === 'pruebas') viewPruebas();
  else if (h === 'muestrario') viewMuestrario();
  else if (h === 'diagnostico') viewDiagnostico();
  else viewColeccion();
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
document.addEventListener('click', e => { if (e.target.closest('.nav a')) { sfx('nav'); haptic(); } else if (e.target.closest('.card.open, .btn')) sfx('tap'); });
document.addEventListener('pointerdown', () => { unlockAudio(); requestGyro(); }, { once: true });
addEventListener('storage', e => { if (e.key === KEY) { loadProgress(); route(); } });

// ---------- arranque ----------
async function boot() {
  try {
    const r = await fetch('/cards.json'); const data = await r.json();
    S.cards = data.cartas; S.cards.forEach(c => S.byNum.set(c.num, c));
  } catch { root.innerHTML = `<div class="app"><div class="panel"><h2>Error</h2><p>No se pudo cargar la colección. Comprueba la conexión y vuelve a abrir la app.</p></div></div>`; return; }
  startBackground(document.getElementById('bg'));
  loadProgress(); askPersist();
  let seen = false; try { seen = !!sessionStorage.getItem('sp-splash'); } catch { }
  if (!location.hash && !seen) splash();
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
}
boot();
