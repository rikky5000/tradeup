// Steam-inventory: ett bokmärke som körs på steamcommunity.com och läser ditt
// publika CS2-inventory (samma adress som Steams egen inventory-sida använder),
// plus funktioner som sammanställer det för trade-ups. Datan skickas till
// kalkylatorn via postMessage och sparas bara i webbläsaren.
//
// steamMain körs på steamcommunity.com och får därför inte använda något
// utanför sig själv – allt den behöver skickas in som P.

import { RARITIES, INPUT_COUNT } from "./tradeup.js";

/* eslint-disable no-await-in-loop */
export function steamMain(P) {
  if (location.hostname !== "steamcommunity.com") {
    alert("Öppna din inventory-sida på steamcommunity.com först och klicka sedan på bokmärket igen.");
    return;
  }
  if (document.getElementById("tu-steam")) return;
  const calcOrigin = new URL(P.calc).origin;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = (tag, css, text) => {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };
  const btnCss = "font:inherit;color:#111;background:#f5a623;border:0;border-radius:6px;"
    + "padding:6px 10px;cursor:pointer;margin:0 6px 6px 0";

  const box = el("div", "position:fixed;z-index:2147483647;top:16px;right:16px;width:320px;"
    + "background:#1a1f26;color:#e6e9ee;border:1px solid #f5a623;border-radius:10px;padding:14px;"
    + "font:13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);text-align:left");
  box.id = "tu-steam";
  box.append(el("div", "font-weight:600;font-size:14px;margin-bottom:6px", `Hämta inventory · v${P.v}`));
  const status = el("div", "white-space:pre-line;margin:6px 0", "Letar efter Steam-ID…");
  const actions = el("div", "margin-top:8px");
  const close = el("button", `${btnCss};background:#2e3642;color:#e6e9ee`, "Stäng");
  close.onclick = () => box.remove();
  box.append(status, actions);
  actions.append(close);
  document.body.append(box);

  const fromPage = window.g_rgProfileData && window.g_rgProfileData.steamid;
  const fromUrl = (location.pathname.match(/\/profiles\/(\d{17})/) || [])[1];
  const steamid = fromPage || fromUrl;
  if (!steamid) {
    status.textContent = "Hittade inget Steam-ID. Öppna din profil → Inventory och försök igen.";
    return;
  }

  (async () => {
    const items = {};
    let start = "";
    let total = 0;
    for (let page = 0; page < 10; page++) {
      status.textContent = `Hämtar inventory för ${steamid}… (${total} föremål)`;
      const url = `/inventory/${steamid}/730/2?l=english&count=2000${start ? `&start_assetid=${start}` : ""}`;
      let data;
      try {
        const r = await fetch(url, { credentials: "same-origin" });
        if (r.status === 429) {
          status.textContent = "Steam ber oss vänta – försök igen om en stund.";
          return;
        }
        if (r.status === 403) {
          status.textContent = "Inventoryt är privat (403). Sätt CS2-inventoryt som publikt i Steam.";
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        data = await r.json();
      } catch (e) {
        status.textContent = `Kunde inte hämta inventoryt (${e.message}).`;
        return;
      }
      const desc = new Map();
      for (const d of data.descriptions || []) desc.set(`${d.classid}_${d.instanceid}`, d);
      for (const a of data.assets || []) {
        const d = desc.get(`${a.classid}_${a.instanceid}`);
        if (!d) continue;
        const tag = {};
        for (const t of d.tags || []) tag[t.category] = t.localized_tag_name;
        // Bara vapenskins: har collection (ItemSet) och wear (Exterior).
        if (!tag.ItemSet || !tag.Exterior) continue;
        const k = d.market_hash_name;
        const it = items[k] || (items[k] = {
          n: 0, t: 0, c: tag.ItemSet, r: tag.Rarity || "", w: tag.Exterior, q: tag.Quality || "Normal",
        });
        const amount = Number(a.amount) || 1;
        it.n += amount;
        if (d.tradable) it.t += amount;
        total += amount;
      }
      if (!data.more_items || !data.last_assetid) break;
      start = data.last_assetid;
      await sleep(1500);
    }

    const result = { type: "steam-inventory", updated: new Date().toISOString(), steamid, items };
    status.textContent = `Klart! ${total} vapenskins (${Object.keys(items).length} olika).`;
    const send = el("button", btnCss, "Skicka till kalkylatorn");
    send.onclick = () => {
      const w = window.open(`${P.calc}#inv-import`, "tradeup");
      const onMsg = (e) => {
        if (e.origin !== calcOrigin || !e.data) return;
        if (e.data.type === "tradeup-ready") w.postMessage(result, calcOrigin);
        if (e.data.type === "tradeup-inventory-imported") {
          status.textContent = `Skickat! Kalkylatorn har nu ${e.data.count} skins från ditt inventory.`;
          window.removeEventListener("message", onMsg);
        }
      };
      window.addEventListener("message", onMsg);
    };
    actions.prepend(send);
  })();
}

// Höj vid varje ändring av steamMain.
export const STEAM_BOOKMARKLET_VERSION = 1;

export function buildSteamBookmarklet(calcUrl) {
  const P = { v: STEAM_BOOKMARKLET_VERSION, calc: calcUrl };
  return `javascript:${encodeURIComponent(`(${steamMain.toString()})(${JSON.stringify(P)});void 0`)}`;
}

export function isSteamOrigin(origin) {
  return origin === "https://steamcommunity.com";
}

const str = (v) => (typeof v === "string" && v.length < 200 ? v : "");
const int = (v) => (Number.isInteger(v) && v >= 0 && v < 1e6 ? v : 0);

/** Tar emot inventory från bokmärket; bara väntade fält och rimliga värden. */
export function sanitizeInventory(data) {
  if (!data || data.type !== "steam-inventory" || typeof data.items !== "object" || !data.items) return null;
  const items = {};
  for (const [k, v] of Object.entries(data.items)) {
    if (!str(k) || !v || typeof v !== "object" || !int(v.n)) continue;
    items[k] = { n: int(v.n), t: Math.min(int(v.t), int(v.n)), c: str(v.c), r: str(v.r), w: str(v.w), q: str(v.q) };
  }
  const updated = Number.isNaN(Date.parse(data.updated)) ? new Date().toISOString() : data.updated;
  return { updated, steamid: /^\d{17}$/.test(data.steamid) ? data.steamid : "", items };
}

/**
 * Sammanställer inventoryt för 10-trade-ups. Normal och souvenir räknas ihop
 * (souvenir får användas som input), StatTrak för sig. Covert tas med i
 * collection-listan men inte i trade-up-räkningen (de kan inte tradeas upp i
 * en vanlig 10-trade-up).
 */
export function summarizeInventory(items) {
  const tradeable = RARITIES.length - 1; // index för Covert
  const empty = () => RARITIES.map(() => 0);
  const byRarity = { normal: empty(), stattrak: empty() };
  const byCollection = new Map();
  for (const [name, it] of Object.entries(items)) {
    const r = RARITIES.indexOf(it.r);
    if (r < 0) continue;
    const kind = it.q === "StatTrak™" ? "stattrak" : it.q === "Normal" || it.q === "Souvenir" ? "normal" : null;
    if (!kind) continue;
    byRarity[kind][r] += it.n;
    const col = byCollection.get(it.c) || { normal: empty(), stattrak: empty(), skins: [] };
    col[kind][r] += it.n;
    col.skins.push({ name, rarity: r, count: it.n, tradable: it.t, kind, souvenir: it.q === "Souvenir" });
    byCollection.set(it.c, col);
  }
  for (const col of byCollection.values()) {
    col.skins.sort((a, b) => a.rarity - b.rarity || a.name.localeCompare(b.name));
  }
  const tradeUps = (n) => ({
    count: n,
    full: Math.floor(n / INPUT_COUNT),
    rest: n % INPUT_COUNT,
    missing: n % INPUT_COUNT ? INPUT_COUNT - (n % INPUT_COUNT) : 0,
  });
  return {
    byRarity: {
      normal: byRarity.normal.slice(0, tradeable).map(tradeUps),
      stattrak: byRarity.stattrak.slice(0, tradeable).map(tradeUps),
    },
    byCollection: [...byCollection.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}
