// SAM PIECE 3D — web app independiente. El progreso se guarda en el propio teléfono.
// Rutas por fragmento: #coleccion, #carta-001, #figura-001, #escaner, #perfil, #sp-xxxxxxxxxx (QR)
// Rutas ocultas para pruebas: #pruebas, #diagnostico, #grupo

import { startBackground, pauseBackground, requestGyro, unlockAudio, sfx, haptic, isSoundOn, setSound, waveFlag } from './fx.js';

const VERSION = '0.6.0';
const KEY = 'sampiece.v1';
const $ = (s, el = document) => el.querySelector(s);
const root = document.getElementById('root');
const initialHash = location.hash;
const T0 = performance.now();
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

const S = { cards: [], byNum: new Map(), unlocked: {}, logros: {}, crew: [], mensajeFinal: null, storageOK: true, persisted: null, lastNew: null };
const diag = {};

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const count = () => Object.keys(S.unlocked).length;
const totalTxt = () => String(S.cards.length || 54).padStart(3, '0');
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
    const j = raw ? JSON.parse(raw) : {};
    S.unlocked = j.cartas || {}; S.logros = j.logros || {};
  } catch { S.storageOK = false; S.unlocked = {}; S.logros = {}; }
}
function saveProgress() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, actualizado: new Date().toISOString(), cartas: S.unlocked, logros: S.logros })); return true; }
  catch { S.storageOK = false; return false; }
}
async function askPersist() {
  try { if (navigator.storage?.persist) S.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch { }
}
// Copia de seguridad: los propios códigos de las cartas (se validan al importar)
const exportBackup = () => 'SAMPIECE1:' + Object.values(S.unlocked).filter(u => !u.p).map(u => u.c.slice(3)).sort().join('.');
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
  crew: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6M15 14.3c3.4-.4 6.5 1.6 6.5 5.2"/></svg>`,
  zoom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>`,
  flip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="17" cy="16" r="3" fill="currentColor"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M4.9 19.1l3.5-3.5M15.6 8.4l3.5-3.5"/><circle cx="12" cy="2.4" r="1" fill="currentColor"/><circle cx="12" cy="21.6" r="1" fill="currentColor"/><circle cx="2.4" cy="12" r="1" fill="currentColor"/><circle cx="21.6" cy="12" r="1" fill="currentColor"/></svg>`,
  album: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="11" height="15" rx="1.6" transform="rotate(-8 8.5 12.5)"/><rect x="9.5" y="3.5" width="11" height="15" rx="1.6" fill="rgba(6,18,34,.85)" transform="rotate(7 15 11)"/><path d="M13.6 8.6l1.2 2.3 2.5.3-1.8 1.7.4 2.5-2.3-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.3z" fill="currentColor" stroke="none" transform="rotate(7 15 11)"/></svg>`,
  captain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="rgba(232,202,133,.15)"/><path d="M5 21h14"/><circle cx="12" cy="5" r="1.2" fill="currentColor"/><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="21" cy="8" r="1" fill="currentColor"/></svg>`,
  map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/><path d="M5.5 10.5l2 1.5M11 13.5l2-2" stroke-dasharray="1.5 1.5"/></svg>`,
  museum: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>`,
  diary: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 6c-2-1.5-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5z"/><path d="M12 6v14"/><path d="M19 2.5l-3 6" stroke-width="1.4"/></svg>`,
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

// ---------- recursos gráficos ----------
// Rutas de los gráficos de la app. Los definitivos generados con ChatGPT se colocan en assets/ con estos nombres.
const ASSETS = {
  intro: '/assets/cinematicas/intro.webp',
  mapa: '/assets/mapa/mapa.webp',
  barcoInicio: '/assets/fondos/barco-inicio.webp',
  reverso: '/assets/marcos/reverso.webp',
  reversoMini: '/assets/marcos/reverso-mini.webp',
  emblema: '/assets/iconos/emblema.webp',
};
const ISLAS = [
  { n: 1, nombre: 'Isla del Origen', x: .19, y: .20 }, { n: 2, nombre: 'Isla del Volcán', x: .49, y: .17 },
  { n: 3, nombre: 'Isla Celestial', x: .83, y: .18 }, { n: 4, nombre: 'Isla de los Samuráis', x: .50, y: .30 },
  { n: 5, nombre: 'Isla Helada', x: .82, y: .33 }, { n: 6, nombre: 'Isla Pirata', x: .19, y: .33 },
  { n: 7, nombre: 'Isla del Desierto', x: .22, y: .49 }, { n: 8, nombre: 'Isla Marina', x: .23, y: .63 },
  { n: 9, nombre: 'Isla Selvática', x: .76, y: .48 }, { n: 10, nombre: 'Isla Fantasma', x: .76, y: .63 },
  { n: 11, nombre: 'Isla Industrial', x: .25, y: .78 }, { n: 12, nombre: 'Isla del Tesoro', x: .72, y: .79 },
];

// ---------- rarezas -> animación ----------
const TIERS = {
  comun: { label: 'Nueva carta', parts: 40, rays: false, shake: false, delay: 700 },
  sr: { label: 'Super Rare', parts: 140, rays: false, shake: false, delay: 1100 },
  sec: { label: 'Secret Rare', parts: 220, rays: true, shake: true, delay: 1500 },
  manga: { label: 'Manga Rare', parts: 0, rays: false, shake: true, delay: 1500, manga: true },
  samuel: { label: 'Exclusiva de Samuel', parts: 320, rays: true, shake: true, delay: 2000, gold: true },
};
const RAREZA_A_TIER = { C: 'comun', UC: 'comun', R: 'comun', L: 'sr', SR: 'sr', P: 'sr', SEC: 'sec', SP: 'sec', MR: 'manga', MANGA: 'manga', SAM: 'samuel' };
const RAREZA_NOMBRE = { C: 'Común', UC: 'Infrecuente', R: 'Rara', L: 'Leader', SR: 'Super Rare', SEC: 'Secret Rare', SP: 'Especial', P: 'Promo', MR: 'Manga Rare', MANGA: 'Manga Rare', SAM: 'Exclusiva de Samuel' };
const rarezaNombre = card => RAREZA_NOMBRE[(card.rareza || '').toUpperCase()] || card.rareza || null;
const tierOf = card => RAREZA_A_TIER[(card.rareza || '').toUpperCase()] || 'comun';

// ---------- cartas ----------
const RAREZA_CLASE = { C: 'comun', UC: 'comun', R: 'comun', L: 'sr', SR: 'sr', P: 'sr', SEC: 'sec', SP: 'sec', MR: 'manga', MANGA: 'manga', SAM: 'samuel' };
const rarityClass = card => 'r-' + (RAREZA_CLASE[(card.rareza || '').toUpperCase()] || (card.rareza ? 'sr' : 'none'));
const SAM_STARS = '<div class="stars">' + [[12, 10], [82, 18], [20, 60], [88, 66], [50, 4]].map(([x, y], i) => `<i style="left:${x}%;top:${y}%;animation-delay:${i * .45}s"></i>`).join('') + '</div>';
function cardHTML(card, { link = true, forceFront = false, isNew = false } = {}) {
  const open = forceFront || !!S.unlocked[card.num];
  const tag = link ? 'a' : 'div';
  const href = link ? ` href="#carta-${card.num}"` : '';
  if (!open) return `<${tag} class="card locked"${href} aria-label="Carta ${card.num} bloqueada"><div class="face rev dim">
    <img src="${link ? ASSETS.reversoMini : ASSETS.reverso}" alt="" decoding="async" draggable="false">
    <span class="rnum">Nº ${card.num}</span><span class="rlock">${ICON.lock}</span></div></${tag}>`;
  const name = card.nombre || `Carta ${card.num}`;
  const rc = rarityClass(card);
  if (card.imagen) { // carta con ilustración propia: la imagen es la carta entera
    const src = link && card.miniatura ? card.miniatura : card.imagen;
    return `<${tag} class="card open full ${rc}${isNew ? ' new' : ''}"${href} aria-label="${esc(name)}">${ribbon(card, link)}<div class="face front">
      <img class="cardimg" src="/${esc(src)}" alt="${esc(name)}" decoding="async" draggable="false">
      <div class="holo"></div><div class="glare"></div>${rc === 'r-samuel' ? SAM_STARS : ''}</div></${tag}>`;
  }
  return `<${tag} class="card open ${rc}${isNew ? ' new' : ''}"${href} aria-label="${esc(name)}">${ribbon(card, link)}<div class="face front">
    <div class="inner"><div class="art">${card.imagen ? `<img src="${esc(card.imagen)}" alt="">` : ICON.sil}</div>
    <div class="meta"><b>${esc(name)}</b><span>Nº ${card.num}/${totalTxt()}</span></div></div>
    ${card.rareza ? `<div class="badge">${esc(card.rareza)}</div>` : ''}
    <div class="holo"></div><div class="glare"></div><div class="edge"></div>${rc === 'r-samuel' ? SAM_STARS : ''}</div></${tag}>`;
}
function ribbon(card, link) { const u = S.unlocked[card.num]; return link && u && !u.v ? '<div class="ribbon">NUEVA</div>' : ''; }
function flipInNew() {
  const el = document.querySelector('.grid .card.new'); if (!el) return;
  const cover = document.createElement('div'); cover.className = 'flipcover';
  cover.innerHTML = `<img src="${ASSETS.reversoMini}" alt="">`; el.appendChild(cover);
  el.addEventListener('animationend', () => { cover.remove(); el.classList.remove('new'); }, { once: true });
}
function backHTML() {
  return `<div class="card"><div class="face rev"><img src="${ASSETS.reverso}" alt="" draggable="false"></div></div>`;
}

// ---------- vistas ----------
function shell(active, inner) {
  root.innerHTML = `<div class="app">
    <div class="top"><a class="brand" href="#inicio"><img class="brand-em" src="${ASSETS.emblema}" alt=""><span class="bt"><span class="bl"><span class="gold-text">SAM PIECE</span><small>3D</small></span><em>EDICIÓN PRIVADA · 001/001</em></span></a>
      <div class="top-r"><a class="icon-btn" href="#rocola" aria-label="Rocola">${ICON.music}</a><button class="icon-btn" id="snd" aria-label="Sonido">${isSoundOn() ? ICON.soundOn : ICON.soundOff}</button><div class="pill" id="cnt">${count()}/${S.cards.length}</div></div></div>
    <div id="view" class="fade-in">${inner}</div></div>
    <nav class="nav"><div class="nav-in">
      <a href="#inicio" class="${active === 'inicio' ? 'on' : ''}">${ICON.home}<span>Inicio</span></a>
      <a href="#coleccion" class="${active === 'coleccion' ? 'on' : ''}">${ICON.album}<span>Álbum</span></a>
      <a href="#escaner" class="scan-tab ${active === 'escaner' ? 'on' : ''}"><i>${ICON.scan}</i><span>Escanear</span></a>
      <a href="#tripulacion" class="${active === 'tripulacion' ? 'on' : ''}">${ICON.crew}<span>Tripulación</span></a>
      <a href="#perfil" class="${active === 'perfil' ? 'on' : ''}">${ICON.captain}<span>Capitán</span></a>
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
let sobreFiltro = null, personaFiltro = null;
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
  const visibles = personaFiltro ? S.cards.filter(c => (c.personajes || []).includes(personaFiltro)) : sobreFiltro ? S.cards.filter(c => c.sobre === sobreFiltro) : S.cards;
  shell('coleccion', `
    ${installBanner()}
    <div class="h"><h1 class="gold-text">Colección</h1><span class="sub">Doce sobres · ${total} cartas</span></div>
    <div class="progress"><div class="num gold-text">${n}<small>/${total}</small></div><div class="bar"><i style="width:${total ? (n / total * 100) : 0}%"></i></div></div>
    <a class="map-link" href="#mapa">${ICON.map}<span>Ver el Gran Mapa</span></a>
    ${sobreFiltro || personaFiltro ? `<div class="filter-note"><span>${personaFiltro ? esc(personaFiltro) : 'Sobre ' + sobreFiltro} · ${visibles.length} carta${visibles.length === 1 ? '' : 's'}</span><button class="btn ghost small" id="clearf">Ver todas</button></div>` : ''}
    ${S.storageOK ? '' : '<p><span class="tag bad">Sin guardado</span> Este navegador no permite guardar la colección (¿modo privado?).</p>'}
    <div class="grid">${visibles.map(c => cardHTML(c, { isNew: S.lastNew === c.num })).join('')}</div>`);
  flipInNew();
  const nb = $('#nob'); if (nb) nb.onclick = () => { try { sessionStorage.setItem('sp-nobanner', '1'); } catch { } $('#banner').remove(); };
  $('#clearf')?.addEventListener('click', () => { sobreFiltro = null; personaFiltro = null; sfx('tap'); viewColeccion(); });
  const map = $('#map');
  if (map) {
    const states = ISLANDS.map(is => islandState(is.n)); const cur = Math.max(0, states.findIndex(st => !st.done));
    map.scrollLeft = Math.max(0, ISLANDS[sobreFiltro ? sobreFiltro - 1 : cur].x - map.clientWidth / 2);
    map.addEventListener('click', e => {
      const g = e.target.closest('.island'); if (!g) return;
      const sb = +g.dataset.sobre; sfx('tap'); haptic();
      if (!islandState(sb).total) { toast(`El sobre ${sb} aún no tiene cartas asignadas`); return; }
      personaFiltro = null; sobreFiltro = sobreFiltro === sb ? null : sb; viewColeccion();
    });
  }
  S.lastNew = null;
}
function viewFicha(num) {
  const c = S.byNum.get(num);
  if (!c) return go('coleccion');
  const u = S.unlocked[num];
  if (u && !u.v) { u.v = 1; saveProgress(); }
  const fecha = u ? new Date(u.t).toLocaleDateString('es-ES', { dateStyle: 'long' }) : null;
  const who = (c.personajes || []).filter(Boolean);
  const firma = who.length ? who.join(', ') : 'Tu tripulación';
  shell('coleccion', `
    <div class="h"><h1 class="gold-text">Nº ${c.num}</h1><a class="btn ghost small" href="#coleccion">Volver</a></div>
    <div class="ficha">
      <div><div class="showcase" id="show"><div class="aura"></div>
        <div class="stage3d"><div class="fc" id="fc"><div class="fc-in" id="fcin">${cardHTML(c, { link: false })}
          ${u ? `<div class="card fc-back"><div class="face letter">
            <div class="l-kicker">MENSAJE PARA SAMUEL</div>
            <div class="l-body">${c.dedicatoria ? esc(c.dedicatoria) : 'Este mensaje todavía viaja en una botella a la deriva…'}</div>
            <div class="l-sign">— ${esc(firma)}</div><div class="l-seal">SP</div></div></div>` : ''}
        </div></div></div><div class="shadow"></div></div>
        ${u ? `<div class="hint-tilt">Toca la carta para darle la vuelta</div>
        <div class="tools-row">
          ${c.imagen ? `<button class="tool" id="bzoom">${ICON.zoom}<span>Ampliar</span></button><button class="tool" id="bsave">${ICON.save}<span>Guardar</span></button>` : ''}
          <button class="tool" id="bflip">${ICON.flip}<span>Mensaje</span></button>
          ${c.audio ? `<button class="tool" id="baudio">${ICON.play}<span>Nota de voz</span></button>` : ''}
        </div>
        ${c.cancion ? `<div class="panel song-panel"><h2>${ICON.music} Banda sonora${c.cancion.spotify ? '<span class="tap-hint">Dale al play ▸</span>' : ''}</h2>${songPlayer(c)}<a class="rocola-link" href="#rocola">Abrir la rocola</a></div>` : ''}` : ''}</div>
      <div>
        ${u ? `<div class="poster">
          <div class="kicker">TRIPULACIÓN SAM PIECE</div>
          <h2>RECOMPENSA</h2>
          <div class="rule"></div>
          <div class="name">${esc(c.nombre || 'Carta ' + c.num)}</div>
          <div class="bounty"><span class="coin">S</span>${c.recompensa ? esc(Number(c.recompensa).toLocaleString('es-ES')) : '¿?.???.???'}</div>
          <dl><dt>Rareza</dt><dd>${esc(rarezaNombre(c) || 'Por definir')}</dd>
          <dt>Número</dt><dd>${c.num}/${totalTxt()}</dd>
          <dt>Personajes</dt><dd>${who.length ? esc(who.join(', ')) : 'Por definir'}</dd>
          <dt>Sobre</dt><dd>${c.sobre ? 'Sobre ' + c.sobre : 'Por definir'}</dd>
          <dt>Capturada</dt><dd>${esc(fecha)}</dd></dl>
          <p class="quote">${c.frase ? '«' + esc(c.frase) + '»' : '«Frase por escribir»'}</p>
          <div class="seal">SAM<br>PIECE</div></div>
          ${c.modelos?.length ? `<a class="btn" href="#figura-${c.num}" style="width:100%;margin-top:30px">Ver figura 3D</a>` : ''}`
        : `<div class="panel"><h2>Carta bloqueada</h2><p>Encuentra esta carta en uno de tus sobres y escanea su código para desbloquearla.</p></div>
           <a class="btn" href="#escaner" style="width:100%">Escanear</a>`}
      </div></div>`);
  const show = $('#show'), fc = $('#fc'), fcin = $('#fcin');
  let drag = null, moved = false;
  show.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; moved = false; show.setPointerCapture(e.pointerId); });
  show.addEventListener('pointermove', e => {
    if (!drag) return;
    const ddx = e.clientX - drag.x, ddy = e.clientY - drag.y; if (Math.hypot(ddx, ddy) > 8) moved = true;
    const dx = Math.max(-1, Math.min(1, ddx / 120)), dy = Math.max(-1, Math.min(1, ddy / 120));
    fc.style.setProperty('--rx', (dx * 28).toFixed(1)); fc.style.setProperty('--ry', (-dy * 24).toFixed(1));
    fc.style.setProperty('--tx', dx.toFixed(2)); fc.style.setProperty('--ty', dy.toFixed(2));
  });
  const flip = () => { if (!u) return; fcin.classList.toggle('flipped'); sfx('shimmer'); haptic(); };
  const end = () => {
    if (!drag) return; drag = null;
    fc.style.transition = 'transform .6s cubic-bezier(.2,1.4,.4,1)';
    ['--rx', '--ry', '--tx', '--ty'].forEach(p => fc.style.removeProperty(p)); setTimeout(() => fc.style.transition = '', 600);
    if (!moved) flip();
  };
  show.addEventListener('pointerup', end); show.addEventListener('pointercancel', () => { drag = null; });
  $('#bflip')?.addEventListener('click', flip);
  $('#bzoom')?.addEventListener('click', () => openZoom(c));
  $('#bsave')?.addEventListener('click', () => shareCard(c));
  $('#baudio')?.addEventListener('click', () => { try { new Audio('/' + c.audio).play(); } catch { toast('No se pudo reproducir'); } });
  if (u) sfx('shimmer');
  bindSongs({ autoplay: u ? c : null });
}

// ---------- canciones ----------
const spotifyId = url => (url || '').match(/track[/:]([A-Za-z0-9]{10,})/)?.[1] || null;
const player = new Audio(); player.preload = 'none';
let playingNum = null;
player.addEventListener('ended', () => { playingNum = null; syncSongButtons(); });
player.addEventListener('timeupdate', () => { document.querySelectorAll(`.fplay[data-num="${playingNum}"] .fbar i`).forEach(i => i.style.width = (player.currentTime / (player.duration || 1) * 100) + '%'); });
function playFile(c) {
  if (playingNum === c.num && !player.paused) { player.pause(); syncSongButtons(); return; }
  if (playingNum !== c.num) { player.src = '/' + c.cancion.archivo.replace(/^\//, ''); playingNum = c.num; }
  player.play().catch(() => { }); syncSongButtons();
}
function syncSongButtons() {
  document.querySelectorAll('.fplay').forEach(b => { const on = b.dataset.num === playingNum && !player.paused; b.classList.toggle('on', on); $('.fbtn', b).innerHTML = on ? ICON.pause : ICON.play; });
}
const songMeta = c => [c.cancion.titulo, c.cancion.artista].filter(Boolean).join(' · ');
function songPlayer(c) {
  const k = c.cancion; if (!k) return '';
  const id = spotifyId(k.spotify);
  if (id) return `<div class="spot"><div class="spot-mount" data-id="${id}"><iframe src="https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0" height="152" loading="lazy" frameborder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="${esc(songMeta(c) || 'Canción')}"></iframe></div></div>
    <a class="spot-open" href="https://open.spotify.com/track/${id}" target="_blank" rel="noopener">Abrir en Spotify</a>`;
  if (k.archivo) return `<button class="fplay" data-num="${c.num}"><span class="fbtn">${ICON.play}</span><span class="fmeta"><b>${esc(k.titulo || 'Canción de la carta')}</b><small>${esc(k.artista || '')}</small><span class="fbar"><i></i></span></span></button>`;
  return '';
}
// Spotify: API oficial del reproductor integrado, para poder darle a play y pararlo
let spotApiP = null; const spotCtrls = new Set();
function spotifyApi() {
  if (!spotApiP) spotApiP = new Promise((res, rej) => {
    window.onSpotifyIframeApiReady = api => res(api);
    const s = document.createElement('script'); s.src = 'https://open.spotify.com/embed/iframe-api/v1'; s.async = true;
    s.onerror = () => { spotApiP = null; rej(new Error('spotify')); }; document.head.appendChild(s);
  });
  return spotApiP;
}
async function mountSpotify(el, autoplay) {
  try {
    const api = await spotifyApi(); if (!el.isConnected) return;
    const holder = document.createElement('div'); el.replaceChildren(holder);
    api.createController(holder, { uri: 'spotify:track:' + el.dataset.id, width: '100%', height: 152 }, ctrl => {
      if (!el.isConnected) { try { ctrl.destroy(); } catch { } return; }
      spotCtrls.add(ctrl);
      if (autoplay) { ctrl.addListener('ready', () => { try { ctrl.play(); } catch { } }); }
    });
  } catch { /* se queda el reproductor normal */ }
}
function stopMusic() {
  try { player.pause(); } catch { } playingNum = null;
  for (const c of spotCtrls) { try { c.pause(); c.destroy(); } catch { } }
  spotCtrls.clear(); syncSongButtons();
}
// iPhone: el primer toque "desbloquea" el reproductor para que luego pueda sonar solo
const SILENCIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
document.addEventListener('pointerdown', () => { if (player.src) return; player.src = SILENCIO; player.play().then(() => player.pause()).catch(() => { }); }, { once: true });
function bindSongs({ autoplay = null } = {}) {
  document.querySelectorAll('.fplay').forEach(b => b.onclick = () => { const c = S.byNum.get(b.dataset.num); if (c) playFile(c); });
  document.querySelectorAll('.song-panel .spot-mount').forEach(el => mountSpotify(el, !!autoplay));
  if (autoplay?.cancion?.archivo) { if (playingNum !== autoplay.num || player.paused) playFile(autoplay); }
  syncSongButtons();
}
function viewRocola() {
  const withSong = S.cards.filter(c => c.cancion);
  const mine = withSong.filter(c => S.unlocked[c.num]);
  shell('coleccion', `
    <div class="h"><h1 class="gold-text">Rocola</h1><span class="sub">${mine.length}/${withSong.length || S.cards.length} canciones</span></div>
    <p class="muted" style="margin-top:-6px">Cada carta trae su canción. Desbloquéalas para llenar la rocola del barco.</p>
    <div class="jukebox">${S.cards.map(c => {
      const u = S.unlocked[c.num];
      if (!u || !c.cancion) return `<div class="track locked"><span class="tn">${c.num}</span><span class="tt"><b>${u ? esc(c.nombre || 'Carta ' + c.num) : '???'}</b><small>${u ? 'Canción por elegir' : 'Canción bloqueada'}</small></span></div>`;
      return `<details class="track"><summary><span class="tn">${c.num}</span>
        <span class="tthumb">${c.miniatura || c.imagen ? `<img src="/${esc(c.miniatura || c.imagen)}" alt="">` : ''}</span>
        <span class="tt"><b>${esc(c.cancion.titulo || c.nombre || 'Carta ' + c.num)}</b><small>${esc(c.cancion.artista || c.nombre || '')}</small></span></summary>
        <div class="tbody">${songPlayer(c)}</div></details>`;
    }).join('')}</div>`);
  bindSongs();
  // carga el reproductor solo al abrir cada canción
  document.querySelectorAll('details.track').forEach(d => d.addEventListener('toggle', () => { if (d.open) { sfx('tap'); const m = $('.spot-mount', d); if (m && !m.dataset.on) { m.dataset.on = 1; mountSpotify(m, true); } } }));
}

// ---------- inicio ----------
function islaEstado(n) {
  const st = islandState(n);
  if (st.done) return 'conquistada';
  if (st.started || n === 1) return 'descubierta';
  return 'bloqueada';
}
function viewInicio() {
  const n = count(), total = S.cards.length, ti = titulo(n);
  const pct = total ? (n / total * 100) : 0;
  const ultima = S.cards.filter(c => S.unlocked[c.num]).sort((a, b) => S.unlocked[b.num].t.localeCompare(S.unlocked[a.num].t))[0];
  const exploradas = ISLAS.filter(i => islaEstado(i.n) !== 'bloqueada').length;
  shell('inicio', `
    ${installBanner()}
    <p class="greet">${n ? 'La aventura continúa, Samuel' : 'Tu aventura comienza, Samuel'}</p>
    <div class="ornate home-progress">
      <div class="hp-main"><span class="hp-k">Progreso de la colección</span>
        <div class="hp-num"><b class="gold-text">${n}</b><small>/ ${total}</small><em>${pct.toFixed(1).replace('.', ',')}%</em></div>
        <div class="bar"><i style="width:${pct}%"></i></div></div>
      <a class="rank" href="#perfil"><div class="rank-medal">${MEDAL_ICO.anchor}</div><span>${esc(ti.t)}</span></a>
    </div>
    <a class="ornate ship-card" href="#mapa">
      <img src="${ASSETS.barcoInicio}" alt="" decoding="async">
      <div class="ship-info"><span>${exploradas}/12 islas exploradas</span><b class="btn">Explorar el mapa</b></div>
    </a>
    <div class="quick">
      <a href="#coleccion" class="q"><i>${ICON.album}</i><span>Mi colección</span></a>
      <a href="#museo" class="q"><i>${ICON.museum}</i><span>Museo 3D</span></a>
      <a href="#tripulacion" class="q"><i>${ICON.crew}</i><span>Tripulación</span></a>
      <a href="#diario" class="q"><i>${ICON.diary}</i><span>Diario</span></a>
    </div>
    ${ultima ? `<a class="ornate last-card" href="#carta-${ultima.num}"><div class="lc-img">${cardHTML(ultima, { link: false })}</div>
      <div><span class="hp-k">Última carta conseguida</span><b>${esc(ultima.nombre || 'Carta ' + ultima.num)}</b><small>${esc(rarezaNombre(ultima) || 'Nº ' + ultima.num)} · Nº ${ultima.num}</small></div></a>` : ''}`);
  const nb = $('#nob'); if (nb) nb.onclick = () => { try { sessionStorage.setItem('sp-nobanner', '1'); } catch { } $('#banner').remove(); };
}

// ---------- el gran mapa ----------
function viewMapa() {
  const estados = ISLAS.map(i => islaEstado(i.n));
  const actual = ISLAS[Math.max(0, estados.findIndex(e => e !== 'conquistada'))] || ISLAS[11];
  const exploradas = estados.filter(e => e !== 'bloqueada').length;
  shell('inicio', `
    <div class="h"><h1 class="gold-text">El Gran Mapa</h1><a class="btn ghost small" href="#inicio">Volver</a></div>
    <p class="map-sub">12 islas · ${S.cards.length} cartas · un tesoro</p>
    <div class="bigmap ornate"><div class="bm-in">
      <img src="${ASSETS.mapa}" alt="Mapa de las 12 islas" decoding="async">
      ${ISLAS.map((i, k) => `<button class="isle ${estados[k]}" data-n="${i.n}" style="left:${i.x * 100}%;top:${i.y * 100}%" aria-label="${esc(i.nombre)}">
        <span class="fogc"></span>${estados[k] === 'conquistada' ? `<span class="flag">${MEDAL_ICO.crown}</span>` : ''}<span class="iname">${esc(i.nombre)}</span></button>`).join('')}
      <div class="ship-pin" style="left:${actual.x * 100}%;top:${actual.y * 100}%"><svg viewBox="0 0 48 40"><path d="M4 26h40l-6 10H10z" fill="#6b4a1c" stroke="#E8CA85" stroke-width="1.5"/><path d="M23 4v22" stroke="#E8CA85" stroke-width="2"/><path d="M24 6c10 3 14 9 12 17H24z" fill="#f4f2ec"/><path d="M22 8c-8 3-11 8-10 14h10z" fill="#E8D5AF"/><path d="M23 4h9l-2 3 2 3h-9z" fill="#061222"/></svg></div>
    </div></div>
    <div class="ornate isles-count"><span>Islas exploradas</span><b class="gold-text">${exploradas} / 12</b></div>`);
  $('.bigmap').addEventListener('click', e => { const b = e.target.closest('.isle'); if (b) { sfx('tap'); haptic(); showIsla(+b.dataset.n); } });
}
function showIsla(n) {
  const i = ISLAS[n - 1], st = islandState(n), est = islaEstado(n);
  const cards = S.cards.filter(c => c.sobre === n);
  const d = document.createElement('div'); d.className = 'sheet-wrap';
  d.innerHTML = `<div class="sheet ornate"><div class="sheet-grip"></div>
    <span class="hp-k">Sobre ${n}</span><h3 class="gold-text">${esc(i.nombre)}</h3>
    <p class="st-${est}">${est === 'conquistada' ? 'Conquistada: tienes todas sus cartas' : est === 'descubierta' ? (st.total ? `Descubierta · ${st.got}/${st.total} cartas` : 'Descubierta') : 'Cubierta por la niebla: abre su sobre para descubrirla'}</p>
    ${cards.length ? `<div class="sheet-cards">${cards.map(c => cardHTML(c)).join('')}</div>` : '<p class="muted">Las cartas de este sobre aún no están asignadas.</p>'}
    <button class="btn ghost small" data-x>Cerrar</button></div>`;
  document.body.appendChild(d);
  requestAnimationFrame(() => d.classList.add('in'));
  const close = () => { d.classList.remove('in'); setTimeout(() => d.remove(), 300); };
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]') || e.target.closest('.card')) close(); });
}

// ---------- museo 3D (preparado) ----------
function viewMuseo() {
  const conFigura = S.cards.filter(c => S.unlocked[c.num] && c.modelos?.length);
  shell('inicio', `
    <div class="h"><h1 class="gold-text">Museo 3D</h1><a class="btn ghost small" href="#inicio">Volver</a></div>
    <div class="museum ornate">
      <div class="m-cols"><i></i><i></i></div>
      <div class="m-ped"><div class="m-top"></div><div class="m-base"></div></div>
      <div class="m-text">${conFigura.length ? `${conFigura.length} figura${conFigura.length === 1 ? '' : 's'} en exposición` : 'La sala está preparada. Las figuras llegarán aquí cuando sus cartas tengan modelo 3D.'}</div>
    </div>
    ${conFigura.length ? `<div class="m-pick">${conFigura.map(c => `<a href="#figura-${c.num}" class="m-thumb">${cardHTML(c, { link: false })}</a>`).join('')}</div>` : ''}`);
}

// ---------- diario de recuerdos (preparado) ----------
function viewDiario() {
  const R = S.recuerdos || [];
  shell('inicio', `
    <div class="h"><h1 class="gold-text">Diario</h1><a class="btn ghost small" href="#inicio">Volver</a></div>
    <div class="diary">
      <div class="d-cover"><span>Diario de la</span><b>Tripulación</b></div>
      ${R.length ? R.map(r => `<article class="d-page">
        ${r.foto ? `<img src="/${esc(r.foto)}" alt="" loading="lazy">` : ''}
        <h3>${esc(r.titulo || '')}</h3>${r.fecha ? `<small>${esc(r.fecha)}</small>` : ''}<p>${esc(r.texto || '')}</p>
        ${r.audio ? `<button class="btn ghost small" data-audio="${esc(r.audio)}">Escuchar</button>` : ''}</article>`).join('')
      : `<article class="d-page"><h3>Primeras páginas en blanco</h3><p>Aquí irán vuestras anécdotas, fotos, dedicatorias y mensajes de voz. Cada recuerdo será una página de este diario.</p></article>`}
    </div>`);
  document.querySelectorAll('[data-audio]').forEach(b => b.onclick = () => { try { new Audio('/' + b.dataset.audio).play(); } catch { } });
}

// ---------- ampliar con zoom ----------
function openZoom(c) {
  const z = document.createElement('div'); z.className = 'zoom';
  z.innerHTML = `<img src="/${esc(c.imagen)}" alt="" draggable="false"><div class="bar3d"><button class="btn ghost small" data-a="close">Cerrar</button><span class="muted">Pellizca para ampliar</span></div>`;
  document.body.appendChild(z); pauseBackground(true);
  const img = $('img', z); let sc = 1, tx = 0, ty = 0; const pts = new Map(); let pinch = null, lastTap = 0;
  const apply = () => { img.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`; };
  const clamp = () => { sc = Math.max(1, Math.min(5, sc)); const mx = (sc - 1) * innerWidth / 2, my = (sc - 1) * innerHeight / 2; tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty)); };
  z.addEventListener('pointerdown', e => {
    if (e.target.closest('[data-a]')) return;
    z.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), sc }; }
    const now = Date.now(); if (pts.size === 1 && now - lastTap < 300) { sc = sc > 1 ? 1 : 2.5; tx = ty = 0; img.style.transition = 'transform .3s'; apply(); setTimeout(() => img.style.transition = '', 300); } lastTap = now;
  });
  z.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; sc = pinch.sc * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; }
    else if (pts.size === 1 && sc > 1) { tx += e.clientX - prev.x; ty += e.clientY - prev.y; }
    clamp(); apply();
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
  z.addEventListener('click', e => { if (e.target.closest('[data-a="close"]')) { z.remove(); pauseBackground(false); } });
}
async function shareCard(c) {
  const name = c.nombre || 'Carta ' + c.num;
  try {
    const b = await (await fetch('/' + c.imagen)).blob();
    const f = new File([b], `SAM-PIECE-${c.num}.${(b.type.split('/')[1] || 'webp')}`, { type: b.type });
    if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: `SAM PIECE · ${name}` });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  } catch (e) { if (e?.name !== 'AbortError') toast('No se pudo guardar la imagen'); }
}

