/* ==========================================================================
   DOODLE OUTPOST — HD TACTICAL EDITION
   Canvas renderer (High-DPI), combat FX, WebAudio, PeerJS multiplayer
   ========================================================================== */
'use strict';

// ==========================================================================
// 0. HELPERS
// ==========================================================================
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (dt, rate) => 1 - Math.exp(-rate * dt);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TRANSPARENT_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// localStorage can throw (Safari private mode / blocked storage) — never let it crash the game.
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* ignore */ } }
};

const COARSE_POINTER = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const PREFERS_REDUCED_MOTION = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
if (COARSE_POINTER || 'ontouchstart' in window) document.body.classList.add('touch');
const isTouchUI = () => document.body.classList.contains('touch');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

// ==========================================================================
// 1. GAME DATA — 9 SOLDIERS, 10 WEAPONS/CRATES, 3 GRENADES, FX, PROPS
// ==========================================================================
const CHARACTERS = [
  { id: 0, name: 'Desert Medic',  file: './assets/char1.png' },
  { id: 1, name: 'Stealth Wing',  file: './assets/char2.png' },
  { id: 2, name: 'Vanguard',      file: './assets/char3.png' },
  { id: 3, name: 'Recon Sniper',  file: './assets/char4.png' },
  { id: 4, name: 'Snow Trooper',  file: './assets/char5.png' },
  { id: 5, name: 'Night Ops',     file: './assets/char6.png' },
  { id: 6, name: 'Iron Beard',    file: './assets/char7.png' },
  { id: 7, name: 'Red Bandana',   file: './assets/char8.png' },
  { id: 8, name: 'Riot Shielder', file: './assets/char9.png' }
];

/*
  WEAPON TABLE
  NOTE: `file` is the sprite that actually *shows* that weapon. Your art files are numbered
  differently from the old table (weap1.png is the Uzi, weap9.png is the Riot Shield, etc.)
  so the file -> weapon mapping is corrected here. Paths themselves are unchanged.
  speed  = px per frame @60fps (converted to px/s internally)
  mag    = magazine size (0 = no ammo needed). Reserve ammo is unlimited (∞).
  dw     = on-screen draw width of the held sprite, grip = distance from body centre.
*/
const WEAPONS = [
  { id: 0, name: 'RIOT SHIELD',  file: './assets/weap9.png',  sound: './sounds/w1_shield.mp3',     rate: 140,  speed: 0,  damage: 18, spread: 0,    count: 1, color: '#38bdf8', type: 'shield',     mag: 0, reload: 0,    dw: 30, grip: 14, kick: 0,   shake: 0.04, sfx: { voices: 1, gap: 240, maxDur: 0.5 } },
  { id: 1, name: 'DUAL UZIS',    file: './assets/weap1.png',  sound: './sounds/w2_uzi.mp3',        rate: 85,   speed: 18, damage: 13, spread: 0.09, count: 2, color: '#facc15', type: 'bullet',     mag: 40, reload: 1.25, dw: 36, grip: 6,  kick: 8,   shake: 0.07, casing: 'small', sfx: { voices: 3, gap: 55,  maxDur: 0.38 } },
  { id: 2, name: 'DESERT EAGLE', file: './assets/weap2.png',  sound: './sounds/w3_deagle.mp3',     rate: 250,  speed: 22, damage: 35, spread: 0.02, count: 1, color: '#fde047', type: 'bullet',     mag: 8,  reload: 1.05, dw: 30, grip: 8,  kick: 40,  shake: 0.2,  casing: 'med',   sfx: { voices: 2, gap: 90,  maxDur: 0.8 } },
  { id: 3, name: 'SNIPER RIFLE', file: './assets/weap3.png',  sound: './sounds/w4_sniper.mp3',     rate: 620,  speed: 34, damage: 85, spread: 0.0,  count: 1, color: '#7dd3fc', type: 'sniper',     mag: 5,  reload: 1.7,  dw: 66, grip: 2,  kick: 95,  shake: 0.62, casing: 'rifle', sfx: { voices: 2, gap: 200, maxDur: 1.4 }, tracerW: 2.6 },
  { id: 4, name: 'CHAINSAW',     file: './assets/weap6.png',  sound: './sounds/w5_chainsaw.mp3',   rate: 120,  speed: 0,  damage: 25, spread: 0,    count: 1, color: '#ef4444', type: 'melee',      mag: 0, reload: 0,    dw: 44, grip: 8,  kick: 0,   shake: 0.05, sfx: { voices: 1, gap: 380, maxDur: 0.7 } },
  { id: 5, name: 'SHOTGUN',      file: './assets/weap4.png',  sound: './sounds/w6_shotgun.mp3',    rate: 500,  speed: 17, damage: 16, spread: 0.24, count: 6, color: '#fef08a', type: 'bullet',     mag: 6,  reload: 1.5,  dw: 54, grip: 4,  kick: 140, shake: 0.5,  casing: 'shell', sfx: { voices: 2, gap: 160, maxDur: 1.2 } },
  { id: 6, name: 'ROCKET RPG',   file: './assets/weap5.png',  sound: './sounds/w7_rocket.mp3',     rate: 820,  speed: 14, damage: 95, spread: 0.02, count: 1, color: '#fb923c', type: 'rocket',     mag: 3,  reload: 1.8,  dw: 56, grip: 2,  kick: 110, shake: 0.45, sfx: { voices: 2, gap: 250, maxDur: 1.5 } },
  { id: 7, name: 'AMMO CRATE',   file: './assets/weap7.png',  sound: './sounds/w8_ammo_crate.mp3', rate: 1500, speed: 0,  damage: 0,  spread: 0,    count: 1, color: '#facc15', type: 'ammo_boost', mag: 0, reload: 0,    dw: 24, grip: 16, kick: 0,   shake: 0,    sfx: { voices: 1, gap: 400, maxDur: 1.2 } },
  { id: 8, name: 'GEAR CRATE',   file: './assets/weap8.png',  sound: './sounds/w9_gear_crate.mp3', rate: 1500, speed: 0,  damage: 0,  spread: 0,    count: 1, color: '#38bdf8', type: 'armor_boost',mag: 0, reload: 0,    dw: 24, grip: 16, kick: 0,   shake: 0,    sfx: { voices: 1, gap: 400, maxDur: 1.2 } },
  { id: 9, name: 'MEDKIT BOX',   file: './assets/weap10.png', sound: './sounds/w10_medkit.mp3',    rate: 900,  speed: 0,  damage: 0,  spread: 0,    count: 1, color: '#22c55e', type: 'heal',       mag: 0, reload: 0,    dw: 24, grip: 16, kick: 0,   shake: 0,    sfx: { voices: 1, gap: 400, maxDur: 1.2 } }
];
const UTILITY_TYPES = { heal: 1, ammo_boost: 1, armor_boost: 1 };
const BOT_WEAPONS = [1, 2, 3, 5, 6];

const GRENADE_TYPES = [
  { id: 0, label: 'FRAG',  name: 'FRAG GRENADE', file: './assets/grenade_frag.png' },
  { id: 1, label: 'GAS',   name: 'GREEN GAS',    file: './assets/grenade_gas.png' },
  { id: 2, label: 'SMOKE', name: 'SMOKE SCREEN', file: './assets/grenade_smoke.png' }
];

// mode: 'key' = remove white background (flood fill)   'soft' = luminance-alpha (smoke / dust)
const FX_FILES = {
  smokeWhite: { file: './assets/fx_smoke_white.png', max: 320, mode: 'soft', lighten: 0.55 },
  smokeGreen: { file: './assets/fx_smoke_green.png', max: 320, mode: 'soft', lighten: 0.0 },
  explosion:  { file: './assets/fx_explosion.png',   max: 384, mode: 'key' },
  sparks:     { file: './assets/fx_sparks.png',      max: 192, mode: 'key' },
  fire:       { file: './assets/fx_fire.png',        max: 224, mode: 'key' },
  dust:       { file: './assets/fx_dust.png',        max: 288, mode: 'soft', lighten: 0.0 },
  muzzle:     { file: './assets/fx_muzzle.png',      max: 192, mode: 'key' }
};

const PROP_FILES = {
  bunker: './assets/prop_bunker.png', tower: './assets/prop_tower.png',
  crate: './assets/prop_crate.png', door: './assets/prop_door.png',
  sandbag: './assets/prop_sandbag.png', catwalk: './assets/prop_catwalk.png',
  pipes: './assets/prop_pipes.png', container: './assets/prop_container.png',
  cave: './assets/prop_cave.png'
};
// Which props stop bullets / rockets, and what they sound / spark like. Set PROPS_BLOCK_BULLETS=false for the old "decorative only" behaviour.
const PROPS_BLOCK_BULLETS = true;
const PROP_INFO = {
  container: { solid: true, mat: 'metal' }, bunker: { solid: true, mat: 'metal' }, pipes: { solid: true, mat: 'metal' },
  door: { solid: true, mat: 'metal' }, catwalk: { solid: true, mat: 'metal' },
  crate: { solid: true, mat: 'wood' }, sandbag: { solid: true, mat: 'sand' },
  tower: { solid: false, mat: 'wood' }, cave: { solid: false, mat: 'rock' }
};

// ==========================================================================
// 2. 10 MAPS  (platform / spawn data unchanged)
//    Map image names are tried in order, so both `map1.png.jpeg` AND `map1.png` work.
// ==========================================================================
const WORLD = { width: 2400, height: 1200 };
const BORDER_PLATFORMS = [
  { x: 0, y: 0, w: 2400, h: 30 }, { x: 0, y: 1160, w: 2400, h: 40 },
  { x: 0, y: 0, w: 30, h: 1200 }, { x: 2370, y: 0, w: 30, h: 1200 }
];

function mapFiles(n, doubleExtFirst) {
  const a = `./assets/map${n}.png.jpeg`, b = `./assets/map${n}.png`;
  return (doubleExtFirst ? [a, b] : [b, a]).concat([`./assets/map${n}.jpeg`, `./assets/map${n}.jpg`, `./assets/map${n}.webp`]);
}

const MAPS = [
  {
    id: 0, name: 'Desert Outpost', files: mapFiles(1, true),
    platforms: [
      { x: 180, y: 495, w: 940, h: 26 }, { x: 1760, y: 475, w: 580, h: 26 },
      { x: 840, y: 785, w: 710, h: 24 }, { x: 1560, y: 745, w: 520, h: 24 },
      { x: 30, y: 980, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'sandbag', x: 320, y: 455, w: 120, h: 42 },
      { kind: 'crate', x: 920, y: 735, w: 68, h: 52 },
      { kind: 'tower', x: 2080, y: 265, w: 150, h: 210 }
    ],
    spawns: [{ x: 350, y: 420 }, { x: 1950, y: 400 }, { x: 1150, y: 710 }, { x: 600, y: 900 }, { x: 1800, y: 900 }, { x: 1200, y: 900 }]
  },
  {
    id: 1, name: 'Underground Bunker', files: mapFiles(2, true),
    platforms: [
      { x: 120, y: 585, w: 1180, h: 26 }, { x: 1520, y: 445, w: 620, h: 22 },
      { x: 1620, y: 635, w: 680, h: 26 }, { x: 810, y: 830, w: 840, h: 24 },
      { x: 30, y: 1030, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'door', x: 720, y: 445, w: 130, h: 140 },
      { kind: 'pipes', x: 1950, y: 255, w: 120, h: 190 },
      { kind: 'crate', x: 420, y: 535, w: 68, h: 52 }
    ],
    spawns: [{ x: 350, y: 510 }, { x: 1820, y: 370 }, { x: 1180, y: 750 }, { x: 450, y: 950 }, { x: 1950, y: 950 }, { x: 1200, y: 950 }]
  },
  {
    id: 2, name: 'Abandoned Scrapyard', files: mapFiles(3, true),
    platforms: [
      { x: 60, y: 530, w: 580, h: 26 }, { x: 860, y: 555, w: 540, h: 22 },
      { x: 1760, y: 525, w: 580, h: 26 }, { x: 1060, y: 815, w: 560, h: 24 },
      { x: 30, y: 1020, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'container', x: 220, y: 420, w: 180, h: 110 },
      { kind: 'catwalk', x: 1120, y: 755, w: 180, h: 65 },
      { kind: 'crate', x: 1880, y: 475, w: 68, h: 52 }
    ],
    spawns: [{ x: 300, y: 450 }, { x: 1120, y: 480 }, { x: 2020, y: 450 }, { x: 700, y: 940 }, { x: 1650, y: 940 }, { x: 1250, y: 740 }]
  },
  {
    id: 3, name: 'Jungle River Camp', files: mapFiles(4, false),
    platforms: [
      { x: 180, y: 575, w: 420, h: 24 }, { x: 640, y: 455, w: 420, h: 24 },
      { x: 1060, y: 475, w: 360, h: 20 }, { x: 1420, y: 445, w: 820, h: 26 },
      { x: 1360, y: 735, w: 640, h: 24 }, { x: 30, y: 940, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'tower', x: 1440, y: 235, w: 140, h: 210 },
      { kind: 'sandbag', x: 1580, y: 405, w: 120, h: 42 },
      { kind: 'crate', x: 340, y: 525, w: 68, h: 52 }
    ],
    spawns: [{ x: 360, y: 500 }, { x: 840, y: 380 }, { x: 1850, y: 370 }, { x: 1650, y: 660 }, { x: 750, y: 860 }, { x: 1250, y: 860 }]
  },
  {
    id: 4, name: 'Catacombs Mine', files: mapFiles(5, false),
    platforms: [
      { x: 60, y: 545, w: 860, h: 26 }, { x: 920, y: 435, w: 640, h: 20 },
      { x: 1560, y: 425, w: 440, h: 26 }, { x: 1860, y: 615, w: 480, h: 26 },
      { x: 30, y: 990, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'cave', x: 1080, y: 810, w: 220, h: 180 },
      { kind: 'crate', x: 260, y: 495, w: 68, h: 52 },
      { kind: 'pipes', x: 2050, y: 435, w: 110, h: 180 }
    ],
    spawns: [{ x: 350, y: 470 }, { x: 1220, y: 360 }, { x: 1760, y: 350 }, { x: 550, y: 910 }, { x: 1850, y: 910 }, { x: 1200, y: 910 }]
  },
  {
    id: 5, name: 'Arctic Snow Base', files: mapFiles(6, false),
    platforms: [
      { x: 1520, y: 345, w: 680, h: 26 }, { x: 420, y: 515, w: 880, h: 26 },
      { x: 1880, y: 615, w: 460, h: 26 }, { x: 480, y: 745, w: 780, h: 24 },
      { x: 30, y: 980, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'bunker', x: 1620, y: 205, w: 160, h: 140 },
      { kind: 'sandbag', x: 1920, y: 575, w: 120, h: 42 },
      { kind: 'crate', x: 680, y: 465, w: 68, h: 52 }
    ],
    spawns: [{ x: 1820, y: 270 }, { x: 750, y: 440 }, { x: 2080, y: 540 }, { x: 820, y: 670 }, { x: 1550, y: 900 }, { x: 1200, y: 900 }]
  },
  {
    id: 6, name: 'Reactor Core', files: mapFiles(7, false),
    platforms: [
      { x: 60, y: 545, w: 940, h: 26 }, { x: 1120, y: 455, w: 1180, h: 26 },
      { x: 960, y: 775, w: 780, h: 22 }, { x: 60, y: 895, w: 660, h: 26 },
      { x: 1680, y: 885, w: 660, h: 26 }, { x: 30, y: 1120, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'pipes', x: 240, y: 355, w: 120, h: 190 },
      { kind: 'catwalk', x: 1220, y: 715, w: 180, h: 65 },
      { kind: 'door', x: 2140, y: 495, w: 120, h: 140 }
    ],
    spawns: [{ x: 450, y: 470 }, { x: 1650, y: 380 }, { x: 1320, y: 700 }, { x: 350, y: 820 }, { x: 1950, y: 810 }, { x: 1200, y: 1040 }]
  },
  {
    id: 7, name: 'Bio-Hazard Lab', files: mapFiles(8, false),
    platforms: [
      { x: 60, y: 555, w: 840, h: 26 }, { x: 680, y: 445, w: 1040, h: 24 },
      { x: 1520, y: 555, w: 820, h: 26 }, { x: 420, y: 835, w: 1560, h: 24 },
      { x: 30, y: 1120, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'door', x: 980, y: 315, w: 120, h: 130 },
      { kind: 'crate', x: 240, y: 505, w: 68, h: 52 },
      { kind: 'pipes', x: 2150, y: 365, w: 110, h: 190 }
    ],
    spawns: [{ x: 420, y: 480 }, { x: 1180, y: 370 }, { x: 1920, y: 480 }, { x: 1180, y: 760 }, { x: 550, y: 1040 }, { x: 1850, y: 1040 }]
  },
  {
    id: 8, name: 'Mountain Helipad', files: mapFiles(9, false),
    platforms: [
      { x: 1320, y: 365, w: 720, h: 26 }, { x: 960, y: 485, w: 460, h: 24 },
      { x: 1280, y: 635, w: 480, h: 26 }, { x: 340, y: 695, w: 640, h: 26 },
      { x: 940, y: 755, w: 760, h: 22 }, { x: 30, y: 1030, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'bunker', x: 420, y: 555, w: 160, h: 140 },
      { kind: 'sandbag', x: 640, y: 655, w: 120, h: 42 },
      { kind: 'crate', x: 1520, y: 315, w: 68, h: 52 }
    ],
    spawns: [{ x: 1650, y: 290 }, { x: 1500, y: 560 }, { x: 620, y: 620 }, { x: 1280, y: 680 }, { x: 750, y: 950 }, { x: 1850, y: 950 }]
  },
  {
    id: 9, name: 'Maximum Prison', files: mapFiles(10, true),
    platforms: [
      { x: 60, y: 465, w: 1040, h: 22 }, { x: 60, y: 635, w: 1040, h: 22 },
      { x: 1720, y: 495, w: 620, h: 24 }, { x: 1940, y: 685, w: 420, h: 22 },
      { x: 30, y: 990, w: 2340, h: 40 }
    ],
    props: [
      { kind: 'tower', x: 960, y: 255, w: 130, h: 210 },
      { kind: 'tower', x: 1920, y: 285, w: 130, h: 210 },
      { kind: 'sandbag', x: 1180, y: 950, w: 130, h: 42 }
    ],
    spawns: [{ x: 450, y: 390 }, { x: 450, y: 560 }, { x: 2020, y: 420 }, { x: 2120, y: 610 }, { x: 850, y: 910 }, { x: 1550, y: 910 }]
  }
];


