import {
  RARITIES, INPUT_COUNT, computeTradeUp, evaluate, wearOf, marketName, distanceToWearEdge,
  pickBuy, pickSell,
} from "./tradeup.js";
import { buildBookmarklet, sanitizePirateswap, isPirateswapOrigin } from "./pirateswap.js";

const PS_KEY = "tu-pirateswap";
const SITE_SHORT = { tradeit: "TI", pirateswap: "PS" };

const $ = (id) => document.getElementById(id);
const usd = (v) => (v == null ? "–" : `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`);
const signedUsd = (v) => (v == null ? "–" : `${v >= 0 ? "+" : ""}${usd(v)}`);
const pct = (v) => `${(v * 100).toFixed(1)}%`;
// Samma färger som i spelet, i samma ordning som RARITIES.
const RARITY_COLORS = ["#b0c3d9", "#5e98d9", "#4b69ff", "#8847ff", "#d32ce6", "#eb4b4b"];
const shortCollection = (c) => c.replace(/^The | Collection$/g, "");

let skins = [];
let byName = new Map();
let prices = {};
// Pirateswap-priser från bokmärket: {updated, prices}. Sparas i webbläsaren.
let ps = loadPirateswap();
// rows[i] = {name, float, price (manuellt pris eller null)}
let rows = Array.from({ length: INPUT_COUNT }, () => ({ name: "", float: "", price: null }));

function loadPirateswap() {
  try {
    return JSON.parse(localStorage.getItem(PS_KEY)) || { updated: null, prices: {} };
  } catch {
    return { updated: null, prices: {} };
  }
}

function sitePrices(name) {
  const t = prices[name];
  const p = ps.prices[name];
  return {
    tradeit: typeof t === "number" ? t : null,
    pirateswap: typeof p === "number" ? p : null,
  };
}

function stattrak() { return $("st").checked; }
function divisors() {
  return {
    tradeit: Number($("div").value) || 1.15,
    pirateswap: Number($("divps").value) || 1.12,
  };
}

function autoBuy(row) {
  const skin = byName.get(row.name);
  const f = Number(row.float);
  if (!skin || row.float === "" || Number.isNaN(f)) return null;
  return pickBuy(sitePrices(marketName(skin, wearOf(f), stattrak())), $("buy").value);
}

function autoPrice(row) {
  return autoBuy(row)?.price ?? null;
}

function updateDatalist() {
  const first = rows.map((r) => byName.get(r.name)).find(Boolean);
  const col = $("fcol").value;
  const rar = $("frar").value;
  const list = skins
    .filter((s) => (!first || s.rarity === first.rarity) && s.rarity < RARITIES.length - 1)
    .filter((s) => !stattrak() || s.stattrak)
    .filter((s) => !col || s.collection === col)
    .filter((s) => rar === "" || s.rarity === Number(rar))
    .sort((a, b) => a.rarity - b.rarity || a.name.localeCompare(b.name));
  const dl = $("skinlist");
  dl.replaceChildren(...list.map((s) => {
    const o = document.createElement("option");
    o.value = s.name;
    o.label = `${RARITIES[s.rarity]} · ${shortCollection(s.collection)}`;
    return o;
  }));
}

function buildFilters() {
  const cols = [...new Set(skins.map((s) => s.collection))].sort();
  $("fcol").replaceChildren(
    new Option("Alla collections", ""),
    ...cols.map((c) => new Option(shortCollection(c), c)),
  );
  $("frar").replaceChildren(
    new Option("Alla rarities", ""),
    ...RARITIES.slice(0, -1).map((r, i) => {
      const o = new Option(r, String(i));
      o.style.color = RARITY_COLORS[i];
      return o;
    }),
  );
  const paint = () => {
    const v = $("frar").value;
    $("frar").style.color = v === "" ? "" : RARITY_COLORS[Number(v)];
  };
  $("fcol").addEventListener("change", updateDatalist);
  $("frar").addEventListener("change", () => { paint(); updateDatalist(); });
}