// ---------- tripulación ----------
function crewStats(name) {
  const cards = S.cards.filter(c => (c.personajes || []).includes(name));
  const got = cards.filter(c => S.unlocked[c.num]);
  const face = got.find(c => c.miniatura || c.imagen);
  return { total: cards.length, got: got.length, face, done: cards.length > 0 && got.length === cards.length };
}
function viewTripulacion() {
  const list = S.crew.map(n => ({ n, ...crewStats(n) }));
  const met = list.filter(m => m.got > 0).length;
  shell('tripulacion', `
    <div class="h"><h1 class="gold-text">Tripulación</h1><span class="sub">${met}/${list.length} reclutados</span></div>
    <div class="crew">${list.map(m => `
      <button class="mate${m.got ? ' met' : ''}${m.done ? ' done' : ''}" data-n="${esc(m.n)}">
        <div class="avatar">${m.face ? `<img src="/${esc(m.face.miniatura || m.face.imagen)}" alt="">` : `<span>${m.got ? esc(m.n[0]) : '?'}</span>`}</div>
        <b>${esc(m.n)}</b>
        <span class="mc">${m.total ? `${m.got}/${m.total} carta${m.total === 1 ? '' : 's'}` : 'Cartas por asignar'}</span>
        ${m.done ? '<i class="done-tag">COMPLETO</i>' : ''}
      </button>`).join('')}</div>`);
  $('.crew').addEventListener('click', e => {
    const b = e.target.closest('.mate'); if (!b) return;
    const st = crewStats(b.dataset.n);
    if (!st.total) { toast('Aún no hay cartas asignadas a ' + b.dataset.n); return; }
    personaFiltro = b.dataset.n; sobreFiltro = null; go('coleccion');
  });
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
    if (S.modoPruebas && /^0\d+$/.test(v)) { const c = S.byNum.get(String(parseInt(v, 10)).padStart(3, '0')); if (c) return unlockTest(c);
      const m = $('#codemsg'); m.className = 'msg bad'; m.textContent = 'No existe esa carta.'; return; }
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
  const ti = titulo(n);
  const sobres = ISLANDS.filter(is => islandState(is.n).done).length;
  const logrosHechos = LOGROS.filter(l => S.logros[l.id]).length;
  const bit = S.cards.filter(c => S.unlocked[c.num]).sort((a, b) => S.unlocked[b.num].t.localeCompare(S.unlocked[a.num].t));
  shell('perfil', `
    <div class="captain">
      <div class="cap-emblem"><img src="${ASSETS.emblema}" alt="Emblema SAM PIECE"></div>
      <div class="cap-k">CAPITÁN SAMUEL</div>
      <div class="cap-t gold-text emboss">${esc(ti.t)}</div>
      <div class="cap-stats"><div><b class="gold-text">${n}</b><span>Cartas</span></div><div><b class="gold-text">${sobres}</b><span>Sobres</span></div><div><b class="gold-text">${logrosHechos}</b><span>Logros</span></div></div>
      ${ti.next ? `<div class="cap-next"><div class="bar"><i style="width:${Math.round((n - ti.from) / (ti.next[0] - ti.from) * 100)}%"></i></div>
        <span>${ti.next[0] - n} carta${ti.next[0] - n === 1 ? '' : 's'} para ser <b>${esc(ti.next[1])}</b></span></div>` : '<div class="cap-next"><span>Has completado la colección</span></div>'}
      ${n === total && total ? '<button class="btn" id="btreasure" style="margin-top:14px">Abrir el tesoro final</button>' : ''}
    </div>
    <div class="panel"><h2>Logros</h2><div class="medals">${LOGROS.map(l => {
      const ok = !!S.logros[l.id];
      return `<div class="medal${ok ? ' ok' : ''}"><div class="m-ico">${ok || !l.secreto ? MEDAL_ICO[l.ico] : '?'}</div>
        <b>${ok || !l.secreto ? esc(l.t) : 'Logro secreto'}</b><span>${ok || !l.secreto ? esc(l.d) : 'Sigue explorando…'}</span></div>`;
    }).join('')}</div></div>
    <div class="panel"><h2>Bitácora</h2>${bit.length ? `<ol class="log">${bit.map(c => `<li><a href="#carta-${c.num}">
      <span class="ld">${esc(new Date(S.unlocked[c.num].t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))}</span>
      <span class="lt">${esc(c.nombre || 'Carta ' + c.num)}</span><span class="lr">${esc(rarezaNombre(c) || 'Nº ' + c.num)}</span></a></li>`).join('')}</ol>`
      : '<p class="muted">Aquí quedará el diario de tu viaje: cada carta que consigas, con su fecha.</p>'}</div>
    <div class="panel"><h2>Copia de seguridad</h2>
      <p>Guarda este texto (por ejemplo, en Notas). Si cambias de móvil, pégalo abajo para recuperar tus cartas. También puedes volver a escanearlas.</p>
      <textarea id="bk" readonly>${n ? esc(exportBackup()) : 'Aún no tienes cartas.'}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn small" id="bcopy"${n ? '' : ' disabled'}>Copiar</button></div>
      <h2 style="margin-top:16px">Recuperar colección</h2>
      <textarea id="bi" placeholder="Pega aquí tu copia SAMPIECE1:…"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn ghost small" id="bimp">Recuperar</button></div><div class="msg" id="bmsg"></div></div>
    <p class="muted" style="text-align:center;font-size:14px">SAM PIECE · v${VERSION}</p>`);
  $('#btreasure')?.addEventListener('click', () => showTreasure());
  $('#bcopy').onclick = async () => { try { await navigator.clipboard.writeText(exportBackup()); toast('Copia guardada en el portapapeles'); } catch { $('#bk').select(); toast('Selecciona y copia el texto'); } };
  $('#bimp').onclick = async () => {
    const m = $('#bmsg'); const r = await importBackup($('#bi').value);
    if (!r.total) { m.className = 'msg bad'; m.textContent = 'No se encontró ninguna copia en el texto.'; return; }
    checkLogros(true);
    m.className = 'msg ok'; m.textContent = `${r.added} carta${r.added === 1 ? '' : 's'} recuperada${r.added === 1 ? '' : 's'}${r.bad ? ` · ${r.bad} código${r.bad === 1 ? '' : 's'} no válido${r.bad === 1 ? '' : 's'}` : ''}.`;
    $('#cnt').textContent = `${count()}/${S.cards.length}`;
  };
}