// ==========================================================================
// 3. HD SPRITE PIPELINE (downscale -> remove white background -> crop -> cache)
//    The raw art is 2048x2048 / 1600x1600. Keeping those decoded would use ~600 MB on a phone,
//    so every sprite is converted once into a small, crisp, transparent canvas.
// ==========================================================================
function halveTo(img, tw, th) {
  let src = img;
  let sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  const temps = [];
  while (sw / 2 >= tw && sh / 2 >= th) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw / 2)); c.height = Math.max(1, Math.round(sh / 2));
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, c.width, c.height);
    src = c; sw = c.width; sh = c.height; temps.push(c);
  }
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(tw)); out.height = Math.max(1, Math.round(th));
  const og = out.getContext('2d', { willReadFrequently: true });
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(src, 0, 0, out.width, out.height);
  temps.forEach((c) => { c.width = 1; c.height = 1; }); // free GPU/CPU memory immediately
  return out;
}

function keyBackground(canvas, mode, lighten) {
  const w = canvas.width, h = canvas.height, n = w * h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const im = g.getImageData(0, 0, w, h);
  const d = im.data;
  const minc = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = d[p], gg = d[p + 1], b = d[p + 2];
    minc[i] = r < gg ? (r < b ? r : b) : (gg < b ? gg : b);
  }

  if (mode === 'soft') {
    // Smoke / dust: transparency from "how far from white", optional lightening.
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      let a = (252 - minc[i]) / 95; a = a < 0 ? 0 : a > 1 ? 1 : a;
      a = Math.sqrt(a);
      d[p + 3] = (a * 255) | 0;
      if (lighten > 0) for (let k = 0; k < 3; k++) d[p + k] = d[p + k] + (255 - d[p + k]) * lighten;
    }
  } else {
    // Flood fill from the borders so white *inside* artwork (snow suits, highlights) is preserved.
    const LOW = 205, HIGH = 249;
    const inR = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const push = (i) => { if (!inR[i] && minc[i] >= LOW) { inR[i] = 1; stack[sp++] = i; } };
    const flood = () => {
      while (sp > 0) {
        const i = stack[--sp], x = i % w;
        if (x > 0) push(i - 1);
        if (x < w - 1) push(i + 1);
        if (i >= w) push(i - w);
        if (i < n - w) push(i + w);
      }
    };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    flood();

    // Enclosed white gaps (tower legs, cave openings, grenade ring) — props & grenades only.
    if (mode === 'keyholes') {
      const seen = new Uint8Array(n);
      const comp = new Int32Array(n);
      for (let s = 0; s < n; s++) {
        if (inR[s] || seen[s] || minc[s] < 238) continue;
        let cnt = 0;
        stack[sp++] = s; seen[s] = 1;
        while (sp > 0) {
          const i = stack[--sp]; comp[cnt++] = i;
          const x = i % w;
          const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1];
          for (let k = 0; k < 4; k++) { const j = nb[k]; if (j >= 0 && !seen[j] && !inR[j] && minc[j] >= 238) { seen[j] = 1; stack[sp++] = j; } }
        }
        if (cnt >= 45) for (let q = 0; q < cnt; q++) inR[comp[q]] = 1;
      }
    }

    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (!inR[i]) continue;
      let a = (HIGH - minc[i]) / (HIGH - LOW); a = a < 0 ? 0 : a > 1 ? 1 : a;
      if (a < 1) {
        const ac = a < 0.2 ? 0.2 : a; // un-blend the white fringe so edges do not glow
        for (let k = 0; k < 3; k++) {
          const c = (d[p + k] - 255 * (1 - ac)) / ac;
          d[p + k] = c < 0 ? 0 : c > 255 ? 255 : c;
        }
      }
      d[p + 3] = (a * 255) | 0;
    }
  }
  g.putImageData(im, 0, 0);
}

function contentBounds(canvas, alphaMin) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > alphaMin) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Returns a tightly-cropped transparent canvas (with .aspect) whose longest side is <= maxDim. */
function processSprite(img, o) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const work = Math.min(Math.max(o.maxDim, 384), 640);
  const sc = Math.min(1, work / Math.max(iw, ih));
  const wc = halveTo(img, Math.round(iw * sc), Math.round(ih * sc));
  keyBackground(wc, o.mode || 'key', o.lighten || 0);
  let b = { x: 0, y: 0, w: wc.width, h: wc.height };
  if (o.crop !== false) b = contentBounds(wc, 12);
  const fs = Math.min(1, o.maxDim / Math.max(b.w, b.h));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(b.w * fs)); out.height = Math.max(1, Math.round(b.h * fs));
  const og = out.getContext('2d');
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(wc, b.x, b.y, b.w, b.h, 0, 0, out.width, out.height);
  wc.width = 1; wc.height = 1;
  out.aspect = out.width / out.height;
  return out;
}

function canvasToUrl(c, maxDim) {
  try {
    let src = c;
    const m = Math.max(c.width, c.height);
    if (m > maxDim) {
      const s = maxDim / m;
      src = document.createElement('canvas');
      src.width = Math.max(1, Math.round(c.width * s)); src.height = Math.max(1, Math.round(c.height * s));
      const g = src.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(c, 0, 0, src.width, src.height);
    }
    return src.toDataURL('image/png');
  } catch (e) { return TRANSPARENT_GIF; }
}

const Assets = {
  chars: [], weapons: [], grenades: [], fx: {}, props: {},
  thumbs: { chars: [], weapons: [], grenades: [] },
  maps: [], mapPromises: [], failed: [], ready: false
};
const SPRITES = Assets; // short alias used by the renderer: SPRITES.chars[i], SPRITES.fx.muzzle ...

function loadImage(src, timeout = 20000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    let done = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(t); img.onload = img.onerror = null; resolve(v); };
    const t = setTimeout(() => finish(null), timeout);
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = src;
  });
}

async function loadImageAny(candidates) {
  for (const c of candidates) {
    const img = await loadImage(c);
    if (img) return img;
  }
  return null;
}

/** Lazy per-map loader. Handles `map1.png.jpeg` vs `map1.png` automatically. */
function ensureMap(id) {
  if (Assets.maps[id]) return Promise.resolve(Assets.maps[id]);
  if (!Assets.mapPromises[id]) {
    Assets.mapPromises[id] = loadImageAny(MAPS[id].files).then((img) => {
      if (img) Assets.maps[id] = img; else Assets.failed.push('map ' + (id + 1));
      return img;
    });
  }
  return Assets.mapPromises[id];
}

// ==========================================================================
// 4. AUDIO — WebAudio engine (no clip leaks, polyphony limits, graceful errors)
// ==========================================================================
/** The sound files may contain an invisible leading character (U+200B etc.), so try every variant. */
function soundCandidates(path) {
  const i = path.lastIndexOf('/');
  const dir = path.slice(0, i + 1), file = path.slice(i + 1);
  return [dir + '%E2%80%8B' + file, dir + file, dir + '%23U200b' + file, dir + '%EF%BB%BF' + file, dir + '%E2%80%8C' + file, dir + '%E2%80%8D' + file];
}

const AudioSys = {
  ctx: null, bus: null, sfxBus: null, musicBus: null, noise: null,
  buffers: [], state: [], active: 0, unlocked: false,
  sfxOn: store.get('do_sfx') !== 'false',
  musicOn: store.get('do_music') === 'true',
  musicTimer: null, missing: 0,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.bus = this.ctx.createGain(); this.bus.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.bus.connect(comp); comp.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.bus);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.8; this.musicBus.connect(this.bus);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },

  decode(buf) {
    return new Promise((res, rej) => {
      try { const p = this.ctx.decodeAudioData(buf, res, rej); if (p && p.catch) p.catch(rej); } catch (e) { rej(e); }
    });
  },

  async loadOne(idx) {
    if (!this.ctx) return false;
    for (const url of soundCandidates(WEAPONS[idx].sound)) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        this.buffers[idx] = await this.decode(ab);
        return true;
      } catch (e) { /* try next filename variant */ }
    }
    this.missing++;
    return false; // game falls back to a synthesized sound for this weapon
  },

  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.unlocked) {
      this.unlocked = true;
      try { const s = this.ctx.createBufferSource(); s.buffer = this.ctx.createBuffer(1, 1, 22050); s.connect(this.ctx.destination); s.start(0); } catch (e) { /* ignore */ }
      if (this.musicOn) this.startMusic();
    }
  },

  setSfx(on) { this.sfxOn = on; store.set('do_sfx', on); },
  setMusic(on) { this.musicOn = on; store.set('do_music', on); if (on) this.startMusic(); else this.stopMusic(); },

  // ---- weapon one-shots ---------------------------------------------------
  playWeapon(idx, vol, pan) {
    if (!this.sfxOn || !this.ctx || this.ctx.state !== 'running' || vol <= 0.03) return;
    const wp = WEAPONS[idx];
    if (!wp) return;
    const cfg = wp.sfx || { voices: 3, gap: 50, maxDur: 0 };
    const st = this.state[idx] || (this.state[idx] = { voices: [], last: -1 });
    const now = this.ctx.currentTime;
    if (now - st.last < cfg.gap / 1000) return;
    const buf = this.buffers[idx];
    if (!buf) { this.synth(wp.type === 'melee' ? 'saw' : UTILITY_TYPES[wp.type] ? 'pickup' : wp.type === 'rocket' ? 'heavy' : wp.type === 'sniper' ? 'heavy' : 'shot', vol, pan); st.last = now; return; }
    if (this.active > 26) return;
    if (st.voices.length >= cfg.voices) { // steal the oldest voice with a tiny fade (no clicks)
      const old = st.voices.shift();
      try { old.g.gain.cancelScheduledValues(now); old.g.gain.setTargetAtTime(0, now, 0.012); old.src.stop(now + 0.06); } catch (e) { /* already ended */ }
    }
    st.last = now;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + rand(-0.035, 0.035);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    let tail = g, pn = null;
    if (pan && this.ctx.createStereoPanner) { pn = this.ctx.createStereoPanner(); pn.pan.value = clamp(pan, -1, 1); g.connect(pn); tail = pn; }
    tail.connect(this.sfxBus);
    const voice = { src, g };
    st.voices.push(voice);
    this.active++;
    src.onended = () => {
      this.active--;
      const i = st.voices.indexOf(voice); if (i >= 0) st.voices.splice(i, 1);
      try { src.disconnect(); g.disconnect(); if (pn) pn.disconnect(); } catch (e) { /* ignore */ }
    };
    src.start(now);
    if (cfg.maxDur) { // long clips (chainsaw / shield) are trimmed so they never pile up
      g.gain.setValueAtTime(vol, now + cfg.maxDur * 0.65);
      g.gain.linearRampToValueAtTime(0, now + cfg.maxDur);
      src.stop(now + cfg.maxDur + 0.03);
    }
  },

  // ---- synthesized fallbacks + extra combat sounds -------------------------
  synth(kind, vol = 1, pan = 0) {
    if (!this.sfxOn || !this.ctx || this.ctx.state !== 'running' || this.active > 30 || vol <= 0.02) return;
    const c = this.ctx, t = c.currentTime;
    const out = c.createGain(); out.gain.value = vol;
    let tail = out;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); out.connect(p); tail = p; }
    tail.connect(this.sfxBus);
    const nodes = [out];
    let ends = 0, total = 0;
    const done = () => { if (++ends >= total) { this.active--; nodes.forEach((n) => { try { n.disconnect(); } catch (e) { /* ignore */ } }); } };
    const noiseBurst = (dur, type, f0, f1, peak) => {
      total++;
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(out); nodes.push(s, f, g);
      s.onended = done; s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    };
    const tone = (type, f0, f1, dur, peak, delay = 0) => {
      total++;
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t + delay); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      const g = c.createGain(); g.gain.setValueAtTime(peak, t + delay); g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      o.connect(g); g.connect(out); nodes.push(o, g);
      o.onended = done; o.start(t + delay); o.stop(t + delay + dur + 0.02);
    };
    this.active++;
    switch (kind) {
      case 'shot':  noiseBurst(0.1, 'bandpass', 2400, 900, 0.9); tone('sine', 150, 50, 0.1, 0.7); break;
      case 'heavy': noiseBurst(0.3, 'lowpass', 2200, 300, 1.0); tone('sine', 110, 35, 0.28, 0.9); break;
      case 'boom':  noiseBurst(0.75, 'lowpass', 1400, 90, 1.2); tone('sine', 80, 28, 0.6, 1.1); break;
      case 'saw':   tone('sawtooth', 95, 80, 0.22, 0.35); noiseBurst(0.2, 'bandpass', 1200, 900, 0.35); break;
      case 'pickup':tone('sine', 520, 780, 0.12, 0.45); tone('sine', 780, 1170, 0.16, 0.4, 0.09); break;
      case 'tick':  tone('square', 1900, 1500, 0.035, 0.22); break;
      case 'kill':  tone('square', 1500, 1200, 0.05, 0.25); tone('square', 2100, 1700, 0.07, 0.25, 0.06); break;
      case 'ping':  tone('sine', 3000, 2000, 0.09, 0.28); noiseBurst(0.03, 'highpass', 4000, 4000, 0.3); break;
      case 'thud':  tone('sine', 140, 55, 0.09, 0.5); break;
      case 'click': noiseBurst(0.02, 'highpass', 3000, 3000, 0.4); break;
      default:      tone('sine', 400, 300, 0.05, 0.2);
    }
  },

  // ---- background music (tiny synth loop) ----------------------------------
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    const notes = [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83];
    let step = 0;
    this.musicTimer = setInterval(() => {
      if (!this.musicOn || !this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = notes[step % notes.length] * (step % 16 >= 8 ? 1.5 : 1);
      g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g); g.connect(this.musicBus);
      osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch (e) { /* ignore */ } };
      osc.start(t); osc.stop(t + 0.25);
      step++;
    }, 280);
  },
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
};

AudioSys.init();
['pointerdown', 'touchend', 'keydown', 'click'].forEach((ev) => window.addEventListener(ev, () => AudioSys.unlock(), { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!AudioSys.ctx || !AudioSys.unlocked) return;
  if (document.hidden) AudioSys.ctx.suspend().catch(() => {}); else AudioSys.ctx.resume().catch(() => {});
});

// ==========================================================================
// 5. PRELOADER (progress bar over lobby_bg.png)
// ==========================================================================
const LOAD_TIPS = [
  'TIP: Hold the jetpack stick up to fly. Landing recharges fuel fast.',
  'TIP: Shotguns and rockets kick hard — use recoil to dodge.',
  'TIP: Metal cover (containers, bunkers) stops bullets and throws sparks.',
  'TIP: Switch to the Riot Shield to block frontal fire.',
  'TIP: Smoke grenades hide you. Gas grenades punish campers.',
  'TIP: Reload before you fly in — empty magazines get you killed.'
];

function setLoadProgress(frac, label) {
  const pct = Math.round(clamp(frac, 0, 1) * 100);
  $('loadBarFill').style.width = pct + '%';
  $('loadPct').textContent = pct + '%';
  $('loadBar').setAttribute('aria-valuenow', String(pct));
  if (label) $('loadStatus').textContent = label;
}