function buildInputs() {
  const wrap = $("inputs");
  wrap.replaceChildren();
  rows.forEach((row, i) => {
    const el = document.createElement("div");
    el.className = "in-row";

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = i + 1;

    const name = document.createElement("input");
    name.className = "skin";
    name.setAttribute("list", "skinlist");
    name.placeholder = "Sök skin…";
    name.value = row.name;

    const fl = document.createElement("input");
    fl.className = "num fl";
    fl.type = "number";
    fl.step = "0.0001";
    fl.min = "0";
    fl.max = "1";
    fl.placeholder = "float";
    fl.value = row.float;

    const meta = document.createElement("span");
    meta.className = "meta";

    const price = document.createElement("input");
    price.className = "num price";
    price.type = "number";
    price.step = "0.01";
    price.min = "0";

    const copy = document.createElement("button");
    copy.className = "copy";
    copy.textContent = "↓";
    copy.title = "Kopiera raden till nästa tomma rad nedanför";

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.title = "Töm raden";

    const refresh = () => {
      const skin = byName.get(row.name);
      const f = Number(row.float);
      const parts = [];
      if (skin && row.float !== "" && !Number.isNaN(f)) parts.push(wearOf(f));
      if (skin) parts.push(shortCollection(skin.collection));
      if (skin) parts.push(`${skin.min}–${skin.max}`);
      meta.textContent = parts.join(" · ");
      meta.title = skin ? `${RARITIES[skin.rarity]} · ${meta.textContent}` : "";
      const color = skin ? RARITY_COLORS[skin.rarity] : "";
      name.style.borderLeftColor = color;
      name.style.color = color;
      const auto = autoBuy(row);
      price.classList.toggle("manual", row.price != null);
      if (row.price == null) {
        price.value = auto ? auto.price.toFixed(2) : "";
        price.placeholder = skin && row.float !== "" ? "saknas" : "";
        price.title = auto ? `Pris från ${auto.source}` : "";
        if (auto) meta.textContent += ` · ${SITE_SHORT[auto.source]}`;
      } else {
        price.title = "Eget pris";
      }
    };
    el.refresh = refresh;

    name.addEventListener("change", () => {
      row.name = byName.has(name.value) ? name.value : "";
      if (!row.name) name.value = "";
      updateDatalist();
      refreshAll();
    });
    fl.addEventListener("input", () => { row.float = fl.value; refresh(); recalc(); });
    price.addEventListener("input", () => {
      row.price = price.value === "" ? null : Number(price.value);
      refresh();
      recalc();
    });
    copy.addEventListener("click", () => {
      if (!row.name || i === rows.length - 1) return;
      // Första tomma raden nedanför, annars raden direkt under. Upprepade
      // tryck på rad 3 fyller alltså rad 4, 5, 6 ...
      let target = rows.findIndex((r, j) => j > i && !r.name);
      if (target === -1) target = i + 1;
      rows[target] = { ...row };
      buildInputs();
      recalc();
    });
    del.addEventListener("click", () => {
      Object.assign(row, { name: "", float: "", price: null });
      buildInputs();
      updateDatalist();
      recalc();
    });

    if (row.price != null) price.value = row.price;
    el.append(idx, name, fl, meta, price, copy, del);
    wrap.append(el);
    refresh();
  });
}

function refreshAll() {
  for (const el of $("inputs").children) el.refresh();
  recalc();
}

function card(k, v, cls = "") {
  const d = document.createElement("div");
  d.className = "card";
  const a = document.createElement("div");
  a.className = "k";
  a.textContent = k;
  const b = document.createElement("div");
  b.className = `v ${cls}`;
  b.textContent = v;
  d.append(a, b);
  return d;
}

function cell(tr, text, cls = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (cls) td.className = cls;
  tr.append(td);
  return td;
}

