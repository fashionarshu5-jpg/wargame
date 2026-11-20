const CACHE_NAME = 'doodle-outpost-v6';
const ZW = '%E2%80%8B'; // some sound files start with an invisible zero-width space
const ASSETS = [
  './', './index.html', './style.css', './game.js', './manifest.json',
  ...Array.from({ length: 9 }, (_, i) => `./assets/char${i + 1}.png`),
  ...Array.from({ length: 10 }, (_, i) => `./assets/weap${i + 1}.png`),
  './assets/map1.png.jpeg', './assets/map2.png.jpeg', './assets/map3.png.jpeg', './assets/map10.png.jpeg',
  './assets/map4.png', './assets/map5.png', './assets/map6.png', './assets/map7.png', './assets/map8.png', './assets/map9.png',
  './assets/lobby_bg.png',
  './assets/grenade_frag.png', './assets/grenade_gas.png', './assets/grenade_smoke.png',
  './assets/fx_smoke_white.png', './assets/fx_smoke_green.png', './assets/fx_explosion.png',
  './assets/fx_sparks.png', './assets/fx_fire.png', './assets/fx_dust.png', './assets/fx_muzzle.png',
  './assets/prop_bunker.png', './assets/prop_tower.png', './assets/prop_crate.png',
  './assets/prop_door.png', './assets/prop_sandbag.png', './assets/prop_catwalk.png',
  './assets/prop_pipes.png', './assets/prop_container.png', './assets/prop_cave.png',
  './sounds/w5_chainsaw.mp3',
  ...['w1_shield', 'w2_uzi', 'w3_deagle', 'w4_sniper', 'w6_shotgun', 'w7_rocket', 'w8_ammo_crate', 'w9_gear_crate', 'w10_medkit']
    .flatMap((n) => [`./sounds/${ZW}${n}.mp3`, `./sounds/${n}.mp3`])
];

self.addEventListener('install', (e) => {
  // allSettled: a missing/renamed file must never break installation
  e.waitUntil(caches.open(CACHE_NAME).then((c) => Promise.allSettled(ASSETS.map((u) => c.add(u)))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // PeerJS CDN / fonts: let the browser handle them
  const isCode = req.mode === 'navigate' || /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (isCode) { // network-first so a new deploy is picked up immediately; cache is the offline fallback
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
  } else { // art + audio: cache-first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)); } return res; })));
  }
});
