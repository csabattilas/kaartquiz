"use strict";

// ---------- data & settings ----------
const REGIONS = window.REGIONS;
const STORE = "kaartquiz-v1";
const LENGTHS = [5, 10, 20, 0];            // 0 = alle geselecteerde plekken
const SIZES = [["Klein", 100], ["Middel", 250], ["Groot", 500]];
const NS = "http://www.w3.org/2000/svg";

const AUTO = [["Uit", 0], ["1 sec", 1], ["3 sec", 3], ["5 sec", 5], ["10 sec", 10]];   // wait after an answer, then go on by itself
const defaults = () => ({ region: REGIONS[0].id, length: 10, marks: true, auto: 0, detail: true, set: "all", style: "name", retry: false, limit: 0, off: {}, custom: {} });
// Symbol per kind of Feature, following the legend on the Mondus Novus worksheet:
// square = land/gebied, circle = stad/plaats, diamond = water, triangle = gebergte.
// The map shows only the symbol, never the name.
const TYPES = {
  area:     { label: "land / gebied", color: "#2e9e5b" },
  sight:    { label: "stad / plaats", color: "#d64560" },
  river:    { label: "water", color: "#2f8fe0" },
  water:    { label: "water", color: "#2f8fe0" },
  mountain: { label: "gebergte", color: "#e08a3c" },
  island:   { label: "eiland", color: "#159a9c" },
  volcano:  { label: "vulkaan", color: "#e0561e" },
};
const STYLES = [["Waar ligt …?", "name"], ["Omschrijving, tik op de kaart", "clue"], ["Meerkeuze", "choice"], ["Naam typen", "type"], ["Gemengd", "mix"]];
let settings = load();

function load() {
  try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(STORE)) || {}); }
  catch (e) { return defaults(); }
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) {} }

const region = () => REGIONS.find(r => r.id === settings.region) || REGIONS[0];

// A Place is { key, kind: "country"|"feature", name, ... }
function placesOf(r) {
  const customs = (settings.custom[r.id] || []).map(c => ({ type: "sight", ...c, key: "f:" + c.id, kind: "feature", custom: true }));
  return [
    ...r.countries.map(c => ({ key: "c:" + c.code, kind: "country", id: c.code, name: c.name, small: !!c.small, type: "area", at: c.at })),
    ...r.features.map(f => ({ key: "f:" + f.id, kind: "feature", ...f })),
    ...customs,
  ];
}
function isOn(r, p) {
  const off = settings.off[r.id];
  return off ? !off.includes(p.key) : !p.small;           // small countries start switched off
}
function setOn(r, p, on) {
  const cur = settings.off[r.id] || placesOf(r).filter(q => !isOn(r, q)).map(q => q.key);
  settings.off[r.id] = on ? cur.filter(k => k !== p.key) : [...new Set([...cur, p.key])];
  save();
}
const enabled = r => placesOf(r).filter(p => isOn(r, p));
const toetsOn = r => settings.set === "toets" && !!r.toets;
// The Places a Round draws from: the worksheet list, or everything switched on in Settings.
function poolOf(r) {
  if (!toetsOn(r)) return enabled(r);
  const all = placesOf(r);
  return r.toets.places.map(t => {
    const p = all.find(x => x.key === t.ref);
    return { ...p, q: t.q, ...(t.at ? { at: t.at } : {}) };   // the worksheet may place a square differently
  });
}

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text) e.textContent = text;
  return e;
};
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  Object.assign(e, props);
  kids.forEach(k => e.append(k));
  return e;
};
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const show = id => ["home", "settings", "game"].forEach(s => $(s).hidden = s !== id);

