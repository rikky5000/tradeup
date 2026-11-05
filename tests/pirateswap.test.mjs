import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePirateswap, isPirateswapOrigin, buildBookmarklet } from "../site/pirateswap.js";

test("tar bara emot från pirateswap.com över https", () => {
  assert.ok(isPirateswapOrigin("https://pirateswap.com"));
  assert.ok(isPirateswapOrigin("https://www.pirateswap.com"));
  assert.ok(!isPirateswapOrigin("http://pirateswap.com"));
  assert.ok(!isPirateswapOrigin("https://pirateswap.com.evil.io"));
  assert.ok(!isPirateswapOrigin("https://evilpirateswap.com"));
  assert.ok(!isPirateswapOrigin("null"));
});

test("sanering: bara positiva tal, fel typ ignoreras", () => {
  assert.equal(sanitizePirateswap({ type: "annat", prices: {} }), null);
  assert.equal(sanitizePirateswap(null), null);
  const c = sanitizePirateswap({
    type: "pirateswap-prices",
    updated: "2026-11-04T12:00:00Z",
    prices: { "A | B (Field-Tested)": 0.31, neg: -1, str: "1", nan: NaN, inf: Infinity },
  });
  assert.deepEqual(c.prices, { "A | B (Field-Tested)": 0.31 });
  assert.equal(c.updated, "2026-11-04T12:00:00Z");
});

test("bokmärket är en kodad javascript:-länk med skinlistan", () => {
  const href = buildBookmarklet(
    [{ name: "M4A1-S | Rose Hex", collection: "The Radiant Collection", stattrak: false }],
    "https://rikky5000.github.io/tradeup/",
  );
  assert.ok(href.startsWith("javascript:"));
  assert.ok(!/[#\s™]/.test(href.slice(11)), "allt ska vara %-kodat");
  const code = decodeURIComponent(href.slice(11));
  assert.ok(code.includes('["M4A1-S | Rose Hex","Radiant",0,0]'));
  assert.doesNotThrow(() => new Function(code)); // giltig JavaScript
});
