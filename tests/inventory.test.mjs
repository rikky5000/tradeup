import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeInventory, summarizeInventory, isSteamOrigin, buildSteamBookmarklet,
} from "../site/inventory.js";

// Påhittat inventory.
const ITEMS = {
  "Galil AR | Sky Mandala (Field-Tested)": { n: 7, t: 5, c: "The Harlequin Collection", r: "Mil-Spec Grade", w: "Field-Tested", q: "Normal" },
  "Souvenir M4A1-S | Rose Hex (Field-Tested)": { n: 6, t: 6, c: "The Radiant Collection", r: "Mil-Spec Grade", w: "Field-Tested", q: "Souvenir" },
  "StatTrak™ AK-47 | X (Minimal Wear)": { n: 3, t: 3, c: "The Fever Collection", r: "Restricted", w: "Minimal Wear", q: "StatTrak™" },
  "AWP | Y (Field-Tested)": { n: 2, t: 2, c: "The Fever Collection", r: "Covert", w: "Field-Tested", q: "Normal" },
  "★ Karambit | Z (Field-Tested)": { n: 1, t: 1, c: "", r: "Covert", w: "Field-Tested", q: "★" },
};

test("bara steamcommunity.com över https godkänns", () => {
  assert.ok(isSteamOrigin("https://steamcommunity.com"));
  assert.ok(!isSteamOrigin("http://steamcommunity.com"));
  assert.ok(!isSteamOrigin("https://steamcommunity.com.evil.io"));
  assert.ok(!isSteamOrigin("https://store.steampowered.com"));
});

test("sanering", () => {
  assert.equal(sanitizeInventory({ type: "annat", items: {} }), null);
  const c = sanitizeInventory({
    type: "steam-inventory", steamid: "76561198000000000", updated: "2026-11-06T08:00:00Z",
    items: { ...ITEMS, bad: { n: -3 }, bad2: { n: 1.5 }, bad3: "x" },
  });
  assert.equal(c.steamid, "76561198000000000");
  assert.equal(Object.keys(c.items).length, 5);
  assert.equal(sanitizeInventory({ type: "steam-inventory", steamid: "evil", items: {} }).steamid, "");
});

test("sammanställning: normal+souvenir ihop, StatTrak för sig, Covert/kniv utanför", () => {
  const s = summarizeInventory(ITEMS);
  // Mil-Spec (index 2): 7 Galil + 6 souvenir Rose Hex = 13 -> 1 trade-up, rest 3, saknas 7
  assert.deepEqual(s.byRarity.normal[2], { count: 13, full: 1, rest: 3, missing: 7 });
  assert.deepEqual(s.byRarity.stattrak[3], { count: 3, full: 0, rest: 3, missing: 7 });
  assert.equal(s.byRarity.normal.length, 5); // Covert räknas inte som trade-up-input
  const cols = Object.fromEntries(s.byCollection);
  assert.equal(cols["The Fever Collection"].normal[5], 2); // Covert syns per collection
  assert.ok(!("" in cols)); // kniven (★) räknas inte
  assert.equal(cols["The Radiant Collection"].skins[0].souvenir, true);
});

test("Steam-bokmärket är en giltig, kodad länk", () => {
  const href = buildSteamBookmarklet("https://rikky5000.github.io/tradeup/");
  assert.ok(href.startsWith("javascript:"));
  assert.doesNotThrow(() => new Function(decodeURIComponent(href.slice(11))));
});