async function runPool(tasks, limit, onTick) {
  let next = 0, finished = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const t = tasks[next++];
      try { await t.run(); } catch (e) { Assets.failed.push(t.label); console.warn('asset failed:', t.label, e); }
      finished++;
      onTick(finished, t.label);
      await new Promise((r) => setTimeout(r, 0)); // let the progress bar paint
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

async function preloadEverything() {
  $('loadTip').textContent = LOAD_TIPS[Math.floor(Math.random() * LOAD_TIPS.length)];
  const imageTasks = [];

  CHARACTERS.forEach((ch) => imageTasks.push({ label: 'OPERATOR ' + (ch.id + 1), run: async () => {
    const img = await loadImage(ch.file);
    if (!img) { Assets.failed.push(ch.file); return; }
    const s = processSprite(img, { maxDim: 288, mode: 'key' });
    Assets.chars[ch.id] = s; Assets.thumbs.chars[ch.id] = canvasToUrl(s, 288);
    img.src = '';
  } }));

  WEAPONS.forEach((wp) => imageTasks.push({ label: wp.name, run: async () => {
    const img = await loadImage(wp.file);
    if (!img) { Assets.failed.push(wp.file); return; }
    const s = processSprite(img, { maxDim: 288, mode: 'key' });
    Assets.weapons[wp.id] = s; Assets.thumbs.weapons[wp.id] = canvasToUrl(s, 160);
    img.src = '';
  } }));

  GRENADE_TYPES.forEach((gr) => imageTasks.push({ label: gr.name, run: async () => {
    const img = await loadImage(gr.file);
    if (!img) { Assets.failed.push(gr.file); return; }
    const s = processSprite(img, { maxDim: 160, mode: 'keyholes' });
    Assets.grenades[gr.id] = s; Assets.thumbs.grenades[gr.id] = canvasToUrl(s, 96);
    img.src = '';
  } }));

  Object.entries(FX_FILES).forEach(([key, cfg]) => imageTasks.push({ label: 'FX ' + key.toUpperCase(), run: async () => {
    const img = await loadImage(cfg.file);
    if (!img) { Assets.failed.push(cfg.file); return; }
    Assets.fx[key] = processSprite(img, { maxDim: cfg.max, mode: cfg.mode, lighten: cfg.lighten || 0 });
    img.src = '';
  } }));

  Object.entries(PROP_FILES).forEach(([key, src]) => imageTasks.push({ label: 'PROP ' + key.toUpperCase(), run: async () => {
    const img = await loadImage(src);
    if (!img) { Assets.failed.push(src); return; }
    Assets.props[key] = processSprite(img, { maxDim: 512, mode: 'keyholes' });
    img.src = '';
  } }));

  const initialMap = clamp(parseInt(store.get('do_map', '0'), 10) || 0, 0, MAPS.length - 1);
  imageTasks.push({ label: 'MAP ' + MAPS[initialMap].name.toUpperCase(), run: () => ensureMap(initialMap) });

  const soundTasks = WEAPONS.map((wp) => ({ label: 'SFX ' + wp.name, run: () => AudioSys.loadOne(wp.id) }));

  const total = imageTasks.length + soundTasks.length + 1;
  let done = 0;
  const tick = (label) => { done++; setLoadProgress(done / total, 'LOADING ' + label); };

  await loadImage('./assets/lobby_bg.png').then(() => tick('BRIEFING'));
  await Promise.all([
    runPool(imageTasks, 3, (_, label) => tick(label)),
    runPool(soundTasks, 4, (_, label) => tick(label))
  ]);

  // Warm the remaining maps quietly after the lobby is visible.
  Assets.ready = true;
  const miss = Assets.failed.length;
  setLoadProgress(1, miss ? `READY — ${miss} ASSET(S) USING FALLBACKS` : 'READY');
}

// ==========================================================================
// 6. STATE
// ==========================================================================
const MAX_PLAYERS = 6;
// Jetpack tuning. Set drain to 0 for the old "infinite fuel" behaviour.
const JET = { max: 100, drain: 30, regenGround: 34, regenAir: 11, delay: 0.7, restart: 18 };

const state = {
  mode: 'loading',          // loading | menu | playing | gameover
  isHost: true,
  roomCode: '',
  mapId: clamp(parseInt(store.get('do_map', '0'), 10) || 0, 0, MAPS.length - 1),
  myId: 'p_' + Math.random().toString(36).substring(2, 8),
  myName: store.get('do_name') || 'Harsh',
  myCharId: clamp(parseInt(store.get('do_char', '0'), 10) || 0, 0, CHARACTERS.length - 1),
  myStartWeapon: clamp(parseInt(store.get('do_weap', '1'), 10) || 1, 0, 6),
  myGrenadeType: 0,
  players: {},
  bullets: [],
  grenades: [],
  clouds: [],
  killFeed: [],
  events: [],
  selectedDuration: 300,
  matchTime: 300,
  sniperZoom: false,
  camera: { x: 1200, y: 600, zoom: 1 },
  nextId: 1
};

const settings = {
  shake: store.get('do_shake') !== 'false' && !PREFERS_REDUCED_MOTION,
  quality: store.get('do_quality') || 'auto',    // auto | high | low
  fps: store.get('do_fps') === 'true'
};

const voiceChat = { enabled: false, stream: null, audioCtx: null, peerGains: {}, els: {} };
const MAX_VOICE_DISTANCE = 650;
let peer = null;
const connections = {};
let hostConn = null;
let lastFrameTime = 0;
let loopRunning = false;

function sanitizeName(n) {
  return String(n || '').replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, 14) || 'Soldier';
}
state.myName = sanitizeName(state.myName);

function toast(msg, ms = 2600) {
  let el = $('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ==========================================================================
// 7. LOBBY / SETTINGS UI
// ==========================================================================
const thumbChar = (id) => Assets.thumbs.chars[id] || TRANSPARENT_GIF;
const thumbWeapon = (id) => Assets.thumbs.weapons[id] || TRANSPARENT_GIF;

function makeThumbButton(cls, src, alt, label) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.title = alt;
  const im = document.createElement('img');
  im.alt = alt; im.src = src; im.draggable = false;
  b.appendChild(im);
  if (label) { const s = document.createElement('span'); s.className = 'strip-key'; s.textContent = label; b.appendChild(s); }
  return b;
}

function setCharacter(id) {
  state.myCharId = ((id % CHARACTERS.length) + CHARACTERS.length) % CHARACTERS.length;
  store.set('do_char', state.myCharId);
  syncSoldierUI();
  const me = state.players[state.myId];
  if (me) {
    me.charId = state.myCharId;
    if (state.isHost) broadcastToClients({ type: 'lobby_sync', players: serializePlayers(), mapId: state.mapId });
  }
}

function syncSoldierUI() {
  const ch = CHARACTERS[state.myCharId] || CHARACTERS[0];
  const url = thumbChar(ch.id);
  $('lobbyCharPreviewImg').src = url;
  $('lobbyCharIndex').textContent = `OPERATOR ${String(ch.id + 1).padStart(2, '0')} / ${String(CHARACTERS.length).padStart(2, '0')}`;
  $('lobbyCharName').textContent = ch.name.toUpperCase();
  $('drawerCharIcon').src = url;
  $('drawerCharName').textContent = ch.name;
  $('hudAvatarImg').src = url;
  $('hudCharRole').textContent = ch.name.toUpperCase();
  document.querySelectorAll('#charStrip .strip-item').forEach((el, i) => el.classList.toggle('selected', i === ch.id));
  document.querySelectorAll('#characterGrid .char-card').forEach((el, i) => el.classList.toggle('selected', i === ch.id));
}

function buildCharacterPickers() {
  const strip = $('charStrip'), grid = $('characterGrid');
  strip.innerHTML = ''; grid.innerHTML = '';
  CHARACTERS.forEach((ch) => {
    const b = makeThumbButton('strip-item', thumbChar(ch.id), ch.name, String(ch.id + 1));
    b.onclick = () => setCharacter(ch.id);
    strip.appendChild(b);

    const card = document.createElement('div');
    card.className = 'char-card';
    const num = document.createElement('span'); num.className = 'char-num'; num.textContent = String(ch.id + 1).padStart(2, '0');
    const im = document.createElement('img'); im.src = thumbChar(ch.id); im.alt = ch.name; im.draggable = false;
    const nm = document.createElement('div'); nm.className = 'char-name'; nm.textContent = ch.name;
    card.append(num, im, nm);
    card.onclick = () => setCharacter(ch.id);
    grid.appendChild(card);
  });
  $('charPrev').onclick = () => setCharacter(state.myCharId - 1);
  $('charNext').onclick = () => setCharacter(state.myCharId + 1);
  syncSoldierUI();
}

function buildStartWeaponStrip() {
  const strip = $('startWeaponStrip');
  strip.innerHTML = '';
  for (let i = 0; i <= 6; i++) {
    const b = makeThumbButton('strip-item' + (i === state.myStartWeapon ? ' selected' : ''), thumbWeapon(i), WEAPONS[i].name, String(i + 1));
    b.onclick = () => {
      state.myStartWeapon = i; store.set('do_weap', i);
      strip.querySelectorAll('.strip-item').forEach((el, k) => el.classList.toggle('selected', k === i));
    };
    strip.appendChild(b);
  }
}

// ---- in-game 10-slot weapon dock ------------------------------------------
function buildWeaponDock() {
  const bar = $('weaponSelectorBar');
  bar.innerHTML = '';
  WEAPONS.forEach((wp) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'w-slot'; btn.dataset.w = String(wp.id); btn.title = wp.name;
    const im = document.createElement('img'); im.src = thumbWeapon(wp.id); im.alt = wp.name; im.draggable = false;
    const sp = document.createElement('span'); sp.textContent = String((wp.id + 1) % 10);
    btn.append(im, sp);
    btn.onclick = (e) => { e.stopPropagation(); selectWeapon(wp.id); bar.classList.remove('open'); };
    bar.appendChild(btn);
  });
  $('weaponHud').onclick = () => { if (isTouchUI()) bar.classList.toggle('open'); };
}

// ---- map selector ------------------------------------------------------------
const mapSelectEl = $('mapSelect');
function syncMapUI() {
  const m = MAPS[state.mapId] || MAPS[0];
  mapSelectEl.value = String(state.mapId);
  $('mapIndexLabel').textContent = `MAP ${String(state.mapId + 1).padStart(2, '0')} / ${MAPS.length}`;
  $('mapNameLabel').textContent = m.name.toUpperCase();
  const id = state.mapId;
  if (Assets.maps[id]) $('mapPreview').src = Assets.maps[id].src;
  else { $('mapPreview').src = TRANSPARENT_GIF; ensureMap(id).then((img) => { if (img && state.mapId === id) $('mapPreview').src = img.src; }); }
}
function setMap(id, fromNetwork) {
  state.mapId = ((id % MAPS.length) + MAPS.length) % MAPS.length;
  store.set('do_map', state.mapId);
  syncMapUI();
  if (state.isHost && !fromNetwork) broadcastToClients({ type: 'lobby_sync', players: serializePlayers(), mapId: state.mapId });
}
mapSelectEl.onchange = (e) => setMap(parseInt(e.target.value, 10) || 0);
$('mapPrev').onclick = () => setMap(state.mapId - 1);
$('mapNext').onclick = () => setMap(state.mapId + 1);

// ---- settings drawer -----------------------------------------------------------
const settingsDrawer = $('settingsDrawer');
function openSettings() {
  $('drawerMatchActions').classList.toggle('hidden', state.mode !== 'playing');
  settingsDrawer.classList.remove('hidden');
}
$('lobbySettingsBtn').onclick = openSettings;
$('inGameSettingsBtn').onclick = openSettings;
$('closeSettingsBtn').onclick = () => settingsDrawer.classList.add('hidden');
$('toggleSoldierPickerBtn').onclick = () => {
  const g = $('characterGrid');
  g.classList.toggle('hidden');
  $('soldierExpandArrow').textContent = g.classList.contains('hidden') ? '▶' : '▼';
};

function pill(btn, on, label) { btn.textContent = label || (on ? 'ON' : 'OFF'); btn.className = 'switch-pill ' + (on ? 'on' : 'off'); }
function refreshSettingButtons() {
  pill($('toggleSfxBtn'), AudioSys.sfxOn);
  pill($('toggleMusicBtn'), AudioSys.musicOn);
  pill($('toggleShakeBtn'), settings.shake);
  pill($('toggleQualityBtn'), settings.quality !== 'low', settings.quality.toUpperCase());
  pill($('toggleFpsBtn'), settings.fps);
  $('fpsCounter').classList.toggle('hidden', !(settings.fps && state.mode === 'playing'));
}
$('toggleSfxBtn').onclick = () => { AudioSys.unlock(); AudioSys.setSfx(!AudioSys.sfxOn); refreshSettingButtons(); };
$('toggleMusicBtn').onclick = () => { AudioSys.unlock(); AudioSys.setMusic(!AudioSys.musicOn); refreshSettingButtons(); };
$('toggleShakeBtn').onclick = () => { settings.shake = !settings.shake; store.set('do_shake', settings.shake); refreshSettingButtons(); };
$('toggleFpsBtn').onclick = () => { settings.fps = !settings.fps; store.set('do_fps', settings.fps); refreshSettingButtons(); };
$('toggleQualityBtn').onclick = () => {
  settings.quality = settings.quality === 'auto' ? 'high' : settings.quality === 'high' ? 'low' : 'auto';
  store.set('do_quality', settings.quality);
  refreshSettingButtons();
  if (typeof applyQuality === 'function') applyQuality(true);
};
$('drawerExitMatchBtn').onclick = () => leaveToLobby();

function leaveToLobby() { try { if (peer) peer.destroy(); } catch (e) { /* ignore */ } location.reload(); }

// ---- timer presets / name / friends ---------------------------------------------
function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedDuration = parseInt(btn.dataset.sec, 10);
    state.matchTime = state.selectedDuration;
    $('lobbyTimerDisplay').textContent = formatClock(state.matchTime);
  };
});

function adjustLiveTimer(delta) {
  if (state.isHost) state.matchTime = clamp(state.matchTime + delta, 10, 3600);
  else if (hostConn && hostConn.open) hostConn.send({ type: 'adjust_time', delta });
}
$('timePlusBtn').onclick = () => adjustLiveTimer(30);
$('timeMinusBtn').onclick = () => adjustLiveTimer(-30);

const nameInput = $('playerNameInput');
nameInput.value = state.myName;
nameInput.addEventListener('input', () => { state.myName = sanitizeName(nameInput.value); store.set('do_name', state.myName); });
nameInput.addEventListener('keydown', (e) => e.stopPropagation());
$('roomCodeInput').addEventListener('keydown', (e) => e.stopPropagation());

function getSavedFriends() { try { return JSON.parse(store.get('do_friends', '[]')) || []; } catch (e) { return []; } }
function saveFriend(id, name) {
  const list = getSavedFriends();
  if (!list.some((f) => f.name === name)) { list.push({ id, name }); store.set('do_friends', JSON.stringify(list.slice(-30))); renderSavedFriends(); }
}
function renderSavedFriends() {
  const list = getSavedFriends();
  $('savedFriendsList').textContent = list.length ? list.map((f) => f.name).join(', ') : 'None yet';
}
renderSavedFriends();

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) $('roomCodeInput').value = urlParams.get('room').toUpperCase().slice(0, 4);

$('installAppBtn').onclick = () => $('installModal').classList.remove('hidden');
$('closeInstallModal').onclick = () => $('installModal').classList.add('hidden');

// ---- proximity voice chat (unchanged behaviour, leak-safe) ----------------------
async function toggleProximityMic() {
  const hudBtn = $('toggleMicBtn'), drawerBtn = $('drawerMicBtn');
  if (!voiceChat.enabled) {
    try {
      if (!voiceChat.stream) {
        voiceChat.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (peer) {
          Object.keys(connections).forEach((remoteId) => { const c = connections[remoteId]; if (c && c.peer) attachVoiceCall(peer.call(c.peer, voiceChat.stream)); });
          if (!state.isHost && hostConn && hostConn.peer) attachVoiceCall(peer.call(hostConn.peer, voiceChat.stream));
        }
      }
      voiceChat.stream.getAudioTracks().forEach((t) => { t.enabled = true; });
      voiceChat.enabled = true;
      hudBtn.textContent = 'MIC ON'; pill(drawerBtn, true);
    } catch (err) { toast('Microphone permission is needed for voice chat.'); }
  } else {
    if (voiceChat.stream) voiceChat.stream.getAudioTracks().forEach((t) => { t.enabled = false; });
    voiceChat.enabled = false;
    hudBtn.textContent = 'MIC OFF'; pill(drawerBtn, false);
  }
}

function attachVoiceCall(call) {
  if (!call) return;
  call.on('stream', (remoteStream) => {
    if (!voiceChat.audioCtx) voiceChat.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (voiceChat.audioCtx.state === 'suspended') voiceChat.audioCtx.resume().catch(() => {});
    if (voiceChat.peerGains[call.peer]) return; // already wired — no duplicate nodes
    const source = voiceChat.audioCtx.createMediaStreamSource(remoteStream);
    const gainNode = voiceChat.audioCtx.createGain();
    gainNode.gain.value = 1.0;
    const audioEl = new Audio(); // Chrome needs a (muted) element attached for the stream to flow
    audioEl.srcObject = remoteStream; audioEl.muted = true; audioEl.play().catch(() => {});
    source.connect(gainNode); gainNode.connect(voiceChat.audioCtx.destination);
    voiceChat.peerGains[call.peer] = gainNode;
    voiceChat.els[call.peer] = audioEl;
  });
  call.on('close', () => {
    const g = voiceChat.peerGains[call.peer]; if (g) { try { g.disconnect(); } catch (e) { /* ignore */ } delete voiceChat.peerGains[call.peer]; }
    const el = voiceChat.els[call.peer]; if (el) { el.srcObject = null; delete voiceChat.els[call.peer]; }
  });
}
function bindIncomingVoiceCalls() {
  if (!peer) return;
  peer.on('call', (call) => { call.answer(voiceChat.stream || undefined); attachVoiceCall(call); });
}
function updateProximityVoiceVolumes() {
  const me = state.players[state.myId];
  if (!me) return;
  for (const peerId in voiceChat.peerGains) {
    const other = Object.values(state.players).find((p) => p.id === peerId) || state.players[peerId];
    const gainNode = voiceChat.peerGains[peerId];
    if (!other || other.hp <= 0) { gainNode.gain.value = 0; continue; }
    gainNode.gain.value = clamp(1 - Math.hypot(other.x - me.x, other.y - me.y) / MAX_VOICE_DISTANCE, 0, 1);
  }
}
$('toggleMicBtn').onclick = toggleProximityMic;
$('drawerMicBtn').onclick = toggleProximityMic;

// ==========================================================================
// 8. PLAYERS, ROOMS & NETWORKING (PeerJS host-authoritative)
// ==========================================================================
function createPlayer(id, name, charId, isBot = false, spawnIdx = 0, weaponIdx = 1) {
  const activeMap = MAPS[state.mapId] || MAPS[0];
  const sp = activeMap.spawns[spawnIdx % activeMap.spawns.length];
  return {
    id, name: sanitizeName(name), charId: clamp(parseInt(charId, 10) || 0, 0, CHARACTERS.length - 1), isBot,
    x: sp.x, y: sp.y, vx: 0, vy: 0, facing: 1, aimAngle: 0,
    hp: 100, maxHp: 100, armor: 0, boostTimer: 0,
    weaponIdx: clamp(weaponIdx | 0, 0, WEAPONS.length - 1), kills: 0, deaths: 0,
    lastShot: 0, lastGrenade: 0, deadTimer: 0, aiTimer: 0, aiDir: 1,
    fuel: JET.max, fuelDelay: 0, fuelLock: false, thrust: false, grounded: false,
    ammo: WEAPONS.map((w) => w.mag), reloadT: 0, reloadDur: 0,
    gSeq: 0, remoteInput: null
  };
}

function resetPlayerForMatch(p, idx) {
  const sp = (MAPS[state.mapId] || MAPS[0]).spawns[idx % 6];
  p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0; p.hp = 100; p.armor = 0; p.boostTimer = 0;
  p.kills = 0; p.deaths = 0; p.deadTimer = 0; p.fuel = JET.max; p.fuelLock = false; p.reloadT = 0;
  p.ammo = WEAPONS.map((w) => w.mag);
}

