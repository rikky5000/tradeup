// Bokmärket ("bookmarklet") som fångar Pirateswap-priser medan du använder
// pirateswap.com som vanligt. Det gör inga egna anrop: det lyssnar bara på de
// sökresultat sidan själv laddar och sparar lägsta pris per skin. Priserna
// skickas sedan till kalkylatorn via postMessage.
//
// psMain körs på pirateswap.com och får därför inte använda något utanför sig
// själv – allt den behöver skickas in som P.

export function psMain(P) {
  if (!/(^|\.)pirateswap\.com$/.test(location.hostname)) {
    alert("Öppna pirateswap.com först och klicka sedan på bokmärket igen.");
    return;
  }
  if (document.getElementById("tu-ps")) return;
  const WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];
  const STORE = "tu-ps-capture";
  const calcOrigin = new URL(P.calc).origin;

  // Vilka namn vi bryr oss om, och vilket skin varje namn hör till.
  const skinOf = new Map();
  for (const [name, , st] of P.skins) {
    for (const w of WEARS) {
      skinOf.set(`${name} (${w})`, name);
      if (st) skinOf.set(`StatTrak™ ${name} (${w})`, name);
    }
  }
  // Fångade priser överlever omladdning av sidan (sparas i den här webbläsaren).
  let captured = {};
  try { captured = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { captured = {}; }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(captured)); } catch { /* fullt */ } };

  const el = (tag, css, text) => {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };
  const btnCss = "font:inherit;color:#111;background:#f5a623;border:0;border-radius:6px;"
    + "padding:6px 10px;cursor:pointer;margin:0 6px 6px 0";
  const greyBtn = `${btnCss};background:#2e3642;color:#e6e9ee`;

  const box = el("div", "position:fixed;z-index:2147483647;top:16px;right:16px;width:330px;"
    + "max-height:85vh;overflow:auto;background:#1a1f26;color:#e6e9ee;border:1px solid #f5a623;"
    + "border-radius:10px;padding:14px;font:13px system-ui,sans-serif;"
    + "box-shadow:0 8px 30px rgba(0,0,0,.5);text-align:left");
  box.id = "tu-ps";
  box.append(el("div", "font-weight:600;font-size:14px;margin-bottom:6px", "Fånga Pirateswap-priser"));
  box.append(el("div", "font-size:12px;color:#8b95a5;margin-bottom:8px",
    "Sök under Our Items som vanligt – priserna sparas automatiskt. Sortera på pris ↑ "
    + "(billigast först) så fångas lägsta priset. Klicka på ett skin nedan för att söka på det."));

  const count = el("div", "margin:6px 0;font-weight:600");
  const select = el("select", "width:100%;margin:4px 0 6px;font:inherit;color:#e6e9ee;"
    + "background:#222832;border:1px solid #2e3642;border-radius:6px;padding:5px");
  const cols = [...new Set(P.skins.map((s) => s[1]))].sort();
  select.append(new Option("Välj collection…", ""), ...cols.map((c) => new Option(c, c)));
  const list = el("div", "max-height:38vh;overflow:auto;margin-bottom:8px");
  const status = el("div", "font-size:12px;margin:6px 0;white-space:pre-line;color:#8b95a5");
  const send = el("button", btnCss, "Skicka till kalkylatorn");
  const copy = el("button", greyBtn, "Kopiera");
  const reset = el("button", greyBtn, "Töm");
  const close = el("button", greyBtn, "Stäng");
  box.append(count, select, list, send, copy, reset, close, status);
  document.body.append(box);

  const pricedSkins = () => new Set(Object.keys(captured).map((n) => skinOf.get(n)));
  const render = () => {
    const n = Object.keys(captured).length;
    count.textContent = `${n} priser fångade`;
    const done = pricedSkins();
    list.replaceChildren();
    for (const [name, col] of P.skins) {
      if (col !== select.value) continue;
      const row = el("div", "padding:3px 4px;border-radius:4px;cursor:pointer;display:flex;gap:6px");
      row.append(el("span", `width:14px;color:${done.has(name) ? "#3ecf8e" : "#8b95a5"}`,
        done.has(name) ? "✓" : "·"), el("span", "", name));
      row.title = "Sök på det här skinnet i Our Items";
      row.onmouseenter = () => { row.style.background = "#222832"; };
      row.onmouseleave = () => { row.style.background = ""; };
      row.onclick = () => searchFor(name.split(" | ")[1] || name);
      list.append(row);
    }
  };
  select.onchange = render;

  // Skriver in en sökning i sidans eget sökfält (det sista, dvs. Our Items).
  const searchFor = (q) => {
    const inputs = [...document.querySelectorAll("input")]
      .filter((i) => /search|sök/i.test(i.placeholder || "") && i.offsetParent !== null);
    const target = inputs[inputs.length - 1];
    if (!target) {
      status.textContent = `Hittade inget sökfält – sök på "${q}" själv.`;
      return;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(target, q);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    status.textContent = `Söker på "${q}"…`;
  };

  // Lyssna på sidans egna sökresultat (både fetch och XMLHttpRequest).
  const handle = (data) => {
    let added = 0;
    for (const it of (data && data.items) || []) {
      const n = it.marketHashName;
      if (skinOf.has(n) && typeof it.price === "number" && it.price > 0) {
        if (!(captured[n] <= it.price)) added++;
        captured[n] = Math.min(it.price, captured[n] ?? Infinity);
      }
    }
    if (added) {
      save();
      render();
      status.textContent = `+${added} nya/lägre priser`;
    }
  };
  window.__tuHandle = handle;
  if (!window.__tuHooked) {
    window.__tuHooked = true;
    const isInv = (u) => typeof u === "string" && u.includes("ExchangerInventory");
    const origFetch = window.fetch;
    window.fetch = async function tuFetch(...args) {
      const res = await origFetch.apply(this, args);
      try {
        const u = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
        if (isInv(u)) res.clone().json().then((d) => window.__tuHandle(d)).catch(() => {});
      } catch { /* påverka aldrig sidan */ }
      return res;
    };
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function tuOpen(m, u, ...rest) {
      this.__tuUrl = String(u);
      return origOpen.call(this, m, u, ...rest);
    };
    XMLHttpRequest.prototype.send = function tuSend(...args) {
      if (isInv(this.__tuUrl)) {
        this.addEventListener("load", () => {
          try {
            window.__tuHandle(this.responseType === "json" ? this.response : JSON.parse(this.responseText));
          } catch { /* ignorera */ }
        });
      }
      return origSend.apply(this, args);
    };
  }

  const payload = () => ({ type: "pirateswap-prices", updated: new Date().toISOString(), prices: captured });
  send.onclick = () => {
    if (!Object.keys(captured).length) {
      status.textContent = "Inga priser fångade än – sök på några skins först.";
      return;
    }
    const data = payload();
    const w = window.open(`${P.calc}#ps-import`, "tradeup");
    const onMsg = (e) => {
      if (e.origin !== calcOrigin || !e.data) return;
      if (e.data.type === "tradeup-ready") w.postMessage(data, calcOrigin);
      if (e.data.type === "tradeup-imported") {
        status.textContent = `Skickat! Kalkylatorn har nu ${e.data.count} Pirateswap-priser.`;
        window.removeEventListener("message", onMsg);
      }
    };
    window.addEventListener("message", onMsg);
  };
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload()));
      status.textContent = "Kopierat. Klistra in under Pirateswap-priser i kalkylatorn.";
    } catch {
      const ta = el("textarea", "width:100%;height:70px;margin-top:6px");
      ta.value = JSON.stringify(payload());
      box.append(ta);
      ta.select();
    }
  };
  reset.onclick = () => {
    captured = {};
    save();
    render();
    status.textContent = "Tömt.";
  };
  close.onclick = () => {
    window.__tuHandle = () => {};
    box.remove();
  };
  render();
}

/** Bygger javascript:-länken med skinlistan (namn, collection, finns i StatTrak). */
export function buildBookmarklet(skins, calcUrl) {
  const P = {
    calc: calcUrl,
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