function recalc() {
  saveHash();
  const body = $("resultBody");
  body.replaceChildren();
  const inputs = rows.map((r) => ({ skin: byName.get(r.name), float: r.float === "" ? NaN : Number(r.float) }));
  if (!inputs.some((i) => i.skin)) {
    body.innerHTML = '<p class="small">Välj 10 inputs.</p>';
    return;
  }
  const result = computeTradeUp(inputs, skins, { stattrak: stattrak() });
  if (result.errors.length) {
    const ul = document.createElement("ul");
    ul.className = "errors";
    for (const e of result.errors) {
      const li = document.createElement("li");
      li.textContent = e;
      ul.append(li);
    }
    body.append(ul);
    return;
  }

  const costs = rows.map((r) => (r.price != null ? r.price : autoPrice(r)));
  const div = divisors();
  const sell = $("sell").value;
  const e = evaluate(result, costs, (n) => pickSell(sitePrices(n), div, sell), { stattrak: stattrak() });

  const cards = document.createElement("div");
  cards.className = "cards";
  cards.append(
    card("Kostnad (10 inputs)", usd(e.cost)),
    card("Förväntat värde (EV)", usd(e.ev)),
    card("Förväntad vinst", signedUsd(e.profit), e.profit >= 0 ? "good" : "bad"),
    card("Avkastning", e.roi == null ? "–" : `${e.roi >= 0 ? "+" : "−"}${pct(Math.abs(e.roi))}`,
      e.roi >= 0 ? "good" : "bad"),
    card("Chans till vinst", pct(e.chanceProfit)),
    card("Snitt normaliserad float", result.avgNorm.toFixed(5)),
  );
  body.append(cards);

  const notes = [];
  if (e.missingInputPrices) notes.push(`${e.missingInputPrices} input(s) saknar pris – kostnaden är för låg.`);
  if (e.pricedShare < 0.9999) {
    notes.push(`Outcomes motsvarande ${pct(1 - e.pricedShare)} sannolikhet saknar tradeit-pris – EV är för lågt räknat.`);
  }
  for (const n of notes) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = `⚠ ${n}`;
    body.append(p);
  }

  const wrap = document.createElement("div");
  wrap.className = "tablewrap";
  wrap.style.marginTop = "14px";
  const t = document.createElement("table");
  t.innerHTML = "<thead><tr><th>Outcome</th><th>Chans</th><th>Float</th><th>Wear</th>"
    + "<th>Tradeit</th><th>Pirateswap</th><th>Inbytesvärde</th><th>Vinst</th></tr></thead>";
  const tb = document.createElement("tbody");
  for (const r of e.rows) {
    const tr = document.createElement("tr");
    const first = cell(tr, r.name);
    first.style.color = RARITY_COLORS[r.skin.rarity];
    first.style.borderLeft = `3px solid ${RARITY_COLORS[r.skin.rarity]}`;
    const sub = document.createElement("div");
    sub.className = "small";
    sub.textContent = `${RARITIES[r.skin.rarity]} · ${shortCollection(r.skin.collection)}`;
    first.append(sub);
    const c = cell(tr, pct(r.prob));
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = `${Math.max(2, r.prob * 100)}%`;
    c.append(bar);
    const near = distanceToWearEdge(r.float) < 0.001;
    cell(tr, `${r.float.toFixed(5)}${near ? " ⚠" : ""}`, near ? "warn" : "").title = near
      ? "Mycket nära en wear-gräns – avrundning kan ge en annan wear." : "";
    cell(tr, r.wear);
    const sp = sitePrices(r.name);
    cell(tr, usd(sp.tradeit), r.source === "tradeit" ? "picked" : "");
    cell(tr, usd(sp.pirateswap), r.source === "pirateswap" ? "picked" : "");
    cell(tr, r.value == null ? "–" : `${usd(r.value)} ${SITE_SHORT[r.source]}`);
    cell(tr, signedUsd(r.profit),
      r.profit == null ? "" : r.profit >= 0 ? "good" : "bad");
    tb.append(tr);
  }
  t.append(tb);
  wrap.append(t);
  body.append(wrap);
}

// Spara uppställningen i adressen så att den går att bokmärka och dela.
function saveHash() {
  const state = {
    st: stattrak() ? 1 : 0,
    d: divisors().tradeit,
    dp: divisors().pirateswap,
    b: $("buy").value,
    s: $("sell").value,
    r: rows.map((r) => [r.name, r.float, r.price]),
  };
  const s = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  history.replaceState(null, "", `#${s}`);
}

function loadHash() {
  if (!location.hash || location.hash === "#ps-import") return;
  try {
    const state = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
    $("st").checked = !!state.st;
    if (state.d) $("div").value = state.d;
    if (state.dp) $("divps").value = state.dp;
    if (state.b) $("buy").value = state.b;
    if (state.s) $("sell").value = state.s;
    (state.r || []).slice(0, INPUT_COUNT).forEach(([name, float, price], i) => {
      rows[i] = { name: byName.has(name) ? name : "", float: float ?? "", price: price ?? null };
    });
  } catch {
    // Trasig länk – börja tomt.
  }
}