/** Only the fields clients need — keeps each network packet small. */
function serializePlayers() {
  const r1 = (v) => Math.round(v * 10) / 10;
  const out = {};
  for (const id in state.players) {
    const p = state.players[id];
    out[id] = {
      id: p.id, name: p.name, charId: p.charId, isBot: p.isBot,
      x: r1(p.x), y: r1(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy),
      facing: p.facing, aimAngle: Math.round(p.aimAngle * 1000) / 1000,
      hp: Math.round(p.hp * 10) / 10, maxHp: p.maxHp, armor: Math.round(p.armor), boostTimer: r1(p.boostTimer),
      weaponIdx: p.weaponIdx, kills: p.kills, deaths: p.deaths, deadTimer: r1(p.deadTimer),
      thrust: p.thrust, fuel: Math.round(p.fuel), ammo: p.ammo, reloadT: Math.round(p.reloadT * 100) / 100, reloadDur: p.reloadDur
    };
  }
  return out;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function setStatus(msg) { $('connectionStatus').textContent = msg; }

function createRoom(attempt = 0) {
  if (typeof Peer === 'undefined') { setStatus('Multiplayer library failed to load. Check your connection.'); return; }
  state.isHost = true;
  state.roomCode = generateRoomCode();
  setStatus('Creating room…');
  try { if (peer) peer.destroy(); } catch (e) { /* ignore */ }
  peer = new Peer('DOODLE_OUTPOST_' + state.roomCode);
  bindIncomingVoiceCalls();

  peer.on('open', () => {
    state.players = {};
    state.players[state.myId] = createPlayer(state.myId, state.myName, state.myCharId, false, 0, state.myStartWeapon);
    $('waitingRoom').classList.remove('hidden');
    $('displayRoomCode').textContent = state.roomCode;
    $('startMatchBtn').classList.remove('hidden');
    setStatus('Room ready! Share the code with up to 5 friends.');
    updateLobbyPlayersUI();
  });
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id' && attempt < 5) createRoom(attempt + 1); // code already taken — pick another
    else setStatus('Network error: ' + (err.type || 'unknown'));
  });
  peer.on('connection', (conn) => {
    conn.on('data', (msg) => handleHostReceive(conn, msg));
    conn.on('close', () => {
      const pid = conn.playerId;
      if (pid && state.players[pid]) {
        delete state.players[pid]; delete connections[pid];
        updateLobbyPlayersUI();
        broadcastToClients({ type: 'lobby_sync', players: serializePlayers(), mapId: state.mapId });
      }
    });
    conn.on('error', () => {});
  });
}

function joinRoom() {
  const code = $('roomCodeInput').value.trim().toUpperCase();
  if (code.length !== 4) { setStatus('Enter the 4-character room code.'); return; }
  if (typeof Peer === 'undefined') { setStatus('Multiplayer library failed to load. Check your connection.'); return; }
  state.isHost = false;
  state.roomCode = code;
  setStatus('Joining room ' + code + '…');
  try { if (peer) peer.destroy(); } catch (e) { /* ignore */ }
  peer = new Peer();
  bindIncomingVoiceCalls();
  peer.on('error', (err) => setStatus(err.type === 'peer-unavailable' ? 'Room ' + code + ' not found.' : 'Network error: ' + (err.type || 'unknown')));
  peer.on('open', () => {
    hostConn = peer.connect('DOODLE_OUTPOST_' + code, { reliable: false });
    hostConn.on('open', () => {
      setStatus('Joined! Waiting for the host to start…');
      hostConn.send({ type: 'join', id: state.myId, name: state.myName, charId: state.myCharId, weaponIdx: state.myStartWeapon });
      if (voiceChat.stream) attachVoiceCall(peer.call(hostConn.peer, voiceChat.stream));
    });
    hostConn.on('data', (msg) => handleClientReceive(msg));
    hostConn.on('close', () => { toast('Host disconnected'); setTimeout(() => location.reload(), 1600); });
    hostConn.on('error', () => setStatus('Connection error.'));
  });
}

function startPractice() {
  state.isHost = true;
  state.roomCode = 'BOTS';
  state.matchTime = state.selectedDuration;
  state.players = {};
  state.players[state.myId] = createPlayer(state.myId, state.myName, state.myCharId, false, 0, state.myStartWeapon);
  addBotsUpTo(MAX_PLAYERS);
  startMatch();
}

function addBotsUpTo(limit) {
  const botNames = ['Sgt. Viper', 'Ghost_Ops', 'Major Boom', 'SniperWolf', 'Cpl. Tank'];
  let idx = Object.keys(state.players).length, b = 0;
  while (idx < limit) {
    const bid = 'bot_' + idx;
    state.players[bid] = createPlayer(bid, botNames[b % botNames.length], (idx + 1) % CHARACTERS.length, true, idx, BOT_WEAPONS[idx % BOT_WEAPONS.length]);
    idx++; b++;
  }
}

function updateLobbyPlayersUI() {
  const playersArr = Object.values(state.players);
  $('roomCountBadge').textContent = `${playersArr.length} / ${MAX_PLAYERS} Players`;
  const listEl = $('lobbyPlayersList');
  listEl.innerHTML = '';
  playersArr.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.textContent = `${p.name} • ${CHARACTERS[p.charId] ? CHARACTERS[p.charId].name : 'Soldier'}`; // textContent => no HTML injection
    listEl.appendChild(chip);
  });
}

function shareUrl() { return `${location.origin}${location.pathname}?room=${state.roomCode}`; }
$('copyLinkBtn').onclick = () => {
  const done = () => { $('copyLinkBtn').textContent = 'COPIED'; setTimeout(() => ($('copyLinkBtn').textContent = 'COPY LINK'), 1800); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(shareUrl()).then(done).catch(() => toast(shareUrl()));
  else toast(shareUrl(), 6000);
};
$('whatsappShareBtn').onclick = () => {
  window.open(`https://wa.me/?text=${encodeURIComponent(`Join my Doodle Outpost match! Code: *${state.roomCode}* — ${shareUrl()}`)}`, '_blank', 'noopener');
};

$('createRoomBtn').onclick = () => createRoom();
$('joinRoomBtn').onclick = joinRoom;
$('soloBotsBtn').onclick = startPractice;

$('startMatchBtn').onclick = () => {
  if ($('fillBotsCheck').checked) addBotsUpTo(MAX_PLAYERS);
  state.matchTime = state.selectedDuration;
  Object.values(state.players).forEach((p, idx) => resetPlayerForMatch(p, idx));
  broadcastToClients({ type: 'start', players: serializePlayers(), roomCode: state.roomCode, matchTime: state.matchTime, mapId: state.mapId });
  startMatch();
};

function handleHostReceive(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'join') {
    const count = Object.keys(state.players).length;
    if (count >= MAX_PLAYERS && !state.players[msg.id]) { try { conn.send({ type: 'full' }); } catch (e) { /* ignore */ } return; }
    const id = String(msg.id || '').slice(0, 24);
    if (!id) return;
    conn.playerId = id;
    connections[id] = conn;
    state.players[id] = createPlayer(id, msg.name, msg.charId, false, count, typeof msg.weaponIdx === 'number' ? msg.weaponIdx : 1);
    if (voiceChat.stream) attachVoiceCall(peer.call(conn.peer, voiceChat.stream));
    updateLobbyPlayersUI();
    broadcastToClients({ type: 'lobby_sync', players: serializePlayers(), mapId: state.mapId });
    if (state.mode === 'playing') conn.send({ type: 'start', players: serializePlayers(), roomCode: state.roomCode, matchTime: state.matchTime, mapId: state.mapId });
  } else if (msg.type === 'input') {
    const p = state.players[msg.id];
    if (!p || !msg.input) return;
    const i = msg.input;
    p.remoteInput = {
      moveX: clamp(+i.moveX || 0, -1, 1), moveY: clamp(+i.moveY || 0, -1, 1),
      aimX: clamp(+i.aimX || 0, -1, 1), aimY: clamp(+i.aimY || 0, -1, 1), shooting: !!i.shooting
    };
    if (typeof msg.weaponIdx === 'number' && msg.weaponIdx !== p.weaponIdx && msg.weaponIdx >= 0 && msg.weaponIdx < WEAPONS.length) setPlayerWeapon(p, msg.weaponIdx, performance.now());
    // Counters (not one-shot flags) so a dropped packet cannot lose a grenade throw or reload.
    if (msg.gSeq > p.gSeq) { p.gSeq = msg.gSeq; spawnGrenade(p, msg.gType | 0); }
    if (msg.rSeq > (p.rSeq | 0)) { p.rSeq = msg.rSeq; startReload(p); }
  } else if (msg.type === 'adjust_time') {
    state.matchTime = clamp(state.matchTime + (+msg.delta || 0), 10, 3600);
  }
}

function handleClientReceive(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'lobby_sync') {
    state.players = msg.players;
    state.mapId = msg.mapId || 0;
    syncMapUI();
    $('waitingRoom').classList.remove('hidden');
    $('displayRoomCode').textContent = state.roomCode;
    $('startMatchBtn').classList.add('hidden');
    updateLobbyPlayersUI();
  } else if (msg.type === 'start') {
    state.players = msg.players;
    state.roomCode = msg.roomCode;
    state.matchTime = msg.matchTime;
    state.mapId = msg.mapId || 0;
    state.bullets = []; state.grenades = []; state.clouds = []; state.killFeed = [];
    $('matchOverModal').classList.add('hidden');
    state.mode = state.mode === 'gameover' ? 'playing' : state.mode;
    startMatch();
  } else if (msg.type === 'state') {
    state.players = msg.players;
    state.bullets = msg.bullets || [];
    state.grenades = msg.grenades || [];
    state.clouds = msg.clouds || [];
    state.killFeed = msg.killFeed || [];
    state.matchTime = msg.matchTime;
    state.mapId = msg.mapId || 0;
    if (msg.events) for (let i = 0; i < msg.events.length; i++) handleEvent(msg.events[i]);
  } else if (msg.type === 'over') {
    if (state.mode === 'playing') showMatchOverScreen();
  } else if (msg.type === 'full') {
    setStatus('Room is full (max 6 players).');
  }
}

function broadcastToClients(payload) {
  for (const id in connections) { const c = connections[id]; if (c && c.open) { try { c.send(payload); } catch (e) { /* ignore */ } } }
}

// ==========================================================================
// 9. INPUT — keyboard / mouse / multi-touch dual sticks
// ==========================================================================
const input = { moveX: 0, moveY: 0, aimX: 1, aimY: 0, shooting: false };
const inputSeq = { g: 0, r: 0 };
const keys = {};
const mouse = { x: 0, y: 0, seen: false };
let aimActive = false;          // true while the right (aim) stick is held
let lastPointerType = 'mouse';
state.wantWeapon = null;        // client-side selected weapon (host confirms it)

const canvas = $('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

const isTypingTarget = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');

window.addEventListener('keydown', (e) => {
  if (isTypingTarget(e.target)) return;
  if (state.mode === 'playing' && (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab')) e.preventDefault();
  keys[e.code] = true;
  if (state.mode !== 'playing' || e.repeat) return;
  const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9 }[e.code];
  if (digit !== undefined) selectWeapon(digit);
  if (e.code === 'KeyQ') cycleWeapon();
  if (e.code === 'KeyR') reloadNow();
  if (e.code === 'KeyF') cycleGrenadeType();
  if (e.code === 'KeyG' || e.code === 'KeyE') triggerGrenade();
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.sniperZoom = !state.sniperZoom;
  if (e.code === 'Tab') toggleScoreboard();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.shooting = false; });

const isUiTarget = (t) => !!(t && t.closest && t.closest('button, input, select, aside, .scoreboard-panel, .weapon-dock, #matchOverModal'));

window.addEventListener('pointermove', (e) => {
  lastPointerType = e.pointerType;
  if (e.pointerType !== 'mouse') return;
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
  if (state.mode === 'playing') document.body.classList.remove('touch-active');
});
window.addEventListener('pointerdown', (e) => {
  lastPointerType = e.pointerType;
  if (e.pointerType !== 'mouse' || state.mode !== 'playing' || isUiTarget(e.target)) return;
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
  if (e.button === 0) input.shooting = true;
  if (e.button === 2) triggerGrenade();
});
window.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && e.button === 0) input.shooting = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
let lastWheel = 0;
window.addEventListener('wheel', (e) => {
  if (state.mode !== 'playing' || isUiTarget(e.target)) return;
  const n = performance.now();
  if (n - lastWheel < 140) return;
  lastWheel = n;
  cycleWeapon(e.deltaY < 0 ? -1 : 1);
}, { passive: true });

// Block page zoom / scroll / pull-to-refresh while playing.
document.addEventListener('touchmove', (e) => { if (state.mode === 'playing' && !e.target.closest('.scoreboard-panel, .weapon-dock, .drawer-body')) e.preventDefault(); }, { passive: false });
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
document.addEventListener('dblclick', (e) => { if (state.mode === 'playing') e.preventDefault(); });
// Buttons never keep keyboard focus (otherwise SPACE would "click" the last HUD button).
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && b.blur) b.blur(); });

/** Floating, multi-touch-safe virtual stick built on pointer events. */
function createStick(zoneId, baseId, knobId, onMove, onEnd) {
  const zone = $(zoneId), base = $(baseId), knob = $(knobId);
  let activeId = null, ox = 0, oy = 0, maxR = 50;

  const place = (clientX, clientY) => {
    const r = zone.getBoundingClientRect();
    base.style.left = clamp(clientX - r.left, 62, r.width - 62) + 'px';
    base.style.top = clamp(clientY - r.top, 62, r.height - 8) + 'px';
    const br = base.getBoundingClientRect();
    ox = br.left + br.width / 2; oy = br.top + br.height / 2;
    maxR = br.width * 0.38;
  };
  const update = (e) => {
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / maxR, dy / maxR);
  };
  const end = (e) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    knob.style.transform = 'translate(0px, 0px)';
    base.classList.remove('active');
    base.style.left = ''; base.style.top = ''; // glide back to the default spot
    onEnd();
  };
  zone.addEventListener('pointerdown', (e) => {
    if (activeId !== null) return;
    e.preventDefault();
    document.body.classList.add('touch-active');
    activeId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    place(e.clientX, e.clientY);
    base.classList.add('active');
    update(e);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === activeId) { e.preventDefault(); update(e); } });
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);
}

createStick('leftStickZone', 'leftBase', 'leftKnob', (nx, ny) => {
  const len = Math.hypot(nx, ny);
  if (len < 0.12) { input.moveX = 0; input.moveY = 0; return; }
  const k = (len - 0.12) / 0.88 / len; // dead-zone rescale
  input.moveX = clamp(nx * k * 1.12, -1, 1); input.moveY = clamp(ny * k * 1.12, -1, 1);
}, () => { input.moveX = 0; input.moveY = 0; });

createStick('rightStickZone', 'rightBase', 'rightKnob', (nx, ny) => {
  const len = Math.hypot(nx, ny);
  aimActive = true;
  if (len > 0.15) { input.aimX = nx / len; input.aimY = ny / len; }
  input.shooting = len > 0.35;
}, () => { input.shooting = false; aimActive = false; });

/** Touch action buttons: fire on pointerdown for zero-latency taps, never steal the sticks' touches. */
function bindButton(id, fn) {
  const el = $(id);
  const down = (e) => {
    e.preventDefault(); e.stopPropagation();
    el.classList.add('pressed');
    if (navigator.vibrate) { try { navigator.vibrate(6); } catch (err) { /* ignore */ } }
    fn();
  };
  const up = () => el.classList.remove('pressed');
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
}
bindButton('btnSwap', () => cycleWeapon());
bindButton('btnGrenade', () => triggerGrenade());
bindButton('btnGrenadeType', () => cycleGrenadeType());
bindButton('btnReload', () => reloadNow());
bindButton('btnZoom', () => { state.sniperZoom = !state.sniperZoom; $('btnZoom').classList.toggle('on', state.sniperZoom); });

$('toggleScoreboardBtn').onclick = toggleScoreboard;
$('closeSbBtn').onclick = toggleScoreboard;
$('leaveMatchBtn').onclick = leaveToLobby;
$('matchOverLobbyBtn').onclick = leaveToLobby;
$('rematchBtn').onclick = () => {
  $('matchOverModal').classList.add('hidden');
  if (!state.isHost) return;
  state.matchTime = state.selectedDuration;
  state.bullets = []; state.grenades = []; state.clouds = []; state.killFeed = [];
  Object.values(state.players).forEach((p, idx) => resetPlayerForMatch(p, idx));
  state.mode = 'playing';
  broadcastToClients({ type: 'start', players: serializePlayers(), roomCode: state.roomCode, matchTime: state.matchTime, mapId: state.mapId });
};

// ---- fullscreen + landscape lock (needs a user gesture; failures are harmless) ----
async function enterFullscreenLandscape() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch (e) { /* unsupported (e.g. iPhone Safari) */ }
  try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* needs fullscreen on some browsers */ }
}
function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
  else enterFullscreenLandscape();
}
$('fullscreenBtn').onclick = toggleFullscreen;
let fsTried = false;
window.addEventListener('pointerdown', () => { if (!fsTried && state.mode === 'playing' && isTouchUI()) { fsTried = true; enterFullscreenLandscape(); } }, { passive: true });

// ---- weapon / grenade / reload actions ------------------------------------------
const myWeapon = () => {
  const me = state.players[state.myId];
  if (!me) return state.myStartWeapon;
  return state.isHost || state.wantWeapon === null ? me.weaponIdx : state.wantWeapon;
};

