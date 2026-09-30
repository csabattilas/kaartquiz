"use strict";

// ---------- data & settings ----------
const REGIONS = window.REGIONS;
const STORE = "kaartquiz-v1";
const LENGTHS = [5, 10, 20, 0];            // 0 = alle geselecteerde plekken
const SIZES = [["Klein", 100], ["Middel", 250], ["Groot", 500]];
const NS = "http://www.w3.org/2000/svg";

const defaults = () => ({ region: REGIONS[0].id, length: 10, marks: true, off: {}, custom: {} });
// Symbol per kind of Feature; the map shows only the symbol, never the name.
const TYPES = {
  mountain: { label: "berg / gebergte", color: "#8b5a2b" },
  river:    { label: "rivier", color: "#2f7fd0" },
  water:    { label: "meer / zee / waterval", color: "#2f7fd0" },
  sight:    { label: "bezienswaardigheid", color: "#c0392b" },
  area:     { label: "gebied / woestijn", color: "#2e8b57" },
  island:   { label: "eiland", color: "#159a9c" },
  volcano:  { label: "vulkaan", color: "#e0561e" },
};
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
    ...r.countries.map(c => ({ key: "c:" + c.code, kind: "country", id: c.code, name: c.name, small: !!c.small })),
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
  const color = (TYPES[type] || TYPES.area).color, a = { fill: color, stroke: "#fff", "stroke-width": 2, "stroke-linejoin": "round" };
  switch (type) {
    case "mountain": return el("polygon", { ...a, points: `${x},${y - s} ${x + s * 1.1},${y + s * .8} ${x - s * 1.1},${y + s * .8}` });
    case "river":    return el("polygon", { ...a, points: `${x},${y - s * 1.15} ${x + s * .85},${y} ${x},${y + s * 1.15} ${x - s * .85},${y}` });
    case "water":    return el("circle", { ...a, cx: x, cy: y, r: s });
    case "island":   return el("polygon", { ...a, points: [0, 1, 2, 3, 4, 5].map(i => `${x + s * 1.15 * Math.cos(i * Math.PI / 3)},${y + s * 1.15 * Math.sin(i * Math.PI / 3)}`).join(" ") });
    case "volcano":  return el("polygon", { ...a, points: `${x - s * 1.1},${y - s * .8} ${x + s * 1.1},${y - s * .8} ${x},${y + s}` });
    case "sight":    return el("rect", { ...a, x: x - s * .9, y: y - s * .9, width: s * 1.8, height: s * 1.8 });
    default:         return el("rect", { ...a, x: x - s * 1.3, y: y - s * .75, width: s * 2.6, height: s * 1.5 });
  }
}
const markerSize = r => r.width * 0.011;
function markerNode(r, p, x, y) {
  const s = markerSize(r), g = el("g", { class: "marker", "data-fid": p.id });
  g.append(el("circle", { class: "hit", cx: x, cy: y, r: s * 2.2 }), symbol(p.type, x, y, s));
  return g;
}
function drawMarkers(r) {
  const box = $("markers"); box.innerHTML = "";
  if (!settings.marks) return;
  enabled(r).filter(p => p.kind === "feature").forEach(p => box.appendChild(markerNode(r, p, ...project(r, ...p.at))));
}
function ringMarker(r, p, color) {
  const [x, y] = project(r, ...p.at);
  overlay.appendChild(el("circle", { cx: x, cy: y, r: markerSize(r) * 2, fill: "none", stroke: color, "stroke-width": 3 }));
}
function renderLegend() {
  const box = $("legend"); box.innerHTML = "";
  if (!settings.marks) return;
  Object.entries(TYPES).forEach(([type, t]) => {
    const s = el("svg", { viewBox: "-12 -12 24 24" }); s.appendChild(symbol(type, 0, 0, 7));
    box.appendChild(h("span", {}, s, t.label));
  });
}
const kmToUnits = (r, km) => km / 111.32 * r.k;       // 1° latitude ≈ 111.32 km

// ---------- map ----------
const svg = $("map"), overlay = $("overlay");
function drawMap(r) {
  svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
  ["seaRect", "clipRect"].forEach(id => { const n = $(id); n.setAttribute("width", r.width); n.setAttribute("height", r.height); });
  const land = $("land"); land.innerHTML = "";
  // neutral areas first so quiz countries sit on top where they touch
  [...r.shapes].sort((a, b) => a.quiz - b.quiz).forEach(s =>
    land.appendChild(el("path", { class: s.quiz ? "country" : "territory", "data-id": s.code, d: s.d })));
  overlay.innerHTML = ""; $("markers").innerHTML = "";
}
function clearMarks() {
  overlay.innerHTML = "";
  document.querySelectorAll(".country.right,.country.wrong").forEach(n => n.classList.remove("right", "wrong"));
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
  const n = enabled(region()).length;
  $("homeNote").textContent = n ? `${n} plekken staan aan` : "Zet in de instellingen eerst plekken aan.";
  $("play").disabled = !n;
}
$("play").onclick = startQuiz;
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
  mode = "editor"; draft = { at: null, r: 250, type: "sight" };
  drawMap(region());
  $("quizPanel").hidden = true; $("editor").hidden = false;
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
  overlay.appendChild(markerNode(region(), { id: "draft", type: draft.type }, x, y));
}
const updateSave = () => $("cSave").disabled = !(draft && draft.at && $("cName").value.trim());
$("cName").oninput = updateSave;
$("cCancel").onclick = () => { renderSettings(); show("settings"); };
$("cSave").onclick = () => {
  const r = region(), name = $("cName").value.trim();
  (settings.custom[r.id] = settings.custom[r.id] || []).push({ id: "c-" + Date.now().toString(36), name, at: draft.at, r: draft.r, type: draft.type });
  save(); renderSettings(); show("settings");
};