// ---------- títulos y logros ----------
function titulo(n) {
  const total = S.cards.length || 54;
  const T = [[0, 'Grumete'], [5, 'Marinero'], [15, 'Contramaestre'], [25, 'Navegante'], [35, 'Primer oficial'], [45, 'Capitán'], [total, 'Rey de SAM PIECE']];
  let cur = T[0]; for (const t of T) if (n >= t[0]) cur = t;
  return { t: cur[1], from: cur[0], next: T.find(t => t[0] > n) || null };
}
const MEDAL_ICO = {
  anchor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/></svg>',
  ship: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 15h18l-3 5H6zM12 3v12M12 4l7 9h-7M11 6l-5 7h5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>',
  island: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 19c3-2 6-2 10-2s7 0 10 2M12 17V8M12 8c-3-1-6 0-7 3M12 8c3-1 6 0 7 3M12 8c-1-3-4-4-6-4"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6M15 14.3c3.4-.4 6.5 1.6 6.5 5.2"/></svg>',
  gem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l3 18 3-18"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
};
const unlockedCards = () => S.cards.filter(c => S.unlocked[c.num]);
const hasClass = k => unlockedCards().some(c => rarityClass(c) === 'r-' + k);
const LOGROS = [
  { id: 'primera', ico: 'anchor', t: 'Primer tesoro', d: 'Consigue tu primera carta', ok: () => count() >= 1 },
  { id: 'cinco', ico: 'ship', t: 'Tripulación en marcha', d: 'Consigue 5 cartas', ok: () => count() >= 5 },
  { id: 'quince', ico: 'star', t: 'Rumbo fijo', d: 'Consigue 15 cartas', ok: () => count() >= 15 },
  { id: 'mitad', ico: 'ship', t: 'Mitad del viaje', d: 'Consigue la mitad de la colección', ok: () => count() >= Math.ceil(S.cards.length / 2) },
  { id: 'todas', ico: 'crown', t: 'Rey de SAM PIECE', d: 'Completa la colección', ok: () => count() >= S.cards.length },
  { id: 'isla', ico: 'island', t: 'Isla conquistada', d: 'Completa un sobre', ok: () => ISLANDS.some(is => islandState(is.n).done) },
  { id: 'archipielago', ico: 'island', t: 'Archipiélago', d: 'Completa 3 sobres', ok: () => ISLANDS.filter(is => islandState(is.n).done).length >= 3 },
  { id: 'amigo', ico: 'people', t: 'Amigo al completo', d: 'Todas las cartas de un amigo', ok: () => S.crew.some(n => { const st = crewStats(n); return st.total >= 2 && st.done; }) },
  { id: 'tripulacion', ico: 'people', t: 'Tripulación reunida', d: 'Al menos una carta de cada amigo', ok: () => { const w = S.crew.map(crewStats).filter(st => st.total > 0); return w.length >= 2 && w.every(st => st.got > 0); } },
  { id: 'secreto', ico: 'gem', t: 'Secreto revelado', d: 'Consigue una Secret Rare', ok: () => hasClass('sec') },
  { id: 'manga', ico: 'gem', t: 'Viñeta legendaria', d: 'Consigue una Manga Rare', ok: () => hasClass('manga') },
  { id: 'exclusiva', ico: 'crown', t: 'Hecha para ti', d: 'Consigue una Exclusiva de Samuel', ok: () => hasClass('samuel') },
  { id: 'noche', ico: 'moon', t: 'Pirata nocturno', d: 'Desbloquea una carta entre las 00:00 y las 05:00', secreto: true, ok: () => unlockedCards().some(c => new Date(S.unlocked[c.num].t).getHours() < 5) },
  { id: 'abordaje', ico: 'bolt', t: 'Día de abordaje', d: 'Consigue 3 cartas el mismo día', secreto: true, ok: () => { const k = {}; return unlockedCards().some(c => (k[S.unlocked[c.num].t.slice(0, 10)] = (k[S.unlocked[c.num].t.slice(0, 10)] || 0) + 1) >= 3); } },
];
function checkLogros(silent = false) {
  const nuevos = [];
  for (const l of LOGROS) if (!S.logros[l.id] && l.ok()) { S.logros[l.id] = new Date().toISOString(); nuevos.push(l); }
  if (nuevos.length) saveProgress();
  return silent ? [] : nuevos;
}
let logroChain = Promise.resolve();
function logroToast(l) {
  logroChain = logroChain.then(() => new Promise(res => {
    const t = document.createElement('div'); t.className = 'logro';
    t.innerHTML = `<div class="m-ico">${MEDAL_ICO[l.ico]}</div><div><small>LOGRO DESBLOQUEADO</small><b></b><span></span></div>`;
    $('b', t).textContent = l.t; $('span', t).textContent = l.d;
    document.body.appendChild(t); sfx('shimmer'); haptic('medium');
    setTimeout(() => t.classList.add('out'), 2900); setTimeout(() => { t.remove(); res(); }, 3400);
  }));
  return logroChain;
}