function selectWeapon(idx) {
  const me = state.players[state.myId];
  if (!me || me.hp <= 0 || idx < 0 || idx >= WEAPONS.length) return;
  if (state.isHost) setPlayerWeapon(me, idx, performance.now());
  else { state.wantWeapon = idx; me.weaponIdx = idx; }
  AudioSys.synth('click', 0.35);
}
function cycleWeapon(dir = 1) { selectWeapon((myWeapon() + dir + WEAPONS.length) % WEAPONS.length); }
function cycleGrenadeType() {
  state.myGrenadeType = (state.myGrenadeType + 1) % GRENADE_TYPES.length;
  const g = GRENADE_TYPES[state.myGrenadeType];
  $('btnGrenadeType').innerHTML = `${g.label}<small>TYPE</small>`;
  $('hudGrenadeName').textContent = g.label;
  const url = Assets.thumbs.grenades[g.id] || TRANSPARENT_GIF;
  $('hudGrenadeImg').src = url; $('btnGrenadeImg').src = url;
}
function triggerGrenade() {
  const me = state.players[state.myId];
  if (!me || me.hp <= 0 || state.mode !== 'playing') return;
  if (state.isHost) spawnGrenade(me, state.myGrenadeType);
  else { inputSeq.g++; inputSeq.gType = state.myGrenadeType; }
}
function reloadNow() {
  const me = state.players[state.myId];
  if (!me || me.hp <= 0 || state.mode !== 'playing') return;
  if (state.isHost) startReload(me); else inputSeq.r++;
}

function toggleScoreboard() {
  const sb = $('scoreboardModal');
  sb.classList.toggle('hidden');
  if (!sb.classList.contains('hidden')) renderScoreboard();
}

function renderScoreboard() {
  $('hudRoomCode').textContent = state.roomCode;
  const rows = $('scoreboardRows');
  rows.innerHTML = '';
  Object.values(state.players).sort((a, b) => b.kills - a.kills).forEach((p) => {
    const div = document.createElement('div');
    div.className = 'sb-row' + (p.id === state.myId ? ' me' : '');
    const left = document.createElement('span');
    left.textContent = p.name + ' ';
    const sm = document.createElement('small'); sm.textContent = `(${CHARACTERS[p.charId] ? CHARACTERS[p.charId].name : 'Soldier'})`;
    left.appendChild(sm);
    const stats = document.createElement('span'); stats.className = 'stats'; stats.textContent = `K ${p.kills}  D ${p.deaths}`;
    div.append(left, stats);
    if (p.id !== state.myId && !p.isBot) {
      const b = document.createElement('button'); b.className = 'btn-sm'; b.textContent = '+ FRIEND';
      b.onclick = () => { saveFriend(p.id, p.name); b.textContent = 'SAVED'; };
      div.appendChild(b);
    }
    rows.appendChild(div);
  });
}

// ==========================================================================
// 10. SIMULATION (host-authoritative)
// ==========================================================================
const platCache = {};
function getActivePlatforms() {
  const id = state.mapId;
  return platCache[id] || (platCache[id] = BORDER_PLATFORMS.concat((MAPS[id] || MAPS[0]).platforms));
}

/** Bullet-blocking prop hitboxes (the real drawn rectangle of each sprite). */
function propRect(pr) {
  if (pr._r) return pr._r;
  const s = Assets.props[pr.kind];
  if (!s) return pr;
  let dw = pr.w, dh = dw / s.aspect;
  if (dh > pr.h) { dh = pr.h; dw = dh * s.aspect; }
  pr._r = { x: pr.x + (pr.w - dw) / 2, y: pr.y + pr.h - dh, w: dw, h: dh };
  return pr._r;
}
function solidProps(map) {
  if (!PROPS_BLOCK_BULLETS) return [];
  const out = [];
  (map.props || []).forEach((pr, i) => { const inf = PROP_INFO[pr.kind]; if (inf && inf.solid) out.push({ pr, i, mat: inf.mat }); });
  return out;
}

function emit(ev) { state.events.push(ev); handleEvent(ev); }

function setPlayerWeapon(p, idx, now) {
  if (idx === p.weaponIdx) return;
  p.weaponIdx = idx;
  p.reloadT = 0;
  if (UTILITY_TYPES[WEAPONS[idx].type]) fireWeapon(p, now); // crates / medkit are consumed on select
}

function startReload(p) {
  const w = WEAPONS[p.weaponIdx];
  if (!w || !w.mag || p.reloadT > 0 || p.hp <= 0 || p.ammo[w.id] >= w.mag) return;
  p.reloadDur = w.reload * (p.boostTimer > 0 ? 0.6 : 1);
  p.reloadT = p.reloadDur;
  emit({ t: 'reload', o: p.id, x: Math.round(p.x), y: Math.round(p.y) });
}

function fireWeapon(p, now) {
  const w = WEAPONS[p.weaponIdx];
  if (p.reloadT > 0) return;
  const rate = p.boostTimer > 0 ? w.rate * 0.55 : w.rate;
  if (now - p.lastShot < rate) return;
  if (w.mag > 0 && p.ammo[w.id] <= 0) { p.lastShot = now; emit({ t: 'dry', o: p.id, x: Math.round(p.x), y: Math.round(p.y) }); startReload(p); return; }
  p.lastShot = now;

  if (w.type === 'heal') {
    const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + 40);
    emit({ t: 'use', w: w.id, o: p.id, x: Math.round(p.x), y: Math.round(p.y), v: Math.round(p.hp - before), k: 'heal' });
    return;
  }
  if (w.type === 'ammo_boost') {
    p.boostTimer = 6.0;
    p.ammo = WEAPONS.map((x) => x.mag); p.reloadT = 0;
    emit({ t: 'use', w: w.id, o: p.id, x: Math.round(p.x), y: Math.round(p.y), v: 0, k: 'ammo' });
    return;
  }
  if (w.type === 'armor_boost') {
    p.armor = Math.min(100, (p.armor || 0) + 50);
    emit({ t: 'use', w: w.id, o: p.id, x: Math.round(p.x), y: Math.round(p.y), v: 50, k: 'armor' });
    return;
  }

  const ca = Math.cos(p.aimAngle), sa = Math.sin(p.aimAngle);
  const ox = p.x, oy = p.y + 4;

  if (w.type === 'shield' || w.type === 'melee') {
    const rx = p.x + ca * 40, ry = p.y + sa * 40;
    emit({ t: 'shot', w: w.id, o: p.id, x: Math.round(rx), y: Math.round(ry), a: Math.round(p.aimAngle * 100) / 100 });
    Object.values(state.players).forEach((t) => {
      if (t.id !== p.id && t.hp > 0 && Math.hypot(t.x - rx, t.y - ry) < 42) damagePlayer(t, w.damage, p.id, w.name, t.x, t.y - 6, 'flesh', p.aimAngle);
    });
    return;
  }

  // ---- ranged ----
  if (w.mag > 0) p.ammo[w.id]--;
  const muzzle = w.grip + w.dw * 0.96;
  const mx = ox + ca * muzzle, my = oy + sa * muzzle;
  emit({ t: 'shot', w: w.id, o: p.id, x: Math.round(mx), y: Math.round(my), a: Math.round(p.aimAngle * 1000) / 1000 });

  const map = MAPS[state.mapId] || MAPS[0];
  let skip = 0;
  solidProps(map).forEach((sp) => { const r = propRect(sp.pr); if (mx > r.x && mx < r.x + r.w && my > r.y && my < r.y + r.h) skip |= 1 << sp.i; });

  const dmgMult = p.boostTimer > 0 ? 1.25 : 1.0;
  for (let i = 0; i < w.count; i++) {
    const offset = w.count === 2 ? (i === 0 ? -5 : 5) : 0;
    const ang = p.aimAngle + (Math.random() - 0.5) * w.spread;
    const sp = w.speed * 60;
    state.bullets.push({
      id: state.nextId++, x: mx - sa * offset, y: my + ca * offset,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      damage: Math.round(w.damage * dmgMult), ownerId: p.id,
      weaponName: w.name, wi: w.id, type: w.type, life: 1.8, skip
    });
  }
  if (w.kick) { p.vx -= ca * w.kick; p.vy -= sa * w.kick * 0.45; }
  if (p.ammo[w.id] <= 0 && w.mag > 0) startReload(p);
}

function spawnGrenade(p, gType = 0) {
  const now = performance.now();
  if (p.hp <= 0 || now - p.lastGrenade < 420) return;
  p.lastGrenade = now;
  const t = clamp(gType | 0, 0, GRENADE_TYPES.length - 1);
  state.grenades.push({
    id: state.nextId++, x: p.x + p.facing * 20, y: p.y - 8,
    vx: Math.cos(p.aimAngle) * 560 + p.vx * 0.4, vy: Math.sin(p.aimAngle) * 560 - 140,
    fuse: 1.5, gType: t, ownerId: p.id
  });
  emit({ t: 'throw', o: p.id, x: Math.round(p.x), y: Math.round(p.y) });
}

function explodeBlast(x, y, ownerId, radius, maxDmg, label) {
  emit({ t: 'boom', x: Math.round(x), y: Math.round(y), r: radius });
  Object.values(state.players).forEach((p) => {
    if (p.hp <= 0) return;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < radius) {
      const f = 1 - d / radius;
      p.vy -= 320 * f; p.vx += Math.sign(p.x - x || 1) * 420 * f;       // blast knock-back
      damagePlayer(p, Math.round(maxDmg * f), ownerId, label, p.x, p.y - 10, 'flesh', Math.atan2(p.y - y, p.x - x));
    }
  });
}

function damagePlayer(target, amount, attackerId, weaponName, hx, hy, kind, ang) {
  if (target.hp <= 0 || amount <= 0) return;
  let rem = amount;
  if (target.armor > 0) { const ab = Math.min(target.armor, rem); target.armor -= ab; rem -= ab; }
  target.hp -= rem;
  const dead = target.hp <= 0;
  emit({ t: 'hit', x: Math.round(hx), y: Math.round(hy), k: kind || 'flesh', a: ang || 0, d: Math.max(1, Math.round(amount)), tg: target.id, o: attackerId });
  if (!dead) return;
  target.hp = 0; target.deaths += 1; target.deadTimer = 3.0; target.thrust = false;
  emit({ t: 'kill', x: Math.round(target.x), y: Math.round(target.y), tg: target.id, o: attackerId, c: target.charId });
  const attacker = state.players[attackerId];
  if (attacker && attacker.id !== target.id) attacker.kills += 1;
  state.killFeed.unshift({ id: state.nextId++, k: attacker ? attacker.name : '?', kid: attackerId, v: target.name, w: weaponName, s: attacker === target ? 1 : 0, life: 6 });
  if (state.killFeed.length > 4) state.killFeed.pop();
}

function stepBullets(dt, platforms, map) {
  const props = solidProps(map);
  const players = Object.values(state.players);
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.life -= dt;
    const dx = b.vx * dt, dy = b.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10)); // sub-steps: fast bullets can't tunnel through thin platforms
    let hit = null;
    for (let s = 0; s < steps && !hit; s++) {
      b.x += dx / steps; b.y += dy / steps;
      for (let k = 0; k < platforms.length; k++) {
        const pl = platforms[k];
        if (b.x > pl.x && b.x < pl.x + pl.w && b.y > pl.y && b.y < pl.y + pl.h) { hit = { k: 'wall' }; break; }
      }
      if (!hit) {
        for (let k = 0; k < props.length; k++) {
          const sp = props[k];
          if (b.skip & (1 << sp.i)) continue;
          const r = propRect(sp.pr);
          if (b.x > r.x + 3 && b.x < r.x + r.w - 3 && b.y > r.y + 3 && b.y < r.y + r.h - 3) { hit = { k: sp.mat }; break; }
        }
      }
      if (!hit) {
        for (let k = 0; k < players.length; k++) {
          const p = players[k];
          if (p.id === b.ownerId || p.hp <= 0 || Math.abs(b.x - p.x) >= 24 || Math.abs(b.y - p.y) >= 32) continue;
          const aw = WEAPONS[p.weaponIdx];
          const fromFront = Math.cos(p.aimAngle) * b.vx < 0;
          hit = (aw && aw.type === 'shield' && fromFront) ? { k: 'shield' } : { k: 'player', p };
          break;
        }
      }
    }
    if (!hit && b.life > 0) continue;
    const ang = Math.atan2(b.vy, b.vx);
    if (b.type === 'rocket') explodeBlast(b.x, b.y, b.ownerId, 135, 95, 'ROCKET RPG');
    else if (hit && hit.k === 'player') damagePlayer(hit.p, b.damage, b.ownerId, b.weaponName, b.x, b.y, 'flesh', ang);
    else if (hit) emit({ t: 'hit', x: Math.round(b.x), y: Math.round(b.y), k: hit.k, a: Math.round(ang * 100) / 100, d: 0, tg: '', o: b.ownerId });
    state.bullets.splice(i, 1);
  }
}

function stepGrenades(dt, platforms) {
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.vy += 850 * dt; g.fuse -= dt;
    const R = 6;
    g.x += g.vx * dt;
    for (const pl of platforms) {
      if (g.x + R > pl.x && g.x - R < pl.x + pl.w && g.y + R > pl.y && g.y - R < pl.y + pl.h) {
        g.x -= g.vx * dt; g.vx *= -0.5; break;
      }
    }
    g.y += g.vy * dt;
    for (const pl of platforms) {
      if (g.x + R > pl.x && g.x - R < pl.x + pl.w && g.y + R > pl.y && g.y - R < pl.y + pl.h) {
        g.y -= g.vy * dt;
        g.vy = Math.abs(g.vy) < 70 ? 0 : -g.vy * 0.45;
        g.vx *= 0.78; break;
      }
    }
    if (g.fuse > 0) continue;
    if (g.gType === 0) explodeBlast(g.x, g.y, g.ownerId, 150, 100, 'FRAG GRENADE');
    else if (g.gType === 1) state.clouds.push({ x: Math.round(g.x), y: Math.round(g.y), r: 135, life: 7.0, max: 7.0, kind: 'gas', ownerId: g.ownerId, tick: 0 });
    else state.clouds.push({ x: Math.round(g.x), y: Math.round(g.y), r: 165, life: 9.0, max: 9.0, kind: 'smoke', ownerId: g.ownerId, tick: 0 });
    state.grenades.splice(i, 1);
  }
}

function stepHostSimulation(dt, now) {
  state.matchTime = Math.max(0, state.matchTime - dt);
  const platforms = getActivePlatforms();
  const map = MAPS[state.mapId] || MAPS[0];

  Object.values(state.players).forEach((p, idx) => {
    if (p.boostTimer > 0) p.boostTimer = Math.max(0, p.boostTimer - dt);

    if (p.hp <= 0) {
      p.thrust = false;
      p.deadTimer -= dt;
      if (p.deadTimer <= 0) {
        const sp = map.spawns[(idx + Math.floor(Math.random() * 6)) % map.spawns.length];
        p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0; p.hp = 100; p.armor = 0; p.fuel = JET.max; p.fuelLock = false;
        p.ammo = WEAPONS.map((w) => w.mag); p.reloadT = 0;
        emit({ t: 'spawn', x: sp.x, y: sp.y, o: p.id });
      }
      return;
    }

    let ctrl = input;
    if (p.isBot) ctrl = computeBotAI(p, dt, now);
    else if (p.id !== state.myId) ctrl = p.remoteInput || { moveX: 0, moveY: 0, aimX: 1, aimY: 0, shooting: false };

    // horizontal: eased acceleration feels much better than snapping to full speed
    p.vx += (ctrl.moveX * 350 - p.vx) * damp(dt, p.grounded ? 20 : 9);

    // jetpack with fuel
    const wantThrust = ctrl.moveY < -0.22 && !p.fuelLock && p.fuel > 0;
    if (wantThrust) {
      p.vy += ctrl.moveY * 1450 * dt;
      p.vy = Math.max(p.vy, -460);
      p.fuel = Math.max(0, p.fuel - JET.drain * dt);
      p.fuelDelay = JET.delay;
      if (p.fuel <= 0 && JET.drain > 0) p.fuelLock = true;
    } else {
      p.vy = Math.min(p.vy + 980 * dt, 680);
      p.fuelDelay = Math.max(0, p.fuelDelay - dt);
      if (p.fuelDelay <= 0) p.fuel = Math.min(JET.max, p.fuel + (p.grounded ? JET.regenGround : JET.regenAir) * dt);
    }
    if (p.fuelLock && p.fuel >= JET.restart) p.fuelLock = false;
    p.thrust = wantThrust;

    p.aimAngle = Math.atan2(ctrl.aimY, ctrl.aimX);
    p.facing = Math.cos(p.aimAngle) >= 0 ? 1 : -1;
    moveAndCollide(p, dt, platforms);

    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) { p.reloadT = 0; p.ammo[p.weaponIdx] = WEAPONS[p.weaponIdx].mag; }
    }
    if (ctrl.shooting) fireWeapon(p, now);
  });

  stepBullets(dt, platforms, map);
  stepGrenades(dt, platforms);

  for (let i = state.clouds.length - 1; i >= 0; i--) {
    const cl = state.clouds[i];
    cl.life -= dt;
    if (cl.kind === 'gas') {
      cl.tick += dt;
      if (cl.tick >= 0.5) {
        cl.tick -= 0.5;
        Object.values(state.players).forEach((p) => {
          if (p.hp > 0 && Math.hypot(p.x - cl.x, p.y - cl.y) < cl.r) damagePlayer(p, 14, cl.ownerId, 'GREEN GAS', p.x, p.y - 20, 'gas', 0);
        });
      }
    }
    if (cl.life <= 0) state.clouds.splice(i, 1);
  }

  for (let i = state.killFeed.length - 1; i >= 0; i--) {
    state.killFeed[i].life -= dt;
    if (state.killFeed[i].life <= 0) state.killFeed.splice(i, 1);
  }
}

