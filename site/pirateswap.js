// Bokmärket ("bookmarklet") som hämtar Pirateswap-priser från användarens egen
// webbläsare medan pirateswap.com är öppen. Det använder samma sökning som
// sidan själv gör, i lugn takt, och skickar resultatet till kalkylatorn via
// postMessage. psMain körs på pirateswap.com och får därför inte använda något
// utanför sig själv – allt den behöver skickas in som P.

/* eslint-disable no-await-in-loop */
export function psMain(P) {
  if (!/(^|\.)pirateswap\.com$/.test(location.hostname)) {
    alert("Öppna pirateswap.com först och klicka sedan på bokmärket igen.");
    return;
  }
  if (document.getElementById("tu-ps")) return;
  const WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];
  const API = "https://web.pirateswap.com/inventory/v2/ExchangerInventory";
  const PAGE = 40;
  const MAX_PAGES = 10;
  const calcOrigin = new URL(P.calc).origin;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = (tag, css, text) => {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };
  const btnCss = "font:inherit;color:#111;background:#f5a623;border:0;border-radius:6px;"
    + "padding:6px 12px;cursor:pointer;margin-right:6px";

  const box = el("div", "position:fixed;z-index:2147483647;top:16px;right:16px;width:340px;"
    + "max-height:80vh;overflow:auto;background:#1a1f26;color:#e6e9ee;border:1px solid #f5a623;"
    + "border-radius:10px;padding:14px;font:14px system-ui,sans-serif;"
    + "box-shadow:0 8px 30px rgba(0,0,0,.5);text-align:left");
  box.id = "tu-ps";
  box.append(el("div", "font-weight:600;margin-bottom:6px", "Hämta Pirateswap-priser"));
  box.append(el("div", "font-size:12px;color:#8b95a5;margin-bottom:8px",
    "Välj collections. Priserna hämtas i lugn takt med Pirateswaps egen sökning."));

  const cols = [...new Set(P.skins.map((s) => s[1]))].sort();
  const checks = cols.map((c) => {
    const label = el("label", "display:block;font-size:13px;margin:2px 0;cursor:pointer");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.value = c;
    cb.style.marginRight = "6px";
    label.append(cb, document.createTextNode(c));
    return { label, cb };
  });
  const toggle = el("button", btnCss + ";background:#2e3642;color:#e6e9ee", "Alla / inga");
  toggle.onclick = () => {
    const on = !checks.every((c) => c.cb.checked);
    checks.forEach((c) => { c.cb.checked = on; });
  };
  const list = el("div", "margin:6px 0 10px;max-height:40vh;overflow:auto");
  checks.forEach((c) => list.append(c.label));
  const go = el("button", btnCss, "Hämta");
  const close = el("button", btnCss + ";background:#2e3642;color:#e6e9ee", "Stäng");
  const status = el("div", "margin-top:10px;font-size:12px;white-space:pre-line");
  const actions = el("div", "margin-top:10px");
  box.append(toggle, list, go, close, status, actions);
  document.body.append(box);

  let stopped = false;
  close.onclick = () => { stopped = true; box.remove(); };

  go.onclick = async () => {
    go.disabled = true;
    toggle.disabled = true;
    checks.forEach((c) => { c.cb.disabled = true; });
    const chosen = new Set(checks.filter((c) => c.cb.checked).map((c) => c.cb.value));
    const wanted = new Set();
    const queries = new Set();
    for (const [name, col, st] of P.skins) {
      if (!chosen.has(col)) continue;
      for (const w of WEARS) {
        wanted.add(`${name} (${w})`);
        if (st) wanted.add(`StatTrak™ ${name} (${w})`);
      }
      queries.add(name.split(" | ")[1] || name);
    }
    const qs = [...queries];
    const prices = {};
    let errors = 0;
    // Prova först utan cookies (som sidan själv), sedan med. Det sätt som
    // fungerar används för resten av sökningarna.
    const modes = ["omit", "include"];
    let mode = null;
    const get = async (url) => {
      if (mode) return fetch(url, { credentials: mode });
      let last;
      for (const m of modes) {
        try {
          const r = await fetch(url, { credentials: m });
          mode = m;
          return r;
        } catch (e) {
          last = e;
        }
      }
      throw new Error(`${last && last.message} (provade utan och med cookies)`);
    };
    for (let i = 0; i < qs.length && !stopped; i++) {
      for (let page = 1; page <= MAX_PAGES && !stopped; page++) {
        const url = `${API}?orderBy=price&sortOrder=ASC&page=${page}&results=${PAGE}`
          + `&searchPhrase=${encodeURIComponent(qs[i])}`;
        let items = [];
        try {
          const r = await get(url);
          if (r.status === 429) {
            status.textContent = "Pirateswap ber oss sakta ner – väntar 20 s…";
            await sleep(20000);
            page--;
            continue;
          }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          items = (await r.json()).items || [];
        } catch (e) {
          errors++;
          if (errors >= 5 || !mode) {
            status.textContent = `Avbröt: ${e.message}\nSida: ${location.href}\n`
              + "Ta en skärmdump av den här rutan och skicka till Claude.";
            go.disabled = false;
            return;
          }
          await sleep(3000);
          break;
        }
        for (const it of items) {
          const n = it.marketHashName;
          if (wanted.has(n) && typeof it.price === "number" && it.price > 0) {
            prices[n] = Math.min(it.price, prices[n] ?? Infinity);
          }
        }
        await sleep(P.delay);
        if (items.length < PAGE) break;
      }
      status.textContent = `Söker… ${i + 1}/${qs.length}\n${Object.keys(prices).length} priser hittade`;
    }
    if (stopped) return;

    const result = { type: "pirateswap-prices", updated: new Date().toISOString(), prices };
    const n = Object.keys(prices).length;
    status.textContent = `Klart! ${n} priser från ${qs.length} sökningar.`
      + (n === 0 ? "\nInga priser hittades – skicka en skärmdump till Claude." : "");

    const send = el("button", btnCss, "Skicka till kalkylatorn");
    const copy = el("button", btnCss + ";background:#2e3642;color:#e6e9ee", "Kopiera");
    send.onclick = () => {
      const w = window.open(`${P.calc}#ps-import`, "tradeup");
      const onMsg = (e) => {
        if (e.origin !== calcOrigin || !e.data) return;
        if (e.data.type === "tradeup-ready") w.postMessage(result, calcOrigin);
        if (e.data.type === "tradeup-imported") {
          status.textContent = `Skickat! Kalkylatorn har nu ${e.data.count} Pirateswap-priser.`;
          window.removeEventListener("message", onMsg);
        }
      };
      window.addEventListener("message", onMsg);
    };
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(result));
        status.textContent = "Kopierat. Klistra in under Pirateswap-priser i kalkylatorn.";
      } catch {
        const ta = el("textarea", "width:100%;height:80px;margin-top:6px");
        ta.value = JSON.stringify(result);
        actions.append(ta);
        ta.select();
      }
    };
    actions.append(send, copy);
  };
}