// ---------- celebraciones ----------
function confettiOverlay(o, gold = false) {
  const cv = document.createElement('canvas'); o.prepend(cv);
  const ctx = cv.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const cols = gold ? ['#fff3c4', '#f7d98b', '#e8b54a', '#c8922c'] : ['#f7d98b', '#e8b54a', '#ff5d6c', '#4fd18b', '#2dd2ff', '#f4f2ec'];
  const P = Array.from({ length: 140 }, () => ({ x: Math.random() * cv.width, y: -Math.random() * cv.height, w: (4 + Math.random() * 6) * dpr, h: (8 + Math.random() * 8) * dpr,
    v: (1.5 + Math.random() * 3) * dpr, r: Math.random() * 6, vr: (Math.random() - .5) * .2, sx: Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
  let raf; const f = t => { ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of P) { p.y += p.v; p.r += p.vr; p.x += Math.sin(t / 400 + p.sx) * dpr; if (p.y > cv.height) { p.y = -20; p.x = Math.random() * cv.width; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r))); ctx.restore(); }
    raf = requestAnimationFrame(f); };
  raf = requestAnimationFrame(f);
  return () => cancelAnimationFrame(raf);
}
function showIsland(n) {
  return new Promise(res => {
    const is = ISLANDS[n - 1];
    const o = document.createElement('div'); o.className = 'celebrate';
    o.innerHTML = `<div class="cel-in"><svg viewBox="0 0 240 170" class="cel-island">
        <defs><radialGradient id="cg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f7d98b" stop-opacity=".8"/><stop offset="1" stop-color="#f7d98b" stop-opacity="0"/></radialGradient>
        <radialGradient id="ci" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#4f8a5e"/><stop offset="1" stop-color="#1c3324"/></radialGradient></defs>
        <ellipse cx="120" cy="100" rx="115" ry="70" fill="url(#cg)"/>
        <path d="${islandPath(120, 110, 48, is.seed)}" fill="#d9c08a"/><path d="${islandPath(120, 104, 42, is.seed)}" fill="url(#ci)" stroke="#f7d98b" stroke-width="2"/>
        <path d="M128 98V50" stroke="#e8b54a" stroke-width="3"/><path class="cel-flag" d="M128 50h34l-8 9 8 9h-34z" fill="#05070f" stroke="#e8b54a" stroke-width="1.5"/>
        <circle cx="140" cy="59" r="5" fill="#f4f2ec"/></svg>
      <div class="cel-k">ISLA CONQUISTADA</div><div class="cel-t gold-text emboss">¡SOBRE ${n} COMPLETADO!</div>
      <p>Has reunido todas las cartas de este sobre.</p><button class="btn">Continuar</button></div>`;
    document.body.appendChild(o); const stop = confettiOverlay(o); sfx('epic'); haptic('heavy');
    $('.btn', o).onclick = () => { stop(); o.remove(); res(); };
  });
}
function showTreasure() {
  return new Promise(res => {
    const o = document.createElement('div'); o.className = 'celebrate treasure';
    o.innerHTML = `<div class="cel-in">
      <div class="chest"><div class="glow"></div><div class="lid"></div><div class="box"><i class="lock"></i></div></div>
      <div class="cel-k">TESORO FINAL</div><div class="cel-t gold-text emboss">¡COLECCIÓN COMPLETA!</div>
      <div class="final-msg">${S.mensajeFinal ? esc(S.mensajeFinal).replace(/\n/g, '<br>') : 'Samuel: has reunido a toda tu tripulación. Este tesoro guarda un mensaje de todos nosotros… (pendiente de escribir)'}</div>
      <button class="btn">Cerrar</button></div>`;
    document.body.appendChild(o); sfx('build');
    setTimeout(() => { o.classList.add('open'); sfx('epic'); haptic('heavy'); o._stop = confettiOverlay(o, true); }, 1300);
    $('.btn', o).onclick = () => { o._stop?.(); o.remove(); res(); };
  });
}
async function afterUnlock(card) {
  const nuevos = checkLogros();
  if (card.sobre && islandState(card.sobre).done) await showIsland(card.sobre);
  if (count() === S.cards.length) await showTreasure();
  for (const l of nuevos) logroToast(l);
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
    <div class="panel"><h2>Celebraciones</h2><div class="row"><button class="btn ghost small" id="tisla">Sobre completado</button><button class="btn ghost small" id="ttes">Tesoro final</button><button class="btn ghost small" id="tlog">Logro</button></div></div>
    <div class="panel"><h2>Rarezas</h2><p>Muestra de los cinco marcos de carta.</p><a class="btn ghost small" href="#muestrario">Ver muestrario</a></div>
    <div class="panel"><h2>3D</h2><div class="row"><a class="btn ghost small" href="#figura-prueba">Figura de prueba</a><a class="btn ghost small" href="#grupo">Escena grupal</a></div></div>
    <div class="panel"><h2>Diagnóstico</h2><a class="btn ghost small" href="#diagnostico">Abrir diagnóstico</a></div>
    <div class="panel"><h2>Reiniciar</h2><p>Las cartas abiertas con código de prueba (0 + número) se guardan aparte.</p>
      <div class="row"><button class="btn ghost small" id="ttest">Borrar cartas de prueba</button><button class="btn ghost small" id="treset">Reiniciar todo</button></div></div>`);
  $('#tprev').onclick = () => {
    const tier = $('#ttier').value, rz = { comun: 'C', sr: 'SR', sec: 'SEC', manga: 'MR', samuel: 'SAM' }[tier];
    playUnlock({ ...S.byNum.get($('#tnum').value), rareza: rz }, tier, { preview: true });
  };
  $('#ttest').onclick = () => { let n = 0; for (const k of Object.keys(S.unlocked)) if (S.unlocked[k].p) { delete S.unlocked[k]; n++; }
    S.logros = {}; checkLogros(true); saveProgress(); toast(`${n} carta${n === 1 ? '' : 's'} de prueba borrada${n === 1 ? '' : 's'}`); };
  $('#tisla').onclick = () => showIsland(3);
  $('#ttes').onclick = () => showTreasure();
  $('#tlog').onclick = () => logroToast(LOGROS[0]);
  $('#treset').onclick = async () => {
    if (!(await dialog({ title: 'Reiniciar progreso', body: 'Se borrarán todas las cartas desbloqueadas de este teléfono.', ok: 'Reiniciar', cancel: 'Cancelar' }))) return;
    S.unlocked = {}; S.logros = {}; saveProgress(); toast('Progreso reiniciado'); viewPruebas();
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
  await afterUnlock(card);
}

// Desbloqueo de prueba (código 0 + número): marcado aparte para poder borrarlo sin tocar el progreso real
async function unlockTest(card) {
  if (S.unlocked[card.num]) { toast('Ya tenías esta carta en tu colección'); return go('carta-' + card.num); }
  S.unlocked[card.num] = { t: new Date().toISOString(), c: 'prueba', p: 1 };
  saveProgress(); S.lastNew = card.num;
  await playUnlock(card, tierOf(card));
  await afterUnlock(card);
}

// ---------- animación de desbloqueo ----------
const listJoin = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
function playUnlock(card, tierKey, { preview = false } = {}) {
  return new Promise(resolve => {
    const T = TIERS[tierKey] || TIERS.comun;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const who = (card.personajes || []).filter(Boolean);
    const line = who.length ? `¡${listJoin(who)} ${who.length > 1 ? 'se unen' : 'se une'} a tu tripulación!` : '¡Nueva carta para tu colección!';
    const HOLD = T.gold ? 1700 : T.rays || T.manga ? 1400 : 1000;
    const o = document.createElement('div'); o.className = 'unlock' + (T.manga ? ' manga' : '') + (T.gold ? ' gold' : '');
    o.innerHTML = `<canvas></canvas><div class="stage hover"><div class="flip">${backHTML()}${cardHTML(card, { link: false, forceFront: true }).replace('class="card', 'class="card f')}</div></div>
      <div class="hold"><div class="hold-bar"><i></i></div><span>Mantén pulsado para revelar</span></div>
      <div class="label">${esc(preview ? T.label : (rarezaNombre(card) || T.label))}<small>Nº ${card.num}/${totalTxt()}</small><em>${esc(line)}</em></div>
      <div class="actions">${preview ? '<button class="btn" data-a="close">Cerrar</button>' : `<button class="btn ghost" data-a="ficha">Ver ficha</button><button class="btn" data-a="col">Colección</button>`}</div>`;
    document.body.appendChild(o);
    const cv = $('canvas', o), ctx = cv.getContext('2d'), stage = $('.stage', o), barI = $('.hold-bar i', o);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const resize = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    resize(); addEventListener('resize', resize);
    let parts = [], opened = false, raf, holding = false, p = 0, last = performance.now(), openedAt = 0, tick = 0;
    const cx = () => cv.width / 2, cy = () => cv.height * 0.38;
    const burst = n => {
      n = reduce ? Math.min(n, 30) : n;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 9) * dpr;
        parts.push({ x: cx(), y: cy(), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2 * dpr, life: 1, r: (1 + Math.random() * 3) * dpr, g: .12,
          c: T.gold || Math.random() < .6 ? `hsl(${40 + Math.random() * 12},95%,${60 + Math.random() * 25}%)` : `hsl(${Math.random() * 360},90%,75%)` });
      }
    };
    const reveal = () => {
      opened = true; openedAt = performance.now(); stage.style.transform = ''; o.classList.add('revealed');
      $('.flip', o).classList.add('open'); burst(T.parts || 60);
      sfx(T.manga ? 'manga' : T.gold || T.rays ? 'epic' : 'reveal'); haptic(T.shake ? 'heavy' : 'medium');
      if (T.shake && !reduce) { o.classList.add('shake'); setTimeout(() => o.classList.remove('shake'), 500); }
      if (T.gold) setTimeout(() => burst(T.parts / 2), 450);
      $('.label', o).classList.add('show'); $('.actions', o).classList.add('show');
      if (!preview && card.cancion?.archivo) setTimeout(() => playFile(card), T.gold ? 900 : 500);
    };
    const frame = t => {
      const dt = Math.min(t - last, 50); last = t;
      if (!opened) {
        p = holding ? Math.min(1, p + dt / HOLD) : Math.max(0, p - dt / 500);
        barI.style.width = (p * 100).toFixed(1) + '%';
        const amp = p * p * 7;
        stage.style.transform = amp ? `translate(${(Math.random() - .5) * amp}px,${(Math.random() - .5) * amp}px) scale(${1 + p * .06})` : '';
        stage.style.filter = `drop-shadow(0 0 ${10 + p * 40}px rgba(247,217,139,${.25 + p * .6}))`;
        const q = Math.floor(p * 4); if (holding && q > tick) { tick = q; haptic(); } if (!holding && p === 0) tick = 0;
        if (holding && Math.random() < .35 + p) { // la luz se concentra en la carta
          const a = Math.random() * 6.283, r = (180 + Math.random() * 160) * dpr;
          parts.push({ x: cx() + Math.cos(a) * r, y: cy() + Math.sin(a) * r, vx: -Math.cos(a) * r / 40, vy: -Math.sin(a) * r / 40, life: .9, r: 1.6 * dpr, g: 0, c: '#f7d98b' });
        }
        if (p >= 1) reveal();
      }
      const el = opened ? t - openedAt : 0;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (T.manga && opened) {
        ctx.save(); ctx.translate(cx(), cy()); ctx.fillStyle = '#050505';
        for (let i = 0; i < 90; i++) { const a = i / 90 * Math.PI * 2 + (i % 3) * .01, w = .006 + (i % 5) * .002, r0 = 170 * dpr;
          ctx.beginPath(); ctx.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0); ctx.lineTo(Math.cos(a) * 2000, Math.sin(a) * 2000); ctx.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0); ctx.fill(); }
        ctx.restore();
      } else {
        const g = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), 320 * dpr);
        g.addColorStop(0, `rgba(232,181,74,${opened ? .55 : p * .45})`); g.addColorStop(1, 'rgba(232,181,74,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
        if (T.rays && !reduce && (opened || p > .3)) {
          ctx.save(); ctx.translate(cx(), cy()); ctx.rotate(t / 3000);
          for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.fillStyle = `rgba(247,217,139,${opened ? .10 : p * .08})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40 * dpr, -1400 * dpr); ctx.lineTo(40 * dpr, -1400 * dpr); ctx.fill(); }
          ctx.restore();
        }
      }
      parts = parts.filter(q => (q.life -= .014) > 0);
      for (const q of parts) { q.x += q.vx; q.y += q.vy; q.vy += q.g * dpr; q.vx *= .985; ctx.globalAlpha = q.life; ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const down = e => { if (opened || e.target.closest('[data-a]')) return; holding = true; if (p === 0) sfx('build'); if (reduce) reveal(); };
    const upH = () => { holding = false; };
    o.addEventListener('pointerdown', down); o.addEventListener('pointerup', upH); o.addEventListener('pointercancel', upH); o.addEventListener('pointerleave', upH);
    o.addEventListener('contextmenu', e => e.preventDefault());
    o.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      cancelAnimationFrame(raf); removeEventListener('resize', resize); o.remove();
      if (a === 'ficha') go('carta-' + card.num); else if (a === 'col') go('coleccion');
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

// ---------- intro cinematográfica ----------
function splash() {
  const s = document.createElement('div'); s.className = 'intro';
  s.innerHTML = `<div class="intro-art"><img src="${ASSETS.intro}" alt="" decoding="async">
      <span class="lantern"></span><span class="moonglow"></span><span class="seashine"></span><canvas class="sparks"></canvas></div>
    <div class="intro-ui">
      <button class="btn intro-go">Comenzar mi aventura</button>
      <div class="intro-row"><button class="intro-sea" aria-label="Sonido del mar">${ICON.soundOff}<span>Sonido del mar</span></button>
        <label class="intro-skip"><input type="checkbox" id="noint"> No mostrar la intro al abrir</label></div>
    </div><div class="flash"></div>`;
  document.body.appendChild(s);
  pauseBackground(true);
  // destellos de estrellas sobre la ilustración
  const cv = $('canvas.sparks', s), ctx = cv.getContext('2d'); const dpr = Math.min(devicePixelRatio || 1, 2);
  const art = $('.intro-art', s); let raf, stars = [];
  const size = () => { cv.width = art.clientWidth * dpr; cv.height = art.clientHeight * dpr; stars = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random() * .45, p: Math.random() * 6.28, s: .6 + Math.random() * 1.6 })); };
  const loop = t => { ctx.clearRect(0, 0, cv.width, cv.height);
    for (const st of stars) { const a = Math.max(0, Math.sin(t / 900 * st.s + st.p)); if (a < .2) continue; ctx.globalAlpha = a * .9; ctx.fillStyle = '#fff6dc';
      const x = st.x * cv.width, y = st.y * cv.height, r = (1 + a * 1.5) * dpr; ctx.beginPath(); ctx.moveTo(x, y - r * 2); ctx.lineTo(x + r * .4, y); ctx.lineTo(x, y + r * 2); ctx.lineTo(x - r * .4, y); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 2, y); ctx.lineTo(x, y + r * .4); ctx.lineTo(x + r * 2, y); ctx.lineTo(x, y - r * .4); ctx.fill(); }
    ctx.globalAlpha = 1; raf = requestAnimationFrame(loop); };
  $('img', s).addEventListener('load', size); size(); raf = requestAnimationFrame(loop);
  // sonido del mar (opcional)
  let sea = null;
  $('.intro-sea', s).onclick = e => { e.stopPropagation(); unlockAudio();
    if (sea) { sea.stop(); sea = null; $('.intro-sea', s).innerHTML = ICON.soundOff + '<span>Sonido del mar</span>'; }
    else { sea = seaSound(); $('.intro-sea', s).innerHTML = ICON.soundOn + '<span>Sonido del mar</span>'; } };
  $('.intro-go', s).onclick = () => {
    unlockAudio(); requestGyro(); sfx('whoosh'); haptic('medium');
    try { if ($('#noint', s).checked) localStorage.setItem('sp-nointro', '1'); sessionStorage.setItem('sp-splash', '1'); } catch { }
    s.classList.add('out'); sea?.fade();
    setTimeout(() => { cancelAnimationFrame(raf); s.remove(); pauseBackground(false); }, 1000);
  };
}
// olas sintetizadas: ruido filtrado que sube y baja
function seaSound() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ac.createGain(); g.gain.value = 0.0;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.12; const lg = ac.createGain(); lg.gain.value = 0.22;
    lfo.connect(lg); lg.connect(g.gain); src.connect(f); f.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(0.3, ac.currentTime + 1.5);
    src.start(); lfo.start();
    return { stop: () => { try { ac.close(); } catch { } }, fade: () => { try { g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.9); setTimeout(() => ac.close(), 1000); } catch { } } };
  } catch { return null; }
}