function moveAndCollide(p, dt, platforms) {
  const hw = 18, hh = 30;
  p.grounded = false;
  p.x += p.vx * dt;
  for (const pl of platforms) {
    if (p.x + hw > pl.x && p.x - hw < pl.x + pl.w && p.y + hh > pl.y && p.y - hh < pl.y + pl.h) {
      p.x = p.vx > 0 ? pl.x - hw : pl.x + pl.w + hw;
      p.vx = 0;
    }
  }
  p.y += p.vy * dt;
  for (const pl of platforms) {
    if (p.x + hw > pl.x && p.x - hw < pl.x + pl.w && p.y + hh > pl.y && p.y - hh < pl.y + pl.h) {
      if (p.vy > 0) { p.y = pl.y - hh; p.vy = 0; p.grounded = true; }
      else if (p.vy < 0) { p.y = pl.y + pl.h + hh; p.vy = 0; }
    }
  }
}

function computeBotAI(bot, dt, now) {
  bot.aiTimer -= dt;
  if (bot.aiTimer <= 0) {
    bot.aiTimer = 0.8 + Math.random() * 1.1;
    bot.aiDir = Math.random() < 0.5 ? -1 : 1;
    bot.aimErr = rand(-0.07, 0.07);
    if (Math.random() < 0.3 && bot.weaponIdx !== 4) setPlayerWeapon(bot, BOT_WEAPONS[Math.floor(Math.random() * BOT_WEAPONS.length)], now);
  }
  let nearest = null, bestDist = 99999;
  Object.values(state.players).forEach((o) => {
    if (o.id !== bot.id && o.hp > 0) { const d = Math.hypot(o.x - bot.x, o.y - bot.y); if (d < bestDist) { bestDist = d; nearest = o; } }
  });
  if (!nearest) return { moveX: 0, moveY: 0, aimX: 1, aimY: 0, shooting: false };
  const dx = nearest.x - bot.x, dy = nearest.y - bot.y, dist = Math.hypot(dx, dy) || 1;
  if (dist < 95 && bot.weaponIdx !== 4) setPlayerWeapon(bot, 4, now);
  else if (dist > 150 && bot.weaponIdx === 4) setPlayerWeapon(bot, BOT_WEAPONS[Math.floor(Math.random() * BOT_WEAPONS.length)], now);
  if (dist > 220 && dist < 520 && Math.random() < dt * 0.1) spawnGrenade(bot, Math.random() < 0.7 ? 0 : 2);
  const ang = Math.atan2(dy, dx) + (bot.aimErr || 0);
  return {
    moveX: dist > 250 ? Math.sign(dx) * 0.75 : bot.aiDir * 0.6,
    moveY: (dy < -60 || bot.y > 950) && bot.fuel > 12 ? -0.8 : 0,
    aimX: Math.cos(ang), aimY: Math.sin(ang), shooting: dist < (bot.weaponIdx === 4 ? 80 : 680)
  };
}

// ==========================================================================
// 11. COMBAT FX ENGINE (local, pooled particles — driven by network "events")
// ==========================================================================
const FXS = { parts: [], pool: [], nums: [], trauma: 0, kickX: 0, kickY: 0, zoomPunch: 0, flash: 0, hitMarker: 0, hitKill: false, maxParts: 320, t: 0 };
const Local = {};
function L(id) { return Local[id] || (Local[id] = { rx: null, ry: null, recoil: 0, jetAcc: 0, flash: 0 }); }

const glowCache = {};
function glowSprite(color) {
  if (glowCache[color]) return glowCache[color];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.28, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  c.aspect = 1;
  return (glowCache[color] = c);
}

/** kind: spr | glow | streak | casing | ring | dot */
function part(kind, spr, x, y, vx, vy, life, s0, s1, a, o) {
  if (FXS.parts.length >= FXS.maxParts && !(o && o.prio)) return null;
  const p = FXS.pool.pop() || {};
  p.k = kind; p.spr = spr; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = 0; p.life = life;
  p.s0 = s0; p.s1 = s1; p.a = a;
  p.rot = (o && o.rot) || 0; p.vr = (o && o.vr) || 0; p.drag = (o && o.drag) || 0; p.grav = (o && o.grav) || 0;
  p.add = !!(o && o.add); p.col = (o && o.col) || '#fff'; p.len = (o && o.len) || 0; p.w = (o && o.w) || 2;
  p.fi = (o && o.fi) || 0; p.rest = false;
  FXS.parts.push(p);
  return p;
}

function addShake(power, dx, dy) {
  if (!settings.shake || power <= 0.01) return;
  FXS.trauma = Math.min(1, FXS.trauma + power * 0.7);
  const k = 16 * power;
  FXS.kickX = clamp(FXS.kickX + (dx || 0) * k, -22, 22);
  FXS.kickY = clamp(FXS.kickY + (dy || 0) * k, -22, 22);
  if (power > 0.3) FXS.zoomPunch -= power * 0.03;
}

function addDamageNumber(x, y, val, col, size, tg) {
  for (const n of FXS.nums) { // merge shotgun pellets / ticks on the same target
    if (n.tg === tg && n.col === col && n.t < 0.28) { n.val += val; n.txt = String(Math.round(n.val)); n.t = 0; n.pop = 1; n.size = Math.min(1.9, n.size + 0.12); return; }
  }
  if (FXS.nums.length > 26) FXS.nums.shift();
  FXS.nums.push({ x: x + rand(-8, 8), y, vy: -70, t: 0, life: 0.95, val, txt: String(Math.round(val)), col, size, tg, pop: 1 });
}

function fxMuzzle(x, y, ang, wp) {
  const fx = SPRITES.fx;
  const big = wp.type === 'sniper' || wp.type === 'rocket' || wp.id === 5;
  const sz = big ? 84 : wp.id === 2 ? 60 : 46;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  if (fx.muzzle) part('spr', fx.muzzle, x, y, 0, 0, 0.075, sz * 0.8, sz * 1.25, 0.95, { add: true, rot: rand(0, 6.28), prio: true });
  part('glow', glowSprite(wp.color), x, y, 0, 0, 0.09, sz * 1.9, sz, 0.75, { add: true, prio: true });
  if (big && fx.smokeWhite) part('spr', fx.smokeWhite, x + ca * 8, y + sa * 8, ca * 50, sa * 50 - 14, 0.7, 14, 46, 0.32, { drag: 2.2, fi: 0.1, rot: rand(-.3, .3) });
  const n = big ? 6 : 3;
  for (let i = 0; i < n; i++) {
    const a = ang + rand(-0.4, 0.4), sp = rand(260, 650);
    part('streak', null, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.07, 0.15), 0, 0, 1, { add: true, col: wp.color, len: 0.03, w: 1.6, grav: 300 });
  }
}

function fxCasing(x, y, ang, wp, facing) {
  if (!wp.casing) return;
  if (wp.casing === 'small' && Math.random() < 0.5) return; // uzi: every other shot
  const kinds = { small: [3.4, 1.7, '#e6b84d'], med: [5, 2.2, '#e9c25a'], rifle: [7, 2.4, '#d8ad45'], shell: [8, 3.6, '#d1342b'] };
  const k = kinds[wp.casing];
  // eject up and backwards relative to the aim direction
  const px = -Math.sin(ang) * facing, py = Math.cos(ang) * facing;
  const vx = -Math.cos(ang) * rand(40, 90) + px * rand(-120, -50) + rand(-25, 25);
  const vy = -rand(150, 270) + py * -40;
  const p = part('casing', null, x - Math.cos(ang) * 18, y - Math.sin(ang) * 18, vx, vy, rand(1.1, 1.6), k[0], k[1], 1, { col: k[2], grav: 950, rot: rand(0, 6.28), vr: rand(-18, 18) });
  if (p) p.w = k[1];
}

function fxHit(ev) {
  const fx = SPRITES.fx, k = ev.k, a = ev.a || 0;
  const back = a + Math.PI;
  const sparksN = (n, col, spread, spd) => {
    for (let i = 0; i < n; i++) {
      const ang = back + rand(-spread, spread), sp = rand(spd * 0.4, spd);
      part('streak', null, ev.x, ev.y, Math.cos(ang) * sp, Math.sin(ang) * sp, rand(0.12, 0.3), 0, 0, 1, { add: true, col, len: 0.028, w: 1.8, grav: 900 });
    }
  };
  if (k === 'metal') {
    if (fx.sparks) part('spr', fx.sparks, ev.x, ev.y, 0, 0, 0.16, 26, 46, 0.95, { add: true, rot: rand(0, 6.28), prio: true });
    sparksN(8, '#ffd27a', 1.0, 650);
    part('glow', glowSprite('#ffb54a'), ev.x, ev.y, 0, 0, 0.12, 50, 22, 0.7, { add: true });
  } else if (k === 'shield') {
    if (fx.sparks) part('spr', fx.sparks, ev.x, ev.y, 0, 0, 0.18, 34, 56, 0.9, { add: true, rot: rand(0, 6.28), prio: true });
    sparksN(7, '#7dd3fc', 1.1, 560);
  } else if (k === 'flesh') {
    if (fx.sparks) part('spr', fx.sparks, ev.x, ev.y, 0, 0, 0.15, 24, 42, 0.9, { add: true, rot: rand(0, 6.28) });
    sparksN(4, '#ffd9b0', 0.9, 380);
  } else if (k === 'gas') {
    if (fx.smokeGreen) part('spr', fx.smokeGreen, ev.x, ev.y, rand(-20, 20), -30, 0.5, 14, 30, 0.45, { drag: 2, fi: 0.2 });
  } else { // wall / wood / sand / rock
    if (fx.dust) part('spr', fx.dust, ev.x, ev.y, Math.cos(back) * 40, Math.sin(back) * 40 - 12, 0.4, 20, 52, 0.5, { drag: 3, fi: 0.1 });
    const col = k === 'wood' ? '#b88650' : k === 'sand' ? '#c9b27a' : '#8c8f86';
    for (let i = 0; i < 3; i++) {
      const ang = back + rand(-0.9, 0.9), sp = rand(90, 260);
      part('casing', null, ev.x, ev.y, Math.cos(ang) * sp, Math.sin(ang) * sp - 40, rand(0.35, 0.7), 2.4, 2.4, 1, { col, grav: 800, rot: rand(0, 6), vr: rand(-12, 12) });
    }
  }
}

function fxExplosion(x, y, r) {
  const fx = SPRITES.fx;
  if (fx.explosion) part('spr', fx.explosion, x, y, 0, 0, 0.55, r * 1.0, r * 1.75, 1, { prio: true, rot: rand(-0.3, 0.3) });
  part('glow', glowSprite('#ff9a3c'), x, y, 0, 0, 0.32, r * 2.6, r * 3.8, 0.85, { add: true, prio: true });
  part('ring', null, x, y, 0, 0, 0.38, r * 0.25, r * 1.3, 0.9, { add: true, col: '#ffd9a0', w: 7, prio: true });
  if (fx.fire) for (let i = 0; i < 5; i++) {
    const a = rand(0, 6.28), sp = rand(60, 250);
    part('spr', fx.fire, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 50, rand(0.35, 0.6), r * 0.34, r * 0.1, 0.9, { add: true, drag: 1.5 });
  }
  if (fx.smokeWhite) for (let i = 0; i < 4; i++) {
    part('spr', fx.smokeWhite, x + rand(-r * 0.3, r * 0.3), y + rand(-r * 0.2, r * 0.2), rand(-40, 40), -rand(30, 90), rand(1.1, 1.8), r * 0.5, r * 1.3, 0.55, { drag: 1.3, fi: 0.08, rot: rand(-.3, .3) });
  }
  if (fx.dust) for (let s = -1; s <= 1; s += 2) part('spr', fx.dust, x, y + 20, s * rand(120, 200), -20, 0.65, r * 0.55, r * 1.2, 0.6, { drag: 2.4, fi: 0.1 });
  for (let i = 0; i < 16; i++) {
    const a = rand(0, 6.28), sp = rand(300, 820);
    part('streak', null, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.25, 0.55), 0, 0, 1, { add: true, col: Math.random() < 0.5 ? '#ffb84d' : '#ffe9a8', len: 0.03, w: 2.2, grav: 700 });
  }
}

function fxDeath(x, y) {
  const fx = SPRITES.fx;
  if (fx.explosion) part('spr', fx.explosion, x, y, 0, 0, 0.45, 70, 130, 0.95, { prio: true });
  part('glow', glowSprite('#ffb54a'), x, y, 0, 0, 0.3, 120, 180, 0.7, { add: true, prio: true });
  for (let i = 0; i < 10; i++) {
    const a = rand(0, 6.28), sp = rand(150, 480);
    part('streak', null, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120, rand(0.3, 0.6), 0, 0, 1, { add: true, col: '#ffd27a', len: 0.03, w: 2, grav: 800 });
  }
}

/** Single entry point for combat feedback. The host calls it directly; clients receive the same events in snapshots. */
function handleEvent(ev) {
  const me = state.players[state.myId];
  const mine = ev.o === state.myId;
  const dist = me && ev.x !== undefined ? Math.hypot(ev.x - me.x, ev.y - me.y) : 0;
  const vol = clamp(1 - dist / 1150, 0, 1);
  const pan = me && ev.x !== undefined ? clamp((ev.x - me.x) / 700, -0.9, 0.9) : 0;
  switch (ev.t) {
    case 'shot': {
      const wp = WEAPONS[ev.w]; if (!wp) break;
      AudioSys.playWeapon(ev.w, mine ? 1 : vol * 0.9, mine ? 0 : pan);
      const shooter = state.players[ev.o];
      if (wp.type === 'melee') { if (SPRITES.fx.sparks) part('spr', SPRITES.fx.sparks, ev.x, ev.y, 0, 0, 0.16, 30, 50, 0.9, { add: true, rot: rand(0, 6.28) }); }
      else if (wp.type !== 'shield') { fxMuzzle(ev.x, ev.y, ev.a, wp); fxCasing(ev.x, ev.y, ev.a, wp, shooter ? shooter.facing : 1); }
      L(ev.o).recoil = Math.max(L(ev.o).recoil, 2 + wp.kick * 0.055);
      if (wp.shake) addShake(wp.shake * (mine ? 1 : 0.45 * vol), -Math.cos(ev.a), -Math.sin(ev.a));
      break;
    }
    case 'hit': {
      fxHit(ev);
      if (ev.d > 0) {
        const sz = 0.85 + Math.min(ev.d, 100) / 100 * 0.8;
        if (ev.tg === state.myId) addDamageNumber(ev.x, ev.y - 26, ev.d, '#ff6b6b', 1.0, ev.tg);
        else if (mine) addDamageNumber(ev.x, ev.y - 26, ev.d, ev.k === 'gas' ? '#86efac' : '#fff1a8', sz, ev.tg);
        else addDamageNumber(ev.x, ev.y - 26, ev.d, '#c9d3c8', 0.7, ev.tg);
        const t = state.players[ev.tg]; if (t) L(t.id).flash = 0.09;
      }
      if (mine && ev.d > 0 && ev.tg !== state.myId) { FXS.hitMarker = 0.22; FXS.hitKill = false; AudioSys.synth('tick', 0.7); }
      if (ev.tg === state.myId && ev.d > 0) {
        const dv = $('damageVignette'); dv.classList.remove('flash'); void dv.offsetWidth; dv.classList.add('flash');
        addShake(0.2, 0, 0); AudioSys.synth('thud', 0.6);
        if (navigator.vibrate && isTouchUI()) { try { navigator.vibrate(18); } catch (e) { /* ignore */ } }
      }
      if (ev.k === 'metal' || ev.k === 'shield') AudioSys.synth('ping', 0.55 * vol, pan);
      break;
    }
    case 'boom': {
      fxExplosion(ev.x, ev.y, ev.r);
      AudioSys.synth('boom', clamp(vol * 1.3, 0.15, 1), pan);
      addShake(0.8 * clamp(1 - dist / 1000, 0, 1), 0, 0);
      FXS.flash = Math.max(FXS.flash, 0.28 * clamp(1 - dist / 600, 0, 1));
      break;
    }
    case 'kill': {
      fxDeath(ev.x, ev.y);
      if (mine && ev.tg !== state.myId) { FXS.hitMarker = 0.4; FXS.hitKill = true; AudioSys.synth('kill', 0.9); }
      if (ev.tg === state.myId) addShake(0.55, 0, 0);
      break;
    }
    case 'use': {
      const w = WEAPONS[ev.w];
      AudioSys.playWeapon(ev.w, mine ? 1 : vol * 0.8, mine ? 0 : pan);
      if (SPRITES.fx.sparks) part('spr', SPRITES.fx.sparks, ev.x, ev.y, 0, -30, 0.4, 50, 90, 0.9, { add: true, prio: true });
      part('ring', null, ev.x, ev.y, 0, 0, 0.45, 12, 60, 0.8, { add: true, col: w ? w.color : '#fff', w: 3 });
      if (ev.k === 'heal' && ev.v > 0) addDamageNumber(ev.x, ev.y - 30, ev.v, '#4ade80', 1.0, 'heal' + ev.o);
      if (ev.k === 'armor') addDamageNumber(ev.x, ev.y - 30, ev.v, '#7dd3fc', 0.9, 'armor' + ev.o);
      break;
    }
    case 'throw': AudioSys.synth('click', 0.4 * vol, pan); break;
    case 'reload': if (mine) AudioSys.synth('click', 0.6); break;
    case 'dry': if (mine) AudioSys.synth('click', 0.7); break;
    case 'spawn': part('ring', null, ev.x, ev.y, 0, 0, 0.6, 10, 80, 0.8, { add: true, col: '#a3e635', w: 3, prio: true }); break;
    default: break;
  }
}

function groundBelow(x, y, maxD) {
  const pls = getActivePlatforms();
  let best = null;
  for (let i = 0; i < pls.length; i++) {
    const pl = pls[i];
    if (x > pl.x && x < pl.x + pl.w && pl.y >= y - 2) { const d = pl.y - y; if (d <= maxD && (best === null || d < best)) best = d; }
  }
  return best;
}

