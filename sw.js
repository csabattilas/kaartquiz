// Cache-first so the quiz works offline once it has been opened online.
// Bump CACHE whenever any app file changes: that is what makes installed apps update.
const CACHE = "kaartquiz-v43";
const AUDIO = "kaartquiz-audio";          // recordings keep their own cache, so an update only fetches new ones
const FILES = ["./", "index.html", "style.css", "app.js", "regions/south-america.js", "regions/asia.js",
  "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];

// Fetch past the browser's HTTP cache, so a new version never stores old files.
// A new version takes over as soon as it is downloaded (no waiting until every window is closed),
// so the next refresh or reopen shows it. The page itself never reloads in the middle of a quiz.
self.addEventListener("install", e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(cacheRecordings)
    .then(() => self.skipWaiting())));

// Recordings are named after their sentence and voice, so a file that is already cached never changes.
const audioPath = req => new URL(req.url).pathname.replace(/^.*?(audio\/)/, "$1");
async function cacheRecordings() {
  try {
    const res = await fetch(new Request("audio/index.json", { cache: "reload" }));
    if (!res.ok) return;
    const index = await res.clone().json(), c = await caches.open(AUDIO);
    await c.put("audio/index.json", res);
    const wanted = new Set(Object.values(index).map(f => "audio/" + f));
    for (const req of await c.keys())
      if (audioPath(req) !== "audio/index.json" && !wanted.has(audioPath(req))) await c.delete(req);
    const have = new Set((await c.keys()).map(audioPath));
    await Promise.all([...wanted].filter(f => !have.has(f)).map(f => c.add(f).catch(() => {})));
  } catch (e) {}                          // no recordings yet, or offline: the app still works
}

self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== AUDIO).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));

// The page asks for this when she taps "Bijwerken".
self.addEventListener("message", e => { if (e.data === "update") self.skipWaiting(); });

self.addEventListener("fetch", e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