function savePirateswap(next) {
  ps = next;
  try {
    localStorage.setItem(PS_KEY, JSON.stringify(ps));
  } catch {
    // Privat läge e.d. – priserna gäller då bara tills sidan laddas om.
  }
  showPirateswapStatus();
  refreshAll();
}

// Nya priser ersätter gamla för samma skin; övriga ligger kvar.
function mergePirateswap(clean) {
  savePirateswap({ updated: clean.updated, prices: { ...ps.prices, ...clean.prices } });
}

function showPirateswapStatus() {
  const n = Object.keys(ps.prices).length;
  const el = $("psStatus");
  if (!n) {
    el.textContent = "Inga Pirateswap-priser inlästa än.";
    el.className = "small";
    return;
  }
  const when = new Date(ps.updated);
  const hours = (Date.now() - when.getTime()) / 36e5;
  el.textContent = `${n} Pirateswap-priser, hämtade ${when.toLocaleString("sv-SE")}`
    + (hours > 24 ? ` – över ${Math.floor(hours / 24)} dygn gamla, hämta nya.` : "");
  el.className = hours > 24 ? "warn" : "small";
}

function setupPirateswap() {
  const calcUrl = `${location.origin}${location.pathname}`;
  $("psLink").href = buildBookmarklet(skins, calcUrl);
  $("psLink").addEventListener("click", (e) => {
    e.preventDefault();
    alert("Dra länken till bokmärkesfältet i stället för att klicka. "
      + "Öppna sedan pirateswap.com och klicka på bokmärket där.");
  });
  showPirateswapStatus();

  // Priser från bokmärket på pirateswap.com.
  window.addEventListener("message", (e) => {
    if (!isPirateswapOrigin(e.origin)) return;
    const clean = sanitizePirateswap(e.data);
    if (!clean) return;
    mergePirateswap(clean);
    e.source?.postMessage({ type: "tradeup-imported", count: Object.keys(ps.prices).length }, e.origin);
  });
  // Öppnades sidan av bokmärket? Säg till att vi är redo att ta emot.
  if (window.opener) {
    try { window.opener.postMessage({ type: "tradeup-ready" }, "*"); } catch { /* stängt fönster */ }
  }

  $("psImport").addEventListener("click", () => {
    let data;
    try {
      data = JSON.parse($("psPaste").value);
    } catch {
      alert("Texten är inte giltig – kopiera igen från bokmärkets ruta.");
      return;
    }
    const clean = sanitizePirateswap(data);
    if (!clean) {
      alert("Hittade inga Pirateswap-priser i texten.");
      return;
    }
    $("psPaste").value = "";
    mergePirateswap(clean);
  });
  $("psClear").addEventListener("click", () => savePirateswap({ updated: null, prices: {} }));
}

async function init() {
  try {
    const res = await fetch("data.json", { cache: "no-cache" });
    const data = await res.json();
    skins = data.skins;
    byName = new Map(skins.map((s) => [s.name, s]));
    prices = data.prices || {};
    const when = new Date(data.updated);
    $("status").textContent = Number.isNaN(when.getTime())
      ? `${Object.keys(prices).length} priser`
      : `Priser från tradeit.gg, uppdaterade ${when.toLocaleString("sv-SE")} · ${Object.keys(prices).length} priser`;
  } catch (err) {
    $("status").textContent = `Kunde inte ladda data.json (${err}).`;
    return;
  }
  buildFilters();
  loadHash();
  buildInputs();
  updateDatalist();
  recalc();

  $("st").addEventListener("change", () => { updateDatalist(); refreshAll(); });
  $("div").addEventListener("input", recalc);
  $("divps").addEventListener("input", recalc);
  $("buy").addEventListener("change", refreshAll);
  $("sell").addEventListener("change", recalc);
  setupPirateswap();
  $("copy1").addEventListener("click", () => {
    rows = rows.map(() => ({ ...rows[0] }));
    buildInputs();
    recalc();
  });
  $("clear").addEventListener("click", () => {
    rows = rows.map(() => ({ name: "", float: "", price: null }));
    buildInputs();
    updateDatalist();
    recalc();
  });
}

init();