function updateLocalFx(dt) {
  const fx = SPRITES.fx;
  for (const id in state.players) {
    const p = state.players[id];
    if (p.hp <= 0 || !p.thrust) continue;
    const l = L(id);
    l.jetAcc += dt;
    while (l.jetAcc > 0.022) { // ~45 flame puffs per second
      l.jetAcc -= 0.022;
      const bx = (l.rx === null ? p.x : l.rx) - p.facing * 14, by = (l.ry === null ? p.y : l.ry) + 16;
      if (fx.fire) part('spr', fx.fire, bx + rand(-2, 2), by, rand(-22, 22) - p.vx * 0.15, rand(190, 320) + p.vy * 0.2, rand(0.16, 0.27), 17, 6, 0.95, { add: true, rot: Math.PI });
      if (fx.smokeWhite && Math.random() < 0.55) part('spr', fx.smokeWhite, bx + rand(-3, 3), by + 8, rand(-20, 20), rand(40, 90), rand(0.55, 0.95), 10, 34, 0.32, { drag: 1.6, fi: 0.1, rot: rand(-.4, .4) });
      const gd = groundBelow(bx, by, 95);
      if (gd !== null && fx.dust && Math.random() < 0.5) {
        const s = Math.random() < 0.5 ? -1 : 1;
        part('spr', fx.dust, bx, by + gd - 2, s * rand(90, 190), -rand(5, 25), rand(0.35, 0.6), 16, 46, 0.42 * (1 - gd / 110), { drag: 2.8, fi: 0.1 });
      }
    }
  }
  // rocket smoke trail + grenade fuse smoke
  for (const b of state.bullets) {
    if (b.type !== 'rocket') continue;
    if (Math.random() < dt * 70) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      if (fx.smokeWhite) part('spr', fx.smokeWhite, b.x - b.vx / sp * 12, b.y - b.vy / sp * 12, rand(-15, 15), rand(-15, 15), rand(0.5, 0.9), 8, 30, 0.4, { drag: 1.5, fi: 0.1 });
      if (fx.fire) part('spr', fx.fire, b.x - b.vx / sp * 10, b.y - b.vy / sp * 10, 0, 0, 0.14, 14, 5, 0.9, { add: true, rot: Math.atan2(b.vy, b.vx) - Math.PI / 2 });
    }
  }
  for (const g of state.grenades) {
    if (Math.random() < dt * 22 && fx.smokeWhite) part('spr', fx.smokeWhite, g.x, g.y - 8, rand(-12, 12), rand(-30, -10), 0.5, 5, 14, 0.28, { drag: 1.5 });
  }
}

function updateParticles(dt) {
  const parts = FXS.parts, pls = getActivePlatforms();
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life) { FXS.pool.push(p); parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    if (p.rest) continue;
    if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.k === 'casing' && p.vy > 0) {
      for (let k = 0; k < pls.length; k++) {
        const pl = pls[k];
        if (p.x > pl.x && p.x < pl.x + pl.w && p.y > pl.y && p.y < pl.y + 14) {
          p.y = pl.y - 1; p.vy *= -0.38; p.vx *= 0.55; p.vr *= 0.4;
          if (Math.abs(p.vy) < 45) { p.vy = 0; p.vx = 0; p.vr = 0; p.rest = true; }
          break;
        }
      }
    }
  }
  for (let i = FXS.nums.length - 1; i >= 0; i--) {
    const n = FXS.nums[i];
    n.t += dt; n.y += n.vy * dt; n.vy *= Math.exp(-2.2 * dt); n.pop = Math.max(0, n.pop - dt * 6);
    if (n.t >= n.life) FXS.nums.splice(i, 1);
  }
  FXS.trauma = Math.max(0, FXS.trauma - dt * 1.9);
  const kd = Math.exp(-14 * dt); FXS.kickX *= kd; FXS.kickY *= kd;
  FXS.zoomPunch *= Math.exp(-7 * dt);
  FXS.flash = Math.max(0, FXS.flash - dt * 1.8);
  FXS.hitMarker = Math.max(0, FXS.hitMarker - dt);
  FXS.t += dt;
}

function drawParticles() {
  const parts = FXS.parts;
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.add !== (pass === 1)) continue;
      const u = p.t / p.life;
      let a = p.a * (1 - u);
      if (p.fi && u < p.fi) a *= u / p.fi;
      if (a <= 0.01) continue;
      switch (p.k) {
        case 'spr': case 'glow': {
          const s = p.spr; if (!s) break;
          const size = p.s0 + (p.s1 - p.s0) * u, w = size, h = size / (s.aspect || 1);
          ctx.globalAlpha = a > 1 ? 1 : a;
          if (p.rot) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(s, -w / 2, -h / 2, w, h); ctx.restore(); }
          else ctx.drawImage(s, p.x - w / 2, p.y - h / 2, w, h);
          break;
        }
        case 'streak':
          ctx.globalAlpha = a; ctx.strokeStyle = p.col; ctx.lineWidth = p.w; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * p.len, p.y - p.vy * p.len); ctx.stroke();
          break;
        case 'casing':
          ctx.globalAlpha = p.rest ? Math.min(1, (1 - u) * 3) : 1; ctx.fillStyle = p.col;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s0 / 2, -p.w / 2, p.s0, p.w); ctx.restore();
          break;
        case 'ring':
          ctx.globalAlpha = a; ctx.strokeStyle = p.col; ctx.lineWidth = Math.max(0.5, p.w * (1 - u));
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - u, 2)), 0, 6.2832); ctx.stroke();
          break;
        default: break;
      }
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

// ==========================================================================
// 12. VIEW / QUALITY / CAMERA
// ==========================================================================
const view = { w: window.innerWidth, h: window.innerHeight, scale: 1, autoCap: Infinity, fxMul: 1, shakeX: 0, shakeY: 0, vignette: null };

function buildVignette() {
  const c = document.createElement('canvas'); c.width = 160; c.height = 90;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(80, 45, 28, 80, 45, 100);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, 160, 90);
  view.vignette = c;
}

function applyQuality(force) {
  const dpr = window.devicePixelRatio || 1;
  let cap = settings.quality === 'high' ? 3 : settings.quality === 'low' ? 1 : (isTouchUI() ? 2 : 2.5);
  if (settings.quality === 'auto') cap = Math.min(cap, view.autoCap);
  let sc = Math.min(dpr, cap);
  if (settings.quality === 'auto') {
    const maxPx = isTouchUI() ? 2.9e6 : 6.5e6; // never let a 4K / 3x phone panel blow the fill-rate budget
    while (sc > 1 && view.w * view.h * sc * sc > maxPx) sc -= 0.1;
  }
  sc = Math.max(sc, Math.min(1, dpr));
  const pw = Math.max(1, Math.round(view.w * sc)), ph = Math.max(1, Math.round(view.h * sc));
  if (force || canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  view.scale = canvas.width / view.w;
  FXS.maxParts = Math.round((settings.quality === 'low' ? 110 : isTouchUI() ? 210 : 340) * view.fxMul);
  if (!view.vignette) buildVignette();
}

function resizeCanvas() {
  const vv = window.visualViewport;
  view.w = Math.max(1, Math.round(vv && !document.fullscreenElement ? vv.width : window.innerWidth));
  view.h = Math.max(1, Math.round(vv && !document.fullscreenElement ? vv.height : window.innerHeight));
  applyQuality(false);
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);

function worldToScreen(x, y) {
  const c = state.camera;
  return { x: view.w / 2 + (x - c.x) * c.zoom + view.shakeX, y: view.h / 2 + (y - c.y) * c.zoom + view.shakeY };
}

let kbdWas = false;
function updateInput() {
  let kx = 0, ky = 0;
  if (keys.KeyA || keys.ArrowLeft) kx -= 1;
  if (keys.KeyD || keys.ArrowRight) kx += 1;
  if (keys.KeyW || keys.ArrowUp || keys.Space) ky -= 1;
  if (keys.KeyS || keys.ArrowDown) ky += 1;
  if (kx || ky) { input.moveX = kx; input.moveY = ky; kbdWas = true; }
  else if (kbdWas) { input.moveX = 0; input.moveY = 0; kbdWas = false; }

  // Mouse aim is computed from the player's *current* screen position, so it stays correct while the camera moves.
  const me = state.players[state.myId];
  if (me && mouse.seen && !aimActive && !document.body.classList.contains('touch-active')) {
    const l = L(me.id);
    const sp = worldToScreen(l.rx === null ? me.x : l.rx, (l.ry === null ? me.y : l.ry));
    const dx = mouse.x - sp.x, dy = mouse.y - sp.y, len = Math.hypot(dx, dy);
    if (len > 3) { input.aimX = dx / len; input.aimY = dy / len; }
  }
}

function updateRenderPositions(dt) {
  for (const id in state.players) {
    const p = state.players[id], l = L(id);
    if (l.rx === null || state.isHost || Math.hypot(p.x - l.rx, p.y - l.ry) > 260) { l.rx = p.x; l.ry = p.y; }
    else { const k = damp(dt, 22); l.rx += (p.x - l.rx) * k; l.ry += (p.y - l.ry) * k; }
    l.recoil *= Math.exp(-16 * dt);
    if (l.flash > 0) l.flash -= dt;
  }
}

let camAim = 0;
function updateCamera(dt) {
  const me = state.players[state.myId];
  if (!me) return;
  const cam = state.camera, l = L(me.id);
  const baseZoom = Math.max(clamp(view.h / 520, 0.7, 1.25), view.w / WORLD.width, view.h / WORLD.height);
  const speed = Math.hypot(me.vx, me.vy);
  const target = baseZoom * (state.sniperZoom ? 0.74 : 1) * (1 - clamp(speed / 1800, 0, 0.045)) * (1 + FXS.zoomPunch);
  cam.zoom += (Math.max(target, view.w / WORLD.width, view.h / WORLD.height) - cam.zoom) * damp(dt, 5);

  // look-ahead: camera leads toward where you aim (strongest with the zoomed-out sniper view)
  const aiming = aimActive || (mouse.seen && !document.body.classList.contains('touch-active')) || !isTouchUI();
  camAim += ((aiming ? 1 : 0) - camAim) * damp(dt, 4);
  const la = (state.sniperZoom ? 330 : 135) * camAim;
  const rx = l.rx === null ? me.x : l.rx, ry = l.ry === null ? me.y : l.ry;
  const tx = rx + input.aimX * la + me.vx * 0.16;
  const ty = ry + input.aimY * la * 0.8 + me.vy * 0.08 - 24;
  cam.x += (tx - cam.x) * damp(dt, 7);
  cam.y += (ty - cam.y) * damp(dt, 7);

  const halfW = view.w / (2 * cam.zoom), halfH = view.h / (2 * cam.zoom);
  cam.x = halfW * 2 >= WORLD.width ? WORLD.width / 2 : clamp(cam.x, halfW, WORLD.width - halfW);
  cam.y = halfH * 2 >= WORLD.height ? WORLD.height / 2 : clamp(cam.y, halfH, WORLD.height - halfH);

  // trauma-based shake (smooth noise) + directional recoil kick
  const tr = FXS.trauma * FXS.trauma, tt = FXS.t;
  view.shakeX = settings.shake ? FXS.kickX + Math.sin(tt * 63) * 9 * tr : 0;
  view.shakeY = settings.shake ? FXS.kickY + Math.sin(tt * 71 + 1.7) * 9 * tr : 0;
}

// ==========================================================================
// 13. RENDERING
// ==========================================================================
function rayRect(ox, oy, dx, dy, r) {
  let tmin = 0, tmax = Infinity;
  if (dx !== 0) { let t1 = (r.x - ox) / dx, t2 = (r.x + r.w - ox) / dx; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
  else if (ox < r.x || ox > r.x + r.w) return Infinity;
  if (dy !== 0) { let t1 = (r.y - oy) / dy, t2 = (r.y + r.h - oy) / dy; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
  else if (oy < r.y || oy > r.y + r.h) return Infinity;
  return tmax >= tmin && tmax >= 0 ? tmin : Infinity;
}

function renderGame(now) {
  const sc = view.scale;
  ctx.setTransform(sc, 0, 0, sc, 0, 0);
  ctx.imageSmoothingEnabled = settings.quality !== 'low' || sc > 1;
  ctx.imageSmoothingQuality = settings.quality === 'low' ? 'low' : 'high';
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#080c09';
  ctx.fillRect(0, 0, view.w, view.h);

  const cam = state.camera;
  ctx.save();
  ctx.translate(view.w / 2 + view.shakeX, view.h / 2 + view.shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  const map = MAPS[state.mapId] || MAPS[0];
  const mapImg = Assets.maps[state.mapId];
  if (mapImg) ctx.drawImage(mapImg, 0, 0, WORLD.width, WORLD.height);
  else {
    ctx.fillStyle = '#1b221c'; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = '#4b5563'; map.platforms.forEach((pl) => ctx.fillRect(pl.x, pl.y, pl.w, pl.h));
  }

  (map.props || []).forEach((pr) => {
    const s = Assets.props[pr.kind];
    if (!s) return;
    const r = propRect(pr);
    ctx.drawImage(s, r.x, r.y, r.w, r.h);
  });

  for (const id in state.players) { const p = state.players[id]; if (p.hp > 0) drawPlayer(p, now); }
  drawProjectiles(now);
  drawClouds();
  drawLaser();
  drawParticles();
  drawDamageNumbers();
  ctx.restore();

  // ---- screen-space overlays ----
  if (view.vignette) ctx.drawImage(view.vignette, 0, 0, view.w, view.h);
  if (FXS.flash > 0.01) { ctx.fillStyle = `rgba(255,236,200,${Math.min(0.5, FXS.flash)})`; ctx.fillRect(0, 0, view.w, view.h); }
  drawCrosshair();
}

function drawPlayer(p, now) {
  const l = L(p.id), isMe = p.id === state.myId;
  const x = l.rx === null ? p.x : l.rx, y = l.ry === null ? p.y : l.ry;
  const aim = isMe ? Math.atan2(input.aimY, input.aimX) : p.aimAngle;
  const facing = Math.cos(aim) >= 0 ? 1 : -1;
  const widx = isMe ? myWeapon() : p.weaponIdx;
  const wp = WEAPONS[widx];

  // ground shadow
  const gd = groundBelow(x, y + 30, 420);
  if (gd !== null) {
    ctx.fillStyle = `rgba(0,0,0,${0.38 * (1 - gd / 420)})`;
    ctx.beginPath(); ctx.ellipse(x, y + 30 + gd, 20 * (1 - gd / 700), 5, 0, 0, 6.2832); ctx.fill();
  }

  // body (lean into movement, idle breathing / run bob)
  const moving = Math.abs(p.vx) > 40 && p.grounded;
  const bob = moving ? Math.sin(now * 0.016) * 1.8 : Math.sin(now * 0.003 + x) * 0.8;
  const lean = clamp(p.vx / 350, -1, 1) * 0.11 * facing * (p.thrust ? 1.4 : 1);
  const spr = Assets.chars[p.charId];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean * facing);
  ctx.scale(facing, 1);
  if (spr) {
    const h = 68, w = h * spr.aspect;
    ctx.drawImage(spr, -w * 0.42, -37 + bob, w, h);
    if (l.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.55, l.flash * 7); ctx.drawImage(spr, -w * 0.42, -37 + bob, w, h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  } else { ctx.fillStyle = '#4b633c'; ctx.fillRect(-16, -26, 32, 54); }
  ctx.restore();

  // held weapon
  const ws = Assets.weapons[widx];
  if (ws && wp) {
    ctx.save();
    ctx.translate(x, y + 4);
    ctx.rotate(aim);
    if (facing < 0) ctx.scale(1, -1);
    const dh = wp.dw / ws.aspect;
    ctx.drawImage(ws, wp.grip - l.recoil, -dh * 0.56, wp.dw, dh);
    ctx.restore();
  }

  // name tag + health bar (constant on-screen size regardless of zoom)
  ctx.save();
  ctx.translate(x, y - 46);
  ctx.scale(1 / state.camera.zoom, 1 / state.camera.zoom);
  ctx.font = '700 13px Rajdhani, "Segoe UI", sans-serif';
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.fillStyle = isMe ? '#d9f99d' : '#ffffff';
  ctx.strokeText(p.name, 0, -9); ctx.fillText(p.name, 0, -9);
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(-24, -6, 48, 6);
  ctx.fillStyle = p.hp > 60 ? '#22c55e' : p.hp > 30 ? '#f59e0b' : '#ef4444';
  ctx.fillRect(-23, -5, 46 * clamp(p.hp / p.maxHp, 0, 1), 4);
  if (p.armor > 0) { ctx.fillStyle = '#38bdf8'; ctx.fillRect(-23, -1, 46 * clamp(p.armor / 100, 0, 1), 1.5); }
  ctx.restore();
}

function drawProjectiles(now) {
  const fx = SPRITES.fx;
  // grenades
  for (const g of state.grenades) {
    const s = Assets.grenades[g.gType];
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.x * 0.045 + g.y * 0.02);
    if (s) { const h = 30, w = h * s.aspect; ctx.drawImage(s, -w / 2, -h / 2, w, h); }
    else { ctx.fillStyle = g.gType === 1 ? '#22c55e' : g.gType === 2 ? '#cbd5e1' : '#4b5563'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.2832); ctx.fill(); }
    ctx.restore();
    if (g.fuse < 0.55 && Math.floor(now / 70) % 2 === 0) { // fuse warning blink
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8;
      ctx.drawImage(glowSprite('#ff3b2f'), g.x - 20, g.y - 20, 40, 40);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  // tracers: soft additive glow pass, then a bright core pass
  const bl = state.bullets;
  if (!bl.length) return;
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bl) {
    if (b.type === 'rocket') continue;
    const wp = WEAPONS[b.wi] || WEAPONS[1];
    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    const len = clamp(sp * (wp.type === 'sniper' ? 0.05 : 0.028), 12, 110);
    ctx.strokeStyle = wp.color; ctx.globalAlpha = 0.3; ctx.lineWidth = (wp.tracerW || 1.7) * 3.4;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * len, b.y - uy * len); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const b of bl) {
    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    if (b.type === 'rocket') {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#4b5563'; ctx.fillRect(-13, -3.5, 22, 7);
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(9, -3.5); ctx.lineTo(16, 0); ctx.lineTo(9, 3.5); ctx.fill();
      ctx.fillStyle = '#9ca3af'; ctx.fillRect(-13, -5.5, 4, 11);
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9;
      ctx.drawImage(glowSprite('#ff9a3c'), b.x - ux * 12 - 16, b.y - uy * 12 - 16, 32, 32);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      continue;
    }
    const wp = WEAPONS[b.wi] || WEAPONS[1];
    const len = clamp(sp * (wp.type === 'sniper' ? 0.05 : 0.028), 12, 110) * 0.7;
    ctx.strokeStyle = '#fffbe6'; ctx.globalAlpha = 1; ctx.lineWidth = wp.tracerW || 1.7;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ux * len, b.y - uy * len); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawClouds() {
  for (const cl of state.clouds) {
    const s = cl.kind === 'gas' ? SPRITES.fx.smokeGreen : SPRITES.fx.smokeWhite;
    const max = cl.max || 8, age = max - cl.life;
    const alpha = Math.min(1, age / 0.5) * Math.min(1, cl.life / 1.6) * (cl.kind === 'gas' ? 0.8 : 0.9);
    if (!s) { ctx.fillStyle = cl.kind === 'gas' ? 'rgba(34,197,94,0.5)' : 'rgba(226,232,240,0.7)'; ctx.beginPath(); ctx.arc(cl.x, cl.y, cl.r, 0, 6.2832); ctx.fill(); continue; }
    ctx.globalAlpha = alpha;
    const grow = 0.75 + Math.min(0.25, age * 0.5);
    for (let k = 0; k < 3; k++) { // three slowly rotating puffs read as volumetric smoke
      const ang = k * 2.1 + age * (k % 2 ? 0.18 : -0.14);
      const ox = Math.cos(ang) * cl.r * 0.22, oy = Math.sin(ang) * cl.r * 0.16;
      const w = cl.r * 2 * grow, h = w / (s.aspect || 1.4);
      ctx.save(); ctx.translate(cl.x + ox, cl.y + oy); ctx.rotate(ang * 0.25);
      ctx.drawImage(s, -w / 2, -h / 2, w, h); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function drawLaser() {
  const me = state.players[state.myId];
  if (!me || me.hp <= 0 || myWeapon() !== 3) return;
  const l = L(me.id), wp = WEAPONS[3];
  const ox = (l.rx === null ? me.x : l.rx) + Math.cos(Math.atan2(input.aimY, input.aimX)) * (wp.grip + wp.dw);
  const oy = (l.ry === null ? me.y : l.ry) + 4 + Math.sin(Math.atan2(input.aimY, input.aimX)) * (wp.grip + wp.dw);
  let t = 1600;
  const rects = getActivePlatforms().concat(solidProps(MAPS[state.mapId] || MAPS[0]).map((s) => propRect(s.pr)));
  for (const r of rects) { const tt = rayRect(ox, oy, input.aimX, input.aimY, r); if (tt < t && tt > 0) t = tt; }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,60,60,0.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([7, 7]); ctx.lineDashOffset = -FXS.t * 40;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + input.aimX * t, oy + input.aimY * t); ctx.stroke();
  ctx.setLineDash([]);
  ctx.drawImage(glowSprite('#ff3030'), ox + input.aimX * t - 7, oy + input.aimY * t - 7, 14, 14);
  ctx.restore();
}

function drawDamageNumbers() {
  const inv = 1 / state.camera.zoom;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (const n of FXS.nums) {
    const u = n.t / n.life;
    const sc = n.size * (1 + n.pop * 0.5) * inv;
    ctx.save(); ctx.translate(n.x, n.y); ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(1 - Math.pow(u, 2.5), 0, 1);
    ctx.font = '700 19px Rajdhani, "Segoe UI", sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(n.txt, 0, 0); ctx.fillStyle = n.col; ctx.fillText(n.txt, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawCrosshair() {
  const me = state.players[state.myId];
  if (!me || me.hp <= 0) return;
  let sx, sy;
  const l = L(me.id);
  if (aimActive || (isTouchUI() && document.body.classList.contains('touch-active'))) {
    const p = worldToScreen(l.rx === null ? me.x : l.rx, l.ry === null ? me.y : l.ry);
    if (!aimActive) return;
    sx = p.x + input.aimX * 150 * state.camera.zoom; sy = p.y + input.aimY * 150 * state.camera.zoom;
  } else if (mouse.seen) { sx = mouse.x; sy = mouse.y; } else return;

  const reloading = me.reloadT > 0;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.lineCap = 'round';
  const gap = 7 + (WEAPONS[myWeapon()].spread || 0) * 40;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3.4;
  for (let pass = 0; pass < 2; pass++) {
    if (pass) { ctx.strokeStyle = reloading ? '#fbbf24' : '#e8ffc2'; ctx.lineWidth = 1.6; }
    ctx.beginPath();
    ctx.moveTo(-gap - 6, 0); ctx.lineTo(-gap, 0); ctx.moveTo(gap, 0); ctx.lineTo(gap + 6, 0);
    ctx.moveTo(0, -gap - 6); ctx.lineTo(0, -gap); ctx.moveTo(0, gap); ctx.lineTo(0, gap + 6);
    ctx.stroke();
  }
  ctx.fillStyle = '#e8ffc2'; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, 6.2832); ctx.fill();
  if (reloading && me.reloadDur > 0) {
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, gap + 12, -Math.PI / 2, -Math.PI / 2 + 6.2832 * (1 - me.reloadT / me.reloadDur)); ctx.stroke();
  }
  if (FXS.hitMarker > 0) { // hit-marker X (red on a kill)
    const a = Math.min(1, FXS.hitMarker / 0.2), o = 9 + (1 - a) * 4;
    ctx.strokeStyle = FXS.hitKill ? `rgba(255,70,70,${a})` : `rgba(255,255,255,${a})`;
    ctx.lineWidth = FXS.hitKill ? 3 : 2.2;
    ctx.beginPath();
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(cx * o, cy * o); ctx.lineTo(cx * (o + 7), cy * (o + 7)); }
    ctx.stroke();
  }
  ctx.restore();
}

// ==========================================================================
// 14. HUD (DOM is touched only when a value actually changes)
// ==========================================================================
const hudCache = {};
function hudText(id, v) { if (hudCache['t' + id] !== v) { hudCache['t' + id] = v; $(id).textContent = v; } }
function hudWidth(id, pct) { const v = Math.round(pct); if (hudCache['w' + id] !== v) { hudCache['w' + id] = v; $(id).style.width = v + '%'; } }
function hudClass(id, cls, on) { const k = 'c' + id + cls; if (hudCache[k] !== on) { hudCache[k] = on; $(id).classList.toggle(cls, on); } }
function hudSrc(id, v) { if (hudCache['s' + id] !== v) { hudCache['s' + id] = v; $(id).src = v; } }

function weaponIcon(name) {
  const i = WEAPONS.findIndex((w) => w.name === name);
  return i >= 0 ? thumbWeapon(i) : null;
}

let killFeedSig = '';
function renderKillFeed() {
  const sig = state.killFeed.map((k) => k.id).join(',');
  if (sig === killFeedSig) return;
  killFeedSig = sig;
  const el = $('killFeed');
  el.innerHTML = '';
  state.killFeed.forEach((k) => {
    const row = document.createElement('div');
    row.className = 'kill-item' + (k.kid === state.myId ? ' mine' : '');
    const a = document.createElement('span'); a.className = 'k'; a.textContent = k.s ? '' : k.k;
    row.appendChild(a);
    const icon = weaponIcon(k.w);
    if (icon) { const im = document.createElement('img'); im.src = icon; im.alt = k.w; row.appendChild(im); }
    else { const ic = document.createElement('span'); ic.className = 'ico'; ic.textContent = k.w === 'GREEN GAS' ? '☣' : '💥'; row.appendChild(ic); }
    const v = document.createElement('span'); v.className = 'v'; v.textContent = k.v; // textContent: names can never inject HTML
    row.appendChild(v);
    el.appendChild(row);
  });
}

function updateHud() {
  const me = state.players[state.myId];
  if (!me) return;
  const map = MAPS[state.mapId] || MAPS[0];
  const widx = myWeapon(), w = WEAPONS[widx];

  hudWidth('healthBar', clamp(me.hp / me.maxHp, 0, 1) * 100);
  hudClass('healthBar', 'mid', me.hp <= 60 && me.hp > 30);
  hudClass('healthBar', 'low', me.hp <= 30);
  hudText('hpText', `HP ${Math.ceil(me.hp)}`);
  hudWidth('armorBar', clamp(me.armor || 0, 0, 100));
  hudText('armorText', `SHIELD ${Math.ceil(me.armor || 0)}`);
  hudWidth('fuelBar', clamp(me.fuel / JET.max, 0, 1) * 100);
  hudText('fuelText', `JET ${Math.round(me.fuel)}`);
  hudClass('fuelBar', 'empty', !!me.fuelLock || me.fuel <= 0);
  hudClass('fuelBar', 'recharge', !me.thrust && me.fuel < JET.max && me.fuel > 0);
  hudClass('boostBadge', 'hidden', !(me.boostTimer > 0));

  hudText('matchScore', `${map.name.toUpperCase()} • KILLS ${me.kills} • ${Object.keys(state.players).length}/${MAX_PLAYERS}`);
  hudText('matchTimer', formatClock(state.matchTime));

  hudText('hudWeaponName', w.name);
  hudSrc('hudWeaponImg', thumbWeapon(widx));
  const hasMag = w.mag > 0;
  const ammoNow = hasMag ? me.ammo[widx] : null;
  hudText('hudAmmo', hasMag ? String(ammoNow) : '∞');
  hudText('hudAmmoMax', hasMag ? String(w.mag) : '');
  hudClass('hudAmmo', 'low', hasMag && ammoNow <= Math.ceil(w.mag * 0.25));
  if (hudCache.slash !== hasMag) { hudCache.slash = hasMag; document.querySelector('.ammo-line i').style.visibility = hasMag ? 'visible' : 'hidden'; }
  const reloading = me.reloadT > 0 && me.reloadDur > 0;
  hudWidth('reloadFill', reloading ? (1 - me.reloadT / me.reloadDur) * 100 : 0);
  hudClass('reloadLabel', 'hidden', !reloading);
  hudClass('btnReload', 'reloading', reloading);
  if (hudCache.dock !== widx) {
    hudCache.dock = widx;
    document.querySelectorAll('.w-slot').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.w, 10) === widx));
  }

  const dead = me.hp <= 0;
  hudClass('deathOverlay', 'hidden', !dead);
  if (dead) hudText('deathTimer', String(Math.max(1, Math.ceil(me.deadTimer))));
  hudClass('lowHpVignette', 'on', !dead && me.hp < 30);
  renderKillFeed();
}