/** Bygger javascript:-länken med skinlistan (namn, collection, finns i StatTrak). */
export function buildBookmarklet(skins, calcUrl, delay = 350) {
  const P = {
    calc: calcUrl,
    delay,
    skins: skins.map((s) => [s.name, s.collection.replace(/^The | Collection$/g, ""), s.stattrak ? 1 : 0]),
  };
  // Koda allt: webbläsaren avkodar %-sekvenser innan koden körs, och tecken som
  // # och ™ skulle annars kunna förstöra länken.
  return `javascript:${encodeURIComponent(`(${psMain.toString()})(${JSON.stringify(P)});void 0`)}`;
}

/**
 * Tar emot priser från bokmärket. Godkänner bara meddelanden från
 * pirateswap.com och bara positiva tal.
 */
export function sanitizePirateswap(data) {
  if (!data || data.type !== "pirateswap-prices" || typeof data.prices !== "object") return null;
  const prices = {};
  for (const [k, v] of Object.entries(data.prices)) {
    if (typeof k === "string" && k.length < 200 && typeof v === "number" && Number.isFinite(v) && v > 0) {
      prices[k] = v;
    }
  }
  const updated = Number.isNaN(Date.parse(data.updated)) ? new Date().toISOString() : data.updated;
  return { updated, prices };
}

export function isPirateswapOrigin(origin) {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && /(^|\.)pirateswap\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}