// ---------- quiz ----------
let queue, idx, score, current, answered, roundSize;

function startQuiz() {
  const r = region(), pool = enabled(r);
  if (!pool.length) return;
  mode = "quiz";
  roundSize = Math.min(settings.length || pool.length, pool.length);
  queue = shuffle(pool.slice()).slice(0, roundSize);
  idx = 0; score = 0;
  drawMap(r); drawMarkers(r); renderLegend();
  $("quizPanel").hidden = false; $("editor").hidden = true;
  $("score").textContent = "";
  show("game");
  ask();
}
function ask() {
  clearMarks();
  current = queue[idx]; answered = false;
  $("progress").textContent = `Vraag ${idx + 1} van ${roundSize}`;
  $("question").textContent = current.kind === "country" ? `Waar ligt ${current.name}?` : `Waar is ${current.name}?`;
  $("feedback").textContent = "Tik op de kaart.";
  $("next").hidden = true;
  $("skip").hidden = false;
}
function finish(hit) {
  answered = true;
  if (hit) score++;
  $("score").textContent = `Score: ${score}`;
  $("next").textContent = idx === roundSize - 1 ? "Klaar!" : "Volgende";
  $("next").dataset.act = idx === roundSize - 1 ? "end" : "next";
  $("next").hidden = false;
  $("skip").hidden = true;
}
// Skipping counts as not answered: show where it was, score nothing.
$("skip").onclick = () => {
  if (answered || !current) return;
  const r = region();
  if (current.kind === "country") document.querySelector(`.country[data-id="${current.id}"]`).classList.add("right");
  else if (settings.marks) ringMarker(r, current, "#3cb371");
  else {
    const [ax, ay] = project(r, ...current.at);
    overlay.appendChild(el("circle", { cx: ax, cy: ay, r: kmToUnits(r, current.r), fill: "rgba(60,179,113,.30)", stroke: "#3cb371", "stroke-width": 2, "stroke-dasharray": "6 4" }));
    overlay.appendChild(dot(ax, ay, "#3cb371"));
  }
  $("feedback").textContent = `Overgeslagen. Dit is ${current.name}.`;
  finish(false);
};
$("next").onclick = () => {
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
  $("feedback").innerHTML = `<div class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>`;
  $("score").textContent = "";
  $("next").textContent = "Opnieuw spelen"; $("next").dataset.act = "again"; $("next").hidden = false;
  $("skip").hidden = true;
  current = null;
}
$("backbtn").onclick = () => {
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
  if (answered || !current) return;

  const target = evt.target.closest && evt.target.closest("[data-id]");
  if (current.kind === "country") {
    if (!target) { $("feedback").textContent = "Dat is zee. Probeer opnieuw!"; return; }
    if (target.classList.contains("territory")) { $("feedback").textContent = "Dat is een ander gebied. Probeer opnieuw!"; return; }
    const hit = target.dataset.id === current.id;
    document.querySelector(`.country[data-id="${current.id}"]`).classList.add("right");
    if (hit) $("feedback").textContent = "Goed zo! 🎉";
    else { target.classList.add("wrong"); overlay.appendChild(dot(pt.x, pt.y)); $("feedback").textContent = `Niet helemaal. Dit is ${current.name}.`; }
    finish(hit);
  } else if (settings.marks) {
    const m = evt.target.closest && evt.target.closest("[data-fid]");
    const tapped = m && m.dataset.fid;
    if (!tapped) { $("feedback").textContent = "Tik op een teken op de kaart."; return; }
    const hit = tapped === current.id;
    ringMarker(r, current, "#3cb371");
    if (hit) $("feedback").textContent = "Goed zo! 🎉";
    else {
      const other = enabled(r).find(p => p.kind === "feature" && p.id === tapped);
      if (other) ringMarker(r, other, "#e0566b");
      $("feedback").textContent = `Niet helemaal${other ? ": je tikte op " + other.name : ""}. Het groene teken is ${current.name}.`;
    }
    finish(hit);
  } else {
    const d = kmBetween(unproject(r, pt.x, pt.y), current.at), hit = d <= current.r;
    const [ax, ay] = project(r, ...current.at);
    overlay.appendChild(el("circle", { cx: ax, cy: ay, r: kmToUnits(r, current.r), fill: hit ? "rgba(60,179,113,.30)" : "rgba(224,86,107,.22)", stroke: hit ? "#3cb371" : "#e0566b", "stroke-width": 2, "stroke-dasharray": "6 4" }));
    overlay.appendChild(dot(ax, ay, "#3cb371"));
    if (!hit) overlay.appendChild(el("line", { x1: pt.x, y1: pt.y, x2: ax, y2: ay, stroke: "#24303c", "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
    overlay.appendChild(dot(pt.x, pt.y));
    const away = Math.round(d / 10) * 10;
    $("feedback").textContent = hit ? "Goed zo! 🎉" : `${d < current.r * 2 ? "Bijna!" : "Helaas."} Je zat ongeveer ${away} km ernaast. De groene stip is de goede plek.`;
    finish(hit);
  }
});

// ---------- boot ----------
renderHome();
show("home");
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