// ---------- router ----------
function go(h) { if (location.hash.slice(1) === h) route(); else location.hash = h; }
let lastRoute = null;
function route() {
  const h = location.hash.slice(1);
  if (h !== lastRoute) { if (h !== 'carta-' + playingNum) stopMusic(); lastRoute = h; }
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
  else if (h === 'tripulacion') viewTripulacion();
  else if (h === 'rocola') viewRocola();
  else if (h === 'coleccion') viewColeccion();
  else if (h === 'mapa') viewMapa();
  else if (h === 'museo') viewMuseo();
  else if (h === 'diario') viewDiario();
  else if (h === 'pruebas') viewPruebas();
  else if (h === 'muestrario') viewMuestrario();
  else if (h === 'diagnostico') viewDiagnostico();
  else viewInicio();
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
    S.modoPruebas = !!data.modoPruebas; S.crew = data.tripulacion || []; S.mensajeFinal = data.mensajeFinal || null; S.recuerdos = data.recuerdos || [];
  } catch { root.innerHTML = `<div class="app"><div class="panel"><h2>Error</h2><p>No se pudo cargar la colección. Comprueba la conexión y vuelve a abrir la app.</p></div></div>`; return; }
  startBackground(document.getElementById('bg'));
  loadProgress(); askPersist(); checkLogros(true);
  let seen = false; try { seen = !!sessionStorage.getItem('sp-splash'); } catch { }
  let noIntro = false; try { noIntro = !!localStorage.getItem('sp-nointro'); } catch { }
  if (!location.hash && !seen && !noIntro) splash();
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
}
boot();