const project = (r, lat, lon) => [(lon - r.lon0) * r.k * r.cos, (r.lat0 - lat) * r.k];
const unproject = (r, x, y) => [r.lat0 - y / r.k, x / (r.k * r.cos) + r.lon0];
const kmBetween = (a, b) => {
  const d = Math.PI / 180, dLat = (b[0] - a[0]) * d, dLon = (b[1] - a[1]) * d;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(s));
};
function symbol(type, x, y, s) {
  const color = (TYPES[type] || TYPES.area).color, a = { fill: "#33373e", stroke: color, "stroke-width": s * .45, "stroke-linejoin": "round" };
  switch (type) {
    case "mountain": return el("polygon", { ...a, points: `${x},${y - s} ${x + s * 1.1},${y + s * .8} ${x - s * 1.1},${y + s * .8}` });
    case "river": case "water": return el("polygon", { ...a, points: `${x},${y - s * 1.15} ${x + s * .85},${y} ${x},${y + s * 1.15} ${x - s * .85},${y}` });
    case "island":   return el("polygon", { ...a, points: [0, 1, 2, 3, 4, 5].map(i => `${x + s * 1.15 * Math.cos(i * Math.PI / 3)},${y + s * 1.15 * Math.sin(i * Math.PI / 3)}`).join(" ") });
    case "volcano":  return el("polygon", { ...a, points: `${x - s * 1.1},${y - s * .8} ${x + s * 1.1},${y - s * .8} ${x},${y + s}` });
    case "sight":    return el("circle", { ...a, cx: x, cy: y, r: s });
    default:         return el("rect", { ...a, x: x - s * .9, y: y - s * .9, width: s * 1.8, height: s * 1.8 });
  }
}
const markerSize = r => r.width * 0.015;           // keep in sync with MARKER in tools/build_regions.py
function markerNode(r, p, x, y) {
  const s = markerSize(r), g = el("g", { class: "marker", "data-key": p.key });
  g.append(el("circle", { class: "hit", cx: x, cy: y, r: s * 2.2 }), symbol(p.type, x, y, s));
  return g;
}
function drawMarkers(r, pool) {
  const box = $("markers"); box.innerHTML = "";
  if (!settings.marks) return;
  pool.filter(p => p.at).forEach(p => box.appendChild(markerNode(r, p, ...project(r, ...p.at))));
}
// Regions with a shape (Atacama, Patagonia, ...) answer like countries: touch anywhere inside.
function drawRegions(pool) {
  const box = $("regionsHit"); box.innerHTML = "";
  pool.filter(p => p.d).forEach(p => box.appendChild(el("path", { class: "region-area", "data-key": p.key, d: p.d })));
}
const regionNode = p => document.querySelector(`#regionsHit [data-key="${p.key}"]`);
function ringMarker(r, p, color) {
  const [x, y] = project(r, ...p.at);
  overlay.appendChild(el("circle", { class: "ring", cx: x, cy: y, r: markerSize(r) * 2, fill: "none", stroke: color, "stroke-width": 3 }));
}
// A red cross where she touched, so a wrong answer is easy to see.
function crossMark(r, x, y) {
  const s = markerSize(r) * 1.1, g = el("g", { class: "ring" });
  g.append(el("circle", { cx: x, cy: y, r: s * 1.5, fill: "#e0566b", stroke: "#fff", "stroke-width": 2 }),
    el("path", { d: `M${x - s * .7} ${y - s * .7}L${x + s * .7} ${y + s * .7}M${x + s * .7} ${y - s * .7}L${x - s * .7} ${y + s * .7}`, stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round" }));
  overlay.appendChild(g);
}
function renderLegend(pool) {
  const box = LEGEND; box.innerHTML = "";
  if (!settings.marks) return;
  const seen = new Set();
  Object.entries(TYPES).forEach(([type, t]) => {
    if (seen.has(t.label) || !pool.some(p => p.at && p.type === type)) return;
    seen.add(t.label);
    const s = el("svg", { viewBox: "-12 -12 24 24" }); s.appendChild(symbol(type, 0, 0, 7));
    box.appendChild(h("span", {}, s, t.label));
  });
}
// Show a Place on the map: a country is coloured, a Feature gets a ring round its marker.
function reveal(r, p, good) {
  if (p.kind === "country") document.querySelector(`.country[data-id="${p.id}"]`).classList.add(good ? "right" : "wrong");
  if (p.d && regionNode(p)) regionNode(p).classList.add(good ? "right" : "wrong");
  if (p.at && (p.kind === "feature" || settings.marks)) ringMarker(r, p, good ? "#3cb371" : "#e0566b");
}
const kmToUnits = (r, km) => km / 111.32 * r.k;       // 1° latitude ≈ 111.32 km

// ---------- map ----------
const svg = $("map"), overlay = $("overlay");
const LEGEND = document.getElementById("legend");      // moved between the quiz and learning panels
function drawMap(r) {
  svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
  ["seaRect", "clipRect"].forEach(id => { const n = $(id); n.setAttribute("width", r.width); n.setAttribute("height", r.height); });
  const land = $("land"); land.innerHTML = "";
  // neutral areas first so quiz countries sit on top where they touch
  [...r.shapes].sort((a, b) => a.quiz - b.quiz).forEach(s =>
    land.appendChild(el("path", { class: s.quiz ? "country" : "territory", "data-id": s.code, d: s.d })));
  overlay.innerHTML = ""; $("markers").innerHTML = ""; $("regionsHit").innerHTML = "";
  drawPhysical(r);
  // Borders again on top of the rivers and mountain shading, so they stay clear.
  const borders = $("borders"); borders.innerHTML = "";
  r.shapes.forEach(s => borders.appendChild(el("path", { class: s.quiz ? "border" : "border territory-border", d: s.d })));
}
// Mountain ranges, lakes and rivers drawn without names, under the markers.
function drawPhysical(r) {
  const box = $("physical"); box.innerHTML = "";
  if (!settings.detail) return;
  (r.ranges || []).forEach(d => box.appendChild(el("path", { class: "range", d })));
  (r.lakes || []).forEach(d => box.appendChild(el("path", { class: "lake", d })));
  (r.rivers || []).forEach(d => box.appendChild(el("path", { class: "river", d })));
}
function clearMarks() {
  overlay.innerHTML = "";
  document.querySelectorAll(".country.right,.country.wrong,.country.ask,.region-area.right,.region-area.wrong,.region-area.ask").forEach(n => n.classList.remove("right", "wrong", "ask"));
  $("choices").replaceChildren();
}
function svgPoint(evt) {
  const p = svg.createSVGPoint(); p.x = evt.clientX; p.y = evt.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
const dot = (x, y, fill = "#24303c") => el("circle", { cx: x, cy: y, r: 5, fill, stroke: "#fff", "stroke-width": 1.5 });

// ---------- home ----------
function renderHome() {
  const cards = $("regionCards"); cards.innerHTML = "";
  REGIONS.forEach(r => {
    const b = h("button", { className: "region" + (r.id === settings.region ? " on" : "") },
      h("span", { className: "emoji", textContent: r.emoji }), r.name);
    b.onclick = () => { settings.region = r.id; save(); renderHome(); };
    cards.appendChild(b);
  });
  const r = region();
  $("homeSet").hidden = !r.toets;
  if (r.toets) seg($("homeSet"), [["Alle plekken", "all"], ["📝 " + r.toets.name, "toets"]], v => v === settings.set, v => { settings.set = v; save(); renderHome(); });
  const n = poolOf(r).length;
  $("homeNote").textContent = !n ? "Zet in de instellingen eerst plekken aan."
    : toetsOn(r) ? `${r.toets.name}: ${n} plekken` : `${n} plekken staan aan`;
  $("play").disabled = !n; $("learn").disabled = !n;
}
$("play").onclick = startQuiz;
$("learn").onclick = startLearn;
$("openSettings").onclick = () => { renderSettings(); show("settings"); };
$("closeSettings").onclick = () => { renderHome(); show("home"); };

// ---------- settings ----------
function seg(container, options, isOn, onPick) {
  container.innerHTML = "";
  options.forEach(([label, value]) => {
    const b = h("button", { textContent: label, className: isOn(value) ? "on" : "" });
    b.onclick = () => onPick(value);
    container.appendChild(b);
  });
}
function renderSettings() {
  const r = region();
  seg($("setRegion"), REGIONS.map(x => [`${x.emoji} ${x.name}`, x.id]), v => v === r.id, v => { settings.region = v; save(); renderSettings(); });
  seg($("setLength"), LENGTHS.map(n => [n ? String(n) : "Alles", n]), v => v === settings.length, v => { settings.length = v; save(); renderSettings(); });

  $("lenInput").value = settings.length || "";
  $("lenInput").placeholder = settings.length ? "" : "alles";
  $("setBox").hidden = !r.toets;
  if (r.toets) seg($("setSet"), [["Alle plekken", "all"], [r.toets.name, "toets"]], v => v === settings.set, v => { settings.set = v; save(); renderSettings(); });
  $("pickLists").hidden = toetsOn(r);
  seg($("setStyle"), STYLES, v => v === settings.style, v => { settings.style = v; save(); renderSettings(); });
  seg($("setRetry"), [["Uit", false], ["Aan", true]], v => v === settings.retry, v => { settings.retry = v; save(); renderSettings(); });
  seg($("setLimit"), [["Uit", 0], ["20 sec", 20], ["30 sec", 30], ["60 sec", 60]], v => v === settings.limit, v => { settings.limit = v; save(); renderSettings(); });
  seg($("setAuto"), AUTO, v => v === settings.auto, v => { settings.auto = v; save(); renderSettings(); });
  seg($("setDetail"), [["Met rivieren en bergen", true], ["Alleen landen", false]], v => v === settings.detail, v => { settings.detail = v; save(); renderSettings(); });
  seg($("setMarks"), [["Met tekens op de kaart", true], ["Zonder tekens (tik op de plek)", false]], v => v === settings.marks, v => { settings.marks = v; save(); renderSettings(); });

  const fill = (box, kind, extra) => {
    box.innerHTML = "";
    const ps = placesOf(r).filter(p => kind === "custom" ? p.custom : !p.custom && p.kind === kind);
    ps.forEach(p => {
      const cb = h("input", { type: "checkbox", checked: isOn(r, p) });
      cb.onchange = () => { setOn(r, p, cb.checked); updateCounts(r); };
      const row = h("label", { className: "item" }, cb, h("span", { textContent: p.name }));
      if (extra) row.append(extra(p));
      box.appendChild(row);
    });
    if (!ps.length && kind === "custom") box.appendChild(h("p", { className: "count", textContent: "Nog geen eigen plekken." }));
  };
  fill($("listCountries"), "country");
  fill($("listFeatures"), "feature");
  fill($("listCustom"), "custom", p => {
    const x = h("button", { className: "x danger", textContent: "✕" });
    x.onclick = e => {
      e.preventDefault();
      if (!confirm(`“${p.name}” verwijderen?`)) return;
      settings.custom[r.id] = settings.custom[r.id].filter(c => "f:" + c.id !== p.key); save(); renderSettings();
    };
    return x;
  });
  updateCounts(r);
}
function updateCounts(r) {
  const c = kind => { const ps = placesOf(r).filter(p => !p.custom && p.kind === kind); return `${ps.filter(p => isOn(r, p)).length} van ${ps.length}`; };
  $("countCountries").textContent = c("country");
  $("countFeatures").textContent = c("feature");
}
$("lenInput").onchange = () => {
  const n = Math.round(Number($("lenInput").value));
  settings.length = n >= 1 ? Math.min(n, 200) : 10;
  save(); renderSettings();
};
document.querySelectorAll("[data-bulk]").forEach(b => b.onclick = () => {
  const [kind, mode] = b.dataset.bulk.split(":"), r = region();
  const want = kind === "countries" ? "country" : "feature";
  placesOf(r).filter(p => !p.custom && p.kind === want).forEach(p => setOn(r, p, mode === "on"));
  renderSettings();
});

// ---------- custom place editor ----------
let mode = "quiz", draft = null;
$("addCustom").onclick = () => {
  mode = "editor"; draft = { at: null, r: 250, type: "sight" }; $("pauseBtn").hidden = true;
  drawMap(region());
  $("quizPanel").hidden = true; $("editor").hidden = false; $("learnPanel").hidden = true;
  $("cName").value = ""; renderTypes(); renderSizes(); updateSave();
  $("editorHint").textContent = "Tik op de kaart waar de plek ligt.";
  show("game");
};
function renderTypes() {
  seg($("cType"), Object.entries(TYPES).map(([k, t]) => [t.label, k]), v => v === draft.type, v => { draft.type = v; renderTypes(); drawDraft(); });
}
function renderSizes() {
  seg($("cSize"), SIZES.map(([l, km]) => [`${l} (${km} km)`, km]), v => v === draft.r, v => { draft.r = v; renderSizes(); drawDraft(); });
}
function drawDraft() {
  overlay.innerHTML = "";
  if (!draft.at) return;
  const [x, y] = project(region(), ...draft.at);
  if (!settings.marks) overlay.appendChild(el("circle", { cx: x, cy: y, r: kmToUnits(region(), draft.r), fill: "rgba(74,127,214,.25)", stroke: "#4a7fd6", "stroke-width": 2, "stroke-dasharray": "6 4" }));
  overlay.appendChild(markerNode(region(), { key: "draft", type: draft.type }, x, y));
}
const updateSave = () => $("cSave").disabled = !(draft && draft.at && $("cName").value.trim());
$("cName").oninput = updateSave;
$("cCancel").onclick = () => { renderSettings(); show("settings"); };
$("cSave").onclick = () => {
  const r = region(), name = $("cName").value.trim();
  (settings.custom[r.id] = settings.custom[r.id] || []).push({ id: "c-" + Date.now().toString(36), name, at: draft.at, r: draft.r, type: draft.type });
  save(); renderSettings(); show("settings");
};

// ---------- learning ----------
// No questions: she taps a marker, country or region and reads about it.
const KIND_LABEL = { area: "Gebied", sight: "Stad / plaats", river: "Water", water: "Water", mountain: "Gebergte", island: "Eiland", volcano: "Vulkaan" };
function startLearn() {
  clearAuto(); clearInterval(clockTimer); clockTimer = null;
  const r = region();
  pool = poolOf(r);
  if (!pool.length) return;
  mode = "learn"; current = null; $("pauseBtn").hidden = true;
  drawMap(r); drawRegions(pool); drawMarkers(r, pool); renderLegend(pool);
  $("quizPanel").hidden = true; $("editor").hidden = true; $("learnPanel").hidden = false;
  $("learnTitle").textContent = toetsOn(r) ? `Leren: ${r.toets.name}` : `Leren: ${r.name}`;
  $("learnBody").replaceChildren(h("p", { className: "muted", textContent: "Tik op een teken, een land of een gebied op de kaart." }));
  $("learnBody").append(LEGEND);
  show("game");
}
function learnAbout(r, p) {
  clearMarks();
  reveal(r, p, true);
  const fact = r.toets && (r.toets.places.find(t => t.ref === p.key) || {}).fact;
  const facts = [...(p.info || [])];
  if (p.kind === "country") {
    const nb = (r.countries.find(c => c.code === p.id).nb || []).map(c => countryName(r, c)).filter(Boolean);
    facts.push(nb.length ? `${p.name} grenst aan ${list(nb)}.` : `${p.name} grenst niet aan andere landen.`);
  } else if (p.in && !p.hint) facts.push(`${p.plural ? "Ze liggen" : "Het ligt"} in ${countryName(r, p.in)}.`);
  else if (p.hint) facts.push(p.hint);
  const body = $("learnBody"); body.replaceChildren();
  body.append(h("div", { className: "learn-name", textContent: cap(p.name) }),
    h("span", { className: "learn-kind", textContent: p.kind === "country" ? "Land" : KIND_LABEL[p.type] || "Plek" }));
  if (fact) body.append(h("div", { className: "learn-block sheet" }, h("b", { textContent: "📝 Van je werkblad" }), h("p", { textContent: fact })));
  if (facts.length) {
    const ul = h("ul");
    facts.forEach(f => ul.append(h("li", { textContent: f })));
    body.append(h("div", { className: "learn-block" }, h("b", { textContent: "💡 Wist je dat?" }), ul));
  }
  body.append(LEGEND);
}
function learnTap(evt, pt) {
  const r = region();
  const mk = evt.target.closest && evt.target.closest("#markers [data-key]");
  const under = document.elementsFromPoint(evt.clientX, evt.clientY);
  let p = mk && pool.find(x => x.key === mk.dataset.key);
  if (!p) {
    const reg = under.find(n => n.classList && n.classList.contains("region-area"));
    p = reg && pool.find(x => x.key === reg.dataset.key);
  }
  if (!p) {
    const land = under.find(n => n.dataset && n.dataset.id && n.closest("#land"));
    if (land) p = pool.find(x => x.key === "c:" + land.dataset.id)
      || (land.classList.contains("country") && placesOf(r).find(x => x.key === "c:" + land.dataset.id));
    if (!p) {
      clearMarks();
      $("learnBody").replaceChildren(h("p", { className: "muted", textContent: land ? "Dit land hoort niet bij deze lijst." : "Dat is zee. Tik op een teken, een land of een gebied." }), LEGEND);
      return;
    }
  }
  learnAbout(r, p);
}

// ---------- quiz ----------
// Result card: colour and icon tell right / wrong / skipped / try-again at a glance.
const ICONS = { good: "✓", bad: "✗", skip: "➜", hint: "!" };
function say(kind, title, detail = "") {
  const f = $("feedback");
  f.className = "fb " + kind;
  f.replaceChildren();
  if (kind === "plain") { f.className = ""; f.textContent = title; return; }
  const body = h("div", {}, h("b", { textContent: title }));
  if (detail) body.append(h("span", { textContent: detail }));
  f.append(h("i", { className: "fb-icon", textContent: ICONS[kind] }), body);
}
let queue, idx, score, current, answered, roundSize, pool;
// A description question needs a worksheet text; without one it falls back to "Waar ligt …?".
function styleFor(p) {
  const s = settings.style === "mix" ? shuffle(p.q ? ["name", "clue", "choice", "type"] : ["name", "choice", "type"])[0] : settings.style;
  return s === "clue" && !p.q ? "name" : s;
}
const groupOf = p => p.kind === "country" ? "country" : (TYPES[p.type] || TYPES.area).label;
// Three wrong answers of the same kind (cities with cities, countries with countries) plus the right one.
function choicesFor(p) {
  const others = shuffle(pool.filter(x => x.key !== p.key));
  const same = others.filter(x => groupOf(x) === groupOf(p)), rest = others.filter(x => groupOf(x) !== groupOf(p));
  return shuffle([p, ...[...same, ...rest].slice(0, 3)]);
}

function startQuiz() {
  clearAuto();
  const r = region();
  pool = poolOf(r);
  if (!pool.length) return;
  mode = "quiz";
  roundSize = Math.min(settings.length || pool.length, pool.length);
  queue = shuffle(pool.slice()).slice(0, roundSize).map(p => ({ ...p, style: styleFor(p) }));
  idx = 0; score = 0; totalMs = 0;
  drawMap(r); drawRegions(pool); drawMarkers(r, pool); renderLegend(pool);
  $("quizPanel").hidden = false; $("editor").hidden = true; $("learnPanel").hidden = true;
  $("quizPanel").append(LEGEND);
  $("pauseBtn").hidden = false;                   // the legend may have moved into the learning panel
  $("score").textContent = "";
  show("game");
  ask();
}
function ask() {
  clearMarks();
  current = queue[idx]; answered = false;
  $("progress").textContent = `Vraag ${idx + 1} van ${roundSize}`;
  const r = region();
  if (current.style === "name") {
    $("question").textContent = current.kind === "country" ? `Waar ligt ${current.name}?` : current.plural ? `Waar liggen ${current.name}?` : `Waar is ${current.name}?`;
    say("plain", "Tik op de kaart.");
  } else if (current.style === "clue") {
    $("question").textContent = current.q;
    say("plain", "Tik het goede antwoord aan op de kaart.");
  } else {                                               // choice or type: answer with the name
    if (current.q) $("question").textContent = current.q;
    else {
      $("question").textContent = "Hoe heet de plek die blauw is aangegeven?";
      if (current.kind === "country") document.querySelector(`.country[data-id="${current.id}"]`).classList.add("ask");
      if (current.d && regionNode(current)) regionNode(current).classList.add("ask");
      if (current.at && (current.kind === "feature" || settings.marks)) ringMarker(r, current, "#4a7fd6");
    }
    if (current.style === "type") {
      say("plain", "Typ de naam en druk op Controleer.");
      $("typeBox").hidden = false; $("typeIn").value = ""; $("typeIn").disabled = false; $("typeGo").disabled = false;
      setTimeout(() => $("typeIn").focus(), 50);
    } else say("plain", "Kies het goede antwoord.");
    if (current.style === "choice") choicesFor(current).forEach(p => {
      const b = h("button", { className: "choice ghost", textContent: cap(p.name) });
      b.onclick = () => pick(p, b);
      $("choices").appendChild(b);
    });
  }
  $("next").hidden = true;
  $("skip").hidden = false;
  startClock();
  resetHints(); $("hintBtn").disabled = false;
  $("hintBtn").hidden = current.style === "choice";      // picking from four needs no hint
  if (current.style !== "type") $("typeBox").hidden = true;
  tries = 0;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- hints ----------
// Three steps: what to look for and roughly where, then which country / neighbours, then a circle on the map.
const SHAPE_WORD = { area: "een vierkantje", sight: "een rondje", river: "een ruitje", water: "een ruitje", mountain: "een driehoekje", island: "een zeshoekje", volcano: "een omgekeerd driehoekje" };
const countryName = (r, code) => (r.countries.find(c => c.code === code) || {}).name;
const list = xs => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " en " + xs[xs.length - 1];
function direction(r, at) {
  const c = r.compass;                                  // the mainland, so far-off islands do not skew it
  const ny = (at[0] - c.latMin) / (c.latMax - c.latMin), nx = (at[1] - c.lonMin) / (c.lonMax - c.lonMin);
  const ns = ny > .62 ? "noord" : ny < .38 ? "zuid" : "", ew = nx < .38 ? "west" : nx > .62 ? "oost" : "";
  return ns || ew ? `in het ${ns}${ew}en van de kaart` : "in het midden van de kaart";
}
function hintsFor(r, p) {
  if (p.style === "type") {                             // no map clues when typing: help with the word itself
    const word = p.name.replace(/^(de|het) /, "");
    return [`Het begint met de letter ${word[0].toUpperCase()}.`,
      `Zo ziet het eruit: ${[...word].map((ch, i) => i === 0 ? ch.toUpperCase() : /[\s-]/.test(ch) ? ch === " " ? "  " : "-" : "_").join(" ")}`];
  }
  const at = p.at || (r.countries.find(c => c.code === p.id) || {}).at;
  const kind = p.kind === "country" ? "een land" : settings.marks ? SHAPE_WORD[p.type] || "een teken" : "een plek";
  const first = `Zoek ${kind} ${direction(r, at)}.`;
  let second;
  if (p.hint) second = p.hint;
  else if (p.kind === "country") {
    const nb = (r.countries.find(c => c.code === p.id).nb || []).map(c => countryName(r, c)).filter(Boolean);
    second = nb.length ? `Het grenst aan ${list(nb)}.` : "Het is een eiland, het grenst niet aan andere landen.";
  } else if (p.in) second = `${p.plural ? "Ze liggen" : "Het ligt"} in ${countryName(r, p.in)}.`;
  else if (p.near) second = `${p.plural ? "Ze liggen" : "Het ligt"} ${p.type === "water" || p.type === "river" ? "bij" : "aan de kust van"} ${countryName(r, p.near)}.`;
  return [first, second, "Kijk in de gele cirkel op de kaart."].filter(Boolean);
}
let hintStep = 0;
function resetHints() {
  hintStep = 0;
  $("hintText").hidden = true; $("hintText").textContent = "";
  $("hintBtn").hidden = false; $("hintBtn").textContent = "💡 Hint";
}
$("hintBtn").onclick = () => {
  if (answered || !current) return;
  const r = region(), hs = hintsFor(r, current);
  if (hintStep >= hs.length) return;
  $("hintText").hidden = false;
  $("hintText").append(h("div", { textContent: hs[hintStep] }));
  if (hintStep === hs.length - 1 && current.style !== "type") {                     // last step: a circle around the area, a bit off-centre
    const at = current.at || r.countries.find(c => c.code === current.id).at;
    const [x, y] = project(r, ...at), rad = r.width * .12, ang = Math.random() * 2 * Math.PI, off = rad * .45 * Math.random();
    overlay.appendChild(el("circle", { class: "ring hint-zone", cx: x + off * Math.cos(ang), cy: y + off * Math.sin(ang), r: rad }));
  }
  hintStep++;
  $("hintBtn").textContent = hintStep < hs.length ? `💡 Nog een hint (${hintStep}/${hs.length})` : "💡 Geen hints meer";
  $("hintBtn").disabled = hintStep >= hs.length;
};
// Typed answers: ignore capitals, accents, "de/het", spaces and dashes; allow one small typo.
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/^(de|het|een)\s+/, "").replace(/\bst\.?\s/, "sint ").replace(/[^a-z0-9]/g, "");
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function judgeTyped(text, p) {
  const t = norm(text), names = [p.name, ...(p.alt || [])].map(norm);
  if (names.includes(t)) return "exact";
  const slack = t.length >= 9 ? 2 : t.length >= 4 ? 1 : 0;
  return names.some(n => editDistance(t, n) <= slack) ? "close" : "wrong";
}
function submitTyped() {
  if (paused || answered || !current || current.style !== "type") return;
  const text = $("typeIn").value.trim();
  if (!text) { $("typeIn").focus(); return; }
  const r = region(), verdict = judgeTyped(text, current), hit = verdict !== "wrong";
  if (!hit && tryAgain("", () => {})) { say("hint", "Niet helemaal, probeer het nog een keer!", `Je typte “${text}”.`); $("typeIn").select(); return; }
  $("typeIn").disabled = true; $("typeGo").disabled = true;
  overlay.querySelectorAll(":scope > :not(.hint-zone)").forEach(n => n.remove());
  document.querySelectorAll(".country.ask,.region-area.ask").forEach(n => n.classList.remove("ask"));
  reveal(r, current, true);
  if (verdict === "exact") say("good", "Goed zo!", `${current.plural ? "Het zijn" : "Het is"} ${current.name}.`);
  else if (verdict === "close") say("good", "Goed zo! Bijna goed gespeld", `Je typte “${text}”. Je schrijft het zo: ${cap(current.name)}.`);
  else say("bad", "Niet helemaal", `Je typte “${text}”. Het goede antwoord is ${cap(current.name)}.`);
  finish(hit);
}
$("typeGo").onclick = submitTyped;
$("typeIn").addEventListener("keydown", e => { if (e.key === "Enter") submitTyped(); });

// Second chance (setting): the first wrong answer only shows what was tapped and lets her try again.
let tries = 0;

// ---------- timing ----------
// Only time spent on open questions counts; reading the feedback in between does not.
let totalMs = 0, qStart = 0, clockTimer = null;
const fmt = ms => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function startClock() {
  qStart = Date.now();
  clearInterval(clockTimer);
  $("timebar").hidden = !settings.limit;
  clockTimer = setInterval(tickClock, 200);
  tickClock();
}
function tickClock() {
  const running = Date.now() - qStart;
  $("clock").textContent = `⏱ ${fmt(totalMs + running)}`;
  if (!settings.limit) return;
  const left = settings.limit * 1000 - running;
  $("timebar").firstElementChild.style.width = `${Math.max(0, left / (settings.limit * 10))}%`;
  $("timebar").classList.toggle("low", left < 5000);
  if (left <= 0) timeUp();
}
function stopClock() {
  if (clockTimer) { totalMs += (clockTimer === "paused" ? pausedAt : Date.now()) - qStart; clearInterval(clockTimer); clockTimer = null; }
  $("clock").textContent = `⏱ ${fmt(totalMs)}`;
}
// ---------- pause ----------
// Stops the clock, the time limit and auto-advance, and hides the map so the pause cannot be used to look.
let paused = false, pausedAt = 0, autoLeft = 0;
function pauseQuiz() {
  if (paused || mode !== "quiz" || $("game").hidden || !current) return;
  paused = true; pausedAt = Date.now();
  if (clockTimer) { clearInterval(clockTimer); clockTimer = "paused"; }
  const wasAuto = !!autoTimer; clearAuto(); autoLeft = wasAuto ? settings.auto : 0;
  $("next").textContent = $("next").textContent.replace(/ \(\d+\)$/, "");   // drop the countdown number
  $("pauseInfo").textContent = current ? `Vraag ${idx + 1} van ${roundSize} · ⏱ ${fmt(totalMs + (clockTimer ? pausedAt - qStart : 0))}` : "";
  $("pauseScreen").hidden = false;
}
function resumeQuiz() {
  if (!paused) return;
  paused = false;
  $("pauseScreen").hidden = true;
  if (clockTimer === "paused") {                        // the question was still open: carry on counting from where it stopped
    qStart += Date.now() - pausedAt;
    clockTimer = setInterval(tickClock, 200); tickClock();
  }
  if (autoLeft && answered) startAuto();
}
$("pauseBtn").onclick = pauseQuiz;
$("resumeBtn").onclick = resumeQuiz;
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseQuiz(); });

function timeUp() {
  if (answered || !current) return;
  const r = region();
  overlay.querySelectorAll(":scope > :not(.hint-zone)").forEach(n => n.remove());
  document.querySelectorAll(".country.ask,.region-area.ask").forEach(n => n.classList.remove("ask"));
  [...$("choices").children].forEach(b => { b.disabled = true; if (b.textContent === cap(current.name)) b.classList.add("good"); });
  $("typeIn").disabled = true; $("typeGo").disabled = true;
  if (current.kind === "country" || settings.marks) reveal(r, current, true);
  say("skip", "De tijd is om!", `${current.plural ? "Dit zijn" : "Dit is"} ${current.name}.`);
  finish(false);
}
function tryAgain(name, showTap) {
  if (!settings.retry || tries > 0) return false;
  tries++;
  overlay.querySelectorAll(":scope > :not(.hint-zone)").forEach(n => n.remove());
  document.querySelectorAll(".country.wrong,.region-area.wrong").forEach(n => n.classList.remove("wrong"));
  showTap();
  say("hint", "Niet helemaal, probeer het nog een keer!", name ? `Je tikte op ${name}.` : "");
  return true;
}
function pick(p, button) {
  if (answered || !current) return;
  const r = region(), hit = p.key === current.key;
  if (!hit && tryAgain("", () => { button.classList.add("bad"); button.disabled = true; })) return;
  overlay.innerHTML = "";                                  // drop the blue "which place?" ring, keep the buttons
  document.querySelectorAll(".country.ask,.region-area.ask").forEach(n => n.classList.remove("ask"));
  [...$("choices").children].forEach(b => { b.disabled = true; if (b.textContent === cap(current.name)) b.classList.add("good"); });
  reveal(r, current, true);
  if (hit) say("good", "Goed zo!", `${current.plural ? "Het zijn" : "Het is"} ${current.name}.`);
  else {
    button.classList.add("bad"); reveal(r, p, false);
    say("bad", "Niet helemaal", `Het goede antwoord is ${current.name}. Die staat nu groen op de kaart.`);
  }
  finish(hit);
}
function finish(hit) {
  stopClock();
  answered = true;
  if (hit) score++;
  $("score").textContent = `Score: ${score}`;
  $("next").textContent = idx === roundSize - 1 ? "Klaar!" : "Volgende";
  $("next").dataset.act = idx === roundSize - 1 ? "end" : "next";
  $("next").hidden = false;
  $("skip").hidden = true;
  $("hintBtn").hidden = true;
  startAuto();
}
let autoTimer = null;
function clearAuto() { clearInterval(autoTimer); autoTimer = null; }
function startAuto() {
  clearAuto();
  if (!settings.auto) return;
  const label = $("next").textContent;
  let left = settings.auto;
  const tick = () => { $("next").textContent = `${label} (${left})`; };
  tick();
  autoTimer = setInterval(() => {
    left--;
    if (left <= 0) { clearAuto(); $("next").textContent = label; $("next").click(); }
    else tick();
  }, 1000);
}
// Skipping counts as not answered: show where it was, score nothing.
$("skip").onclick = () => {
  if (answered || !current) return;
  const r = region();
  clearMarks();
  if (current.kind === "country" || settings.marks) reveal(r, current, true);
  else {
    const [ax, ay] = project(r, ...current.at);
    overlay.appendChild(el("circle", { cx: ax, cy: ay, r: kmToUnits(r, current.r), fill: "rgba(60,179,113,.30)", stroke: "#3cb371", "stroke-width": 2, "stroke-dasharray": "6 4" }));
    overlay.appendChild(dot(ax, ay, "#3cb371"));
  }
  say("skip", "Overgeslagen", `Dit is ${current.name}.`);
  finish(false);
};
$("next").onclick = () => {
  clearAuto();
  const act = $("next").dataset.act;
  if (act === "end") return endRound();
  if (act === "again") return startQuiz();
  idx++; ask();
};
function endRound() {
  clearMarks();
  const ratio = score / roundSize, stars = ratio >= .9 ? 3 : ratio >= .6 ? 2 : ratio >= .3 ? 1 : 0;
  $("progress").textContent = "Einde!";
  $("question").textContent = `${score} van ${roundSize} goed`;
  $("feedback").className = "";
  $("feedback").innerHTML = `<div class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>`;
  $("feedback").append(h("div", { className: "endtime", textContent: `⏱ Je deed er ${fmt(totalMs)} over, gemiddeld ${Math.round(totalMs / 1000 / roundSize)} ${Math.round(totalMs / 1000 / roundSize) === 1 ? "seconde" : "seconden"} per vraag.` }));
  $("timebar").hidden = true;
  $("score").textContent = "";
  $("next").textContent = "Opnieuw spelen"; $("next").dataset.act = "again"; $("next").hidden = false;
  $("skip").hidden = true;
  $("hintBtn").hidden = true; $("hintText").hidden = true; $("typeBox").hidden = true;
  $("pauseBtn").hidden = true;
  current = null;
}
$("backbtn").onclick = () => {
  clearAuto(); clearInterval(clockTimer); clockTimer = null; paused = false; $("pauseScreen").hidden = true;
  if (mode === "editor") return $("cCancel").onclick();
  renderHome(); show("home");
};

svg.addEventListener("pointerup", evt => {
  const r = region(), pt = svgPoint(evt);
  if (pt.x < 0 || pt.y < 0 || pt.x > r.width || pt.y > r.height) return;

  if (mode === "editor") {
    draft.at = unproject(r, pt.x, pt.y).map(v => Math.round(v * 100) / 100);
    drawDraft(); updateSave();
    $("editorHint").textContent = "Klopt de plek? Tik opnieuw om te verplaatsen.";
    return;
  }
  if (mode === "learn") return learnTap(evt, pt);
  if (answered || !current || (current.style === "choice" || current.style === "type")) return;

  // Markers sit on top of the land, so look through them to the country underneath.
  const target = document.elementsFromPoint(evt.clientX, evt.clientY).find(n => n.dataset && n.dataset.id && n.closest("#land")) || null;
  if (current.kind === "country") {
    // A marker that is not on the right country is a wrong answer, named after the marker
    // (the Galápagos marker sits on sea, so this must come before the "sea" hint).
    const mk = evt.target.closest && evt.target.closest("#markers [data-key]");
    const onMarker = mk && pool.find(p => p.key === mk.dataset.key);
    if (onMarker && onMarker.kind === "feature" && !(target && target.dataset.id === current.id)) {
      if (tryAgain(onMarker.name, () => { reveal(r, onMarker, false); crossMark(r, ...project(r, ...onMarker.at)); })) return;
      reveal(r, current, true); reveal(r, onMarker, false); crossMark(r, ...project(r, ...onMarker.at));
      say("bad", "Niet helemaal", `Je tikte op ${onMarker.name}. Het groene land is ${current.name}.`);
      return finish(false);
    }
    if (!target) { say("hint", "Dat is zee", "Probeer opnieuw!"); return; }
    if (target.classList.contains("territory")) { say("hint", "Dat is een ander gebied", "Probeer opnieuw!"); return; }
    const hit = target.dataset.id === current.id;
    if (!hit && tryAgain(countryName(r, target.dataset.id), () => { target.classList.add("wrong"); crossMark(r, pt.x, pt.y); })) return;
    reveal(r, current, true);
    if (hit) say("good", "Goed zo!", `${current.plural ? "Dat zijn" : "Dat is"} ${current.name}.`);
    else {
      target.classList.add("wrong"); crossMark(r, pt.x, pt.y);
      const sq = pool.find(p => p.key === "c:" + target.dataset.id);
      if (sq && sq.at && settings.marks) ringMarker(r, sq, "#e0566b");
      const named = r.countries.find(c => c.code === target.dataset.id);
      say("bad", "Niet helemaal", `${named ? "Je tikte op " + named.name + ". " : ""}Het groene land is ${current.name}.`);
    }
    finish(hit);
  } else if (settings.marks) {
    const m = evt.target.closest && evt.target.closest("#markers [data-key]");
    const inRegion = !!(current.d && document.elementsFromPoint(evt.clientX, evt.clientY).includes(regionNode(current)));
    const tapped = m ? m.dataset.key : inRegion ? current.key : null;
    // a region question counts any touch; other questions need a marker
    if (!tapped && !current.d) { say("hint", "Tik op een teken", "Zoek het juiste teken op de kaart."); return; }
    const hit = tapped === current.key;
    const tappedPlace = tapped && pool.find(p => p.key === tapped);
    if (!hit && tryAgain(tappedPlace && tappedPlace.name, () => {
      if (tappedPlace) reveal(r, tappedPlace, false);
      crossMark(r, ...(tappedPlace ? project(r, ...tappedPlace.at) : [pt.x, pt.y]));
    })) return;
    reveal(r, current, true);
    if (hit) say("good", "Goed zo!", `${current.plural ? "Dat zijn" : "Dat is"} ${current.name}.`);
    else {
      const other = tapped && pool.find(p => p.key === tapped);
      if (other) reveal(r, other, false);
      crossMark(r, ...(other ? project(r, ...other.at) : [pt.x, pt.y]));
      say("bad", "Niet helemaal", `${other ? "Je tikte op " + other.name + ". " : ""}${current.d ? "Het groene gebied" : "Het groene teken"} is ${current.name}.`);
    }
    finish(hit);
  } else {
    const d = kmBetween(unproject(r, pt.x, pt.y), current.at);
    const hit = d <= current.r || !!(current.d && document.elementsFromPoint(evt.clientX, evt.clientY).includes(regionNode(current)));
    if (!hit && tryAgain("", () => crossMark(r, pt.x, pt.y))) return;
    if (current.d) reveal(r, current, hit);
    const [ax, ay] = project(r, ...current.at);
    overlay.appendChild(el("circle", { cx: ax, cy: ay, r: kmToUnits(r, current.r), fill: hit ? "rgba(60,179,113,.30)" : "rgba(224,86,107,.22)", stroke: hit ? "#3cb371" : "#e0566b", "stroke-width": 2, "stroke-dasharray": "6 4" }));
    overlay.appendChild(dot(ax, ay, "#3cb371"));
    if (!hit) overlay.appendChild(el("line", { x1: pt.x, y1: pt.y, x2: ax, y2: ay, stroke: "#24303c", "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
    if (hit) overlay.appendChild(dot(pt.x, pt.y, "#3cb371")); else crossMark(r, pt.x, pt.y);
    const away = Math.round(d / 10) * 10;
    if (hit) say("good", "Goed zo!", `${current.plural ? "Dat zijn" : "Dat is"} ${current.name}.`);
    else say("bad", d < current.r * 2 ? "Bijna!" : "Helaas", `Je zat ongeveer ${away} km ernaast. De groene stip is de goede plek.`);
    finish(hit);
  }
});

// ---------- boot ----------
renderHome();
show("home");
// Updates: a new version downloads in the background; the home screen then offers to load it.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const offer = w => {
    $("updateBar").hidden = false;
    $("updateBtn").onclick = () => { $("updateBtn").disabled = true; w.postMessage("update"); };
  };
  navigator.serviceWorker.register("sw.js").then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) offer(w);
      });
    });
    // look again whenever the app comes back to the front
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !$("updateBtn").disabled) return;  // only reload when she asked for it
    reloading = true; location.reload();
  });
}