// ==========================================================================
// 15. MATCH FLOW + MAIN LOOP
// ==========================================================================
function showMatchOverScreen() {
  if (state.mode === 'gameover') return;
  state.mode = 'gameover';
  input.shooting = false; input.moveX = 0; input.moveY = 0;
  const rows = $('finalLeaderboardRows');
  rows.innerHTML = '';
  const sorted = Object.values(state.players).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  sorted.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'sb-row' + (i === 0 ? ' winner' : '') + (p.id === state.myId ? ' me' : '');
    const a = document.createElement('span'); a.textContent = `#${i + 1} ${p.name}`;
    const b = document.createElement('span'); b.className = 'stats'; b.textContent = `K ${p.kills}  D ${p.deaths}`;
    row.append(a, b);
    rows.appendChild(row);
  });
  $('rematchBtn').classList.toggle('hidden', !state.isHost);
  $('matchOverModal').classList.remove('hidden');
}

async function startMatch() {
  await ensureMap(state.mapId); // guarantees the right map image (handles map1.png.jpeg etc.) before the first frame
  state.mode = 'playing';
  $('lobbyScreen').classList.add('hidden');
  settingsDrawer.classList.add('hidden');
  $('gameContainer').classList.remove('hidden');
  document.body.classList.add('playing');

  for (const k in Local) delete Local[k];
  FXS.parts.length = 0; FXS.nums.length = 0; FXS.trauma = 0; FXS.kickX = FXS.kickY = 0; FXS.zoomPunch = 0;
  state.events.length = 0; state.bullets = []; state.grenades = []; state.clouds = []; state.killFeed = []; killFeedSig = '';
  for (const k in hudCache) delete hudCache[k];

  const me = state.players[state.myId];
  state.wantWeapon = me ? me.weaponIdx : null;
  state.myGrenadeType = (state.myGrenadeType + GRENADE_TYPES.length - 1) % GRENADE_TYPES.length;
  cycleGrenadeType(); // refreshes grenade icons / labels
  syncSoldierUI();
  resizeCanvas(); applyQuality(true);
  if (me) { state.camera.x = me.x; state.camera.y = me.y; }
  refreshSettingButtons();

  const hints = $('controlHints');
  if (!isTouchUI()) { hints.classList.remove('hidden', 'fade'); setTimeout(() => hints.classList.add('fade'), 9000); setTimeout(() => hints.classList.add('hidden'), 10000); }
  if (isTouchUI()) enterFullscreenLandscape();

  perf.grace = 3;
  if (!loopRunning) { loopRunning = true; lastFrameTime = performance.now(); requestAnimationFrame(gameLoop); }
}

// ---- adaptive quality (keeps ~60 FPS on weak phones) --------------------------
const perf = { frames: 0, acc: 0, lowCount: 0, grace: 3, fps: 60 };
function samplePerf(dt) {
  perf.frames++; perf.acc += dt;
  if (perf.acc < 1) return;
  perf.fps = Math.round(perf.frames / perf.acc);
  perf.frames = 0; perf.acc = 0;
  if (settings.fps) hudText('fpsCounter', `${perf.fps} FPS • x${view.scale.toFixed(2)}`);
  if (perf.grace > 0) { perf.grace--; return; }
  if (settings.quality !== 'auto' || state.mode !== 'playing' || document.hidden) return;
  if (perf.fps < 48) perf.lowCount++; else perf.lowCount = 0;
  if (perf.lowCount >= 2) {
    perf.lowCount = 0;
    if (view.scale > 1.05) { view.autoCap = Math.max(1, view.scale - 0.4); applyQuality(true); }
    else if (view.fxMul > 0.5) { view.fxMul *= 0.7; applyQuality(false); }
  }
}

let netAcc = 0;
function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  if (dt <= 0) return;
  samplePerf(dt);

  if (state.mode === 'playing') {
    updateInput();
    netAcc += dt;
    if (state.isHost) {
      stepHostSimulation(dt, now);
      const hasPeers = Object.keys(connections).length > 0;
      if (hasPeers && (netAcc >= 1 / 30 || state.matchTime <= 0)) {
        netAcc = 0;
        broadcastToClients({
          type: 'state', players: serializePlayers(),
          bullets: state.bullets.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), type: b.type, wi: b.wi })),
          grenades: state.grenades.map((g) => ({ id: g.id, x: Math.round(g.x), y: Math.round(g.y), vx: Math.round(g.vx), vy: Math.round(g.vy), gType: g.gType, fuse: Math.round(g.fuse * 100) / 100 })),
          clouds: state.clouds.map((c) => ({ x: c.x, y: c.y, r: c.r, life: Math.round(c.life * 10) / 10, max: c.max, kind: c.kind })),
          killFeed: state.killFeed, events: state.events, matchTime: Math.round(state.matchTime * 10) / 10, mapId: state.mapId
        });
        state.events.length = 0;
      } else if (!hasPeers) state.events.length = 0;
    } else {
      state.matchTime -= dt; // smooth countdown between snapshots
      for (const b of state.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
      for (const g of state.grenades) { g.vy += 850 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.fuse -= dt; }
      for (const c of state.clouds) c.life -= dt;
      if (hostConn && hostConn.open && netAcc >= 1 / 30) {
        netAcc = 0;
        try {
          hostConn.send({ type: 'input', id: state.myId, input: { moveX: input.moveX, moveY: input.moveY, aimX: input.aimX, aimY: input.aimY, shooting: input.shooting }, weaponIdx: myWeapon(), gSeq: inputSeq.g, gType: inputSeq.gType | 0, rSeq: inputSeq.r });
        } catch (e) { /* connection hiccup */ }
      }
    }
    if (state.matchTime <= 0) {
      if (state.isHost) broadcastToClients({ type: 'over' });
      showMatchOverScreen();
    }
  }

  if (state.mode === 'playing' || state.mode === 'gameover') {
    updateRenderPositions(dt);
    updateLocalFx(dt);
    updateParticles(dt);
    updateCamera(dt);
    renderGame(now);
    updateHud();
    updateProximityVoiceVolumes();
  }
}

// ==========================================================================
// 16. BOOT
// ==========================================================================
(async function boot() {
  resizeCanvas();
  refreshSettingButtons();
  try {
    await Promise.race([preloadEverything(), new Promise((r) => setTimeout(r, 40000))]);
  } catch (e) { console.error('Preload error', e); }
  Assets.ready = true;

  buildCharacterPickers();
  buildStartWeaponStrip();
  buildWeaponDock();
  syncMapUI();
  const g = GRENADE_TYPES[state.myGrenadeType];
  $('hudGrenadeName').textContent = g.label;
  $('hudGrenadeImg').src = Assets.thumbs.grenades[g.id] || TRANSPARENT_GIF;
  $('btnGrenadeImg').src = Assets.thumbs.grenades[g.id] || TRANSPARENT_GIF;

  state.mode = 'menu';
  setTimeout(() => {
    $('lobbyScreen').classList.remove('hidden');
    $('loadingScreen').classList.add('done');
    setTimeout(() => { const ls = $('loadingScreen'); if (ls) ls.remove(); }, 700);
  }, 300);

  // Warm the other maps quietly, one at a time, so switching maps is instant.
  setTimeout(async () => { for (let i = 0; i < MAPS.length; i++) { await ensureMap(i); await new Promise((r) => setTimeout(r, 120)); } }, 1500);
})();
