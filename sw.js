// Cache-first so the quiz works offline once it has been opened online.
// Bump CACHE whenever any app file changes: that is what makes installed apps update.
const CACHE = "kaartquiz-v39";
const FILES = ["./", "index.html", "style.css", "app.js", "regions/south-america.js", "regions/asia.js",
  "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];

// Fetch past the browser's HTTP cache, so a new version never stores old files.
// A new version takes over as soon as it is downloaded (no waiting until every window is closed),
// so the next refresh or reopen shows it. The page itself never reloads in the middle of a quiz.
self.addEventListener("install", e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting())));

self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

// The page asks for this when she taps "Bijwerken".
self.addEventListener("message", e => { if (e.data === "update") self.skipWaiting(); });

self.addEventListener("fetch", e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
