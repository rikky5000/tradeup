import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTradeUp, evaluate, wearOf, normalizeFloat, marketName, distanceToWearEdge, pickBuy, pickSell,
} from "../site/tradeup.js";

// Påhittade testskins (namnen spelar ingen roll för räkningen).
const S = (name, collection, rarity, min = 0, max = 1, stattrak = true) =>
  ({ name, collection, rarity, min, max, stattrak });

const A1 = S("A in 1", "A", 2, 0, 0.5);
const A_out1 = S("A out 1", "A", 3, 0, 0.8);
const A_out2 = S("A out 2", "A", 3, 0.1, 0.6);
const B1 = S("B in 1", "B", 2, 0.06, 0.8);
const B_out = S("B out", "B", 3, 0, 1, false);
const C1 = S("C in 1", "C", 2); // C saknar nästa rarity
const ALL = [A1, A_out1, A_out2, B1, B_out, C1];

const ten = (skinFloat) => Array.from({ length: 10 }, (_, i) => skinFloat(i));

test("wear-gränser", () => {
  assert.equal(wearOf(0.0699), "Factory New");
  assert.equal(wearOf(0.07), "Minimal Wear");
  assert.equal(wearOf(0.15), "Field-Tested");
  assert.equal(wearOf(0.3799), "Field-Tested");
  assert.equal(wearOf(0.45), "Battle-Scarred");
  assert.ok(Math.abs(distanceToWearEdge(0.1501) - 0.0001) < 1e-12);
});

test("normalisering", () => {
  assert.equal(normalizeFloat(A1, 0.25), 0.5);
  assert.ok(Math.abs(normalizeFloat(B1, 0.43) - 0.5) < 1e-12);
});

test("odds: 7 från A (2 outcomes) och 3 från B (1 outcome)", () => {
  const inputs = ten((i) => (i < 7 ? { skin: A1, float: 0.1 } : { skin: B1, float: 0.2 }));
  const r = computeTradeUp(inputs, ALL);
  assert.deepEqual(r.errors, []);
  const p = Object.fromEntries(r.outcomes.map((o) => [o.skin.name, o.prob]));
  assert.ok(Math.abs(p["A out 1"] - 0.35) < 1e-12);
  assert.ok(Math.abs(p["A out 2"] - 0.35) < 1e-12);
  assert.ok(Math.abs(p["B out"] - 0.3) < 1e-12);
});

test("outputfloat använder normaliserade inputs", () => {
  // A1 0.25 -> 0.5 normaliserat; B1 0.43 -> 0.5 normaliserat; snitt 0.5
  const inputs = ten((i) => (i % 2 ? { skin: A1, float: 0.25 } : { skin: B1, float: 0.43 }));
  const r = computeTradeUp(inputs, ALL);
  const f = Object.fromEntries(r.outcomes.map((o) => [o.skin.name, o.float]));
  assert.ok(Math.abs(r.avgNorm - 0.5) < 1e-12);
  assert.ok(Math.abs(f["A out 1"] - 0.4) < 1e-12); // 0 + 0.5*0.8
  assert.ok(Math.abs(f["A out 2"] - 0.35) < 1e-12); // 0.1 + 0.5*0.5
  assert.ok(Math.abs(f["B out"] - 0.5) < 1e-12);
});

test("fel: för få, blandad rarity, utanför float, saknad nästa rarity", () => {
  assert.match(computeTradeUp([{ skin: A1, float: 0.1 }], ALL).errors[0], /10 inputs/);
  const mixed = ten((i) => ({ skin: i ? A1 : A_out1, float: 0.1 }));
  assert.ok(computeTradeUp(mixed, ALL).errors.some((e) => /samma rarity/.test(e)));
  const bad = ten(() => ({ skin: A1, float: 0.7 }));
  assert.ok(computeTradeUp(bad, ALL).errors.some((e) => /utanför/.test(e)));
  const noNext = ten(() => ({ skin: C1, float: 0.1 }));
  assert.ok(computeTradeUp(noNext, ALL).errors.some((e) => /inga skins i nästa/.test(e)));
});

test("StatTrak utesluter outcomes som saknar StatTrak", () => {
  const inputs = ten((i) => (i < 5 ? { skin: A1, float: 0.1 } : { skin: B1, float: 0.2 }));
  const r = computeTradeUp(inputs, ALL, { stattrak: true });
  assert.ok(r.errors.some((e) => /B har inga skins/.test(e)));
});

test("evaluate: EV, vinstchans och inbytesvärde", () => {
  const inputs = ten((i) => (i < 7 ? { skin: A1, float: 0.1 } : { skin: B1, float: 0.2 }));
  const r = computeTradeUp(inputs, ALL);
  const prices = {
    [marketName(A_out1, r.outcomes.find((o) => o.skin === A_out1).wear)]: 11.5,
    [marketName(A_out2, r.outcomes.find((o) => o.skin === A_out2).wear)]: 2.3,
    [marketName(B_out, r.outcomes.find((o) => o.skin === B_out).wear)]: 4.6,
  };
  const e = evaluate(r, Array(10).fill(0.5), (n) => prices[n] ?? null, { intakeDivisor: 1.15 });
  assert.equal(e.cost, 5);
  // värden: 10, 2, 4 -> EV = 0.35*10 + 0.35*2 + 0.3*4 = 5.4
  assert.ok(Math.abs(e.ev - 5.4) < 1e-9);
  assert.ok(Math.abs(e.profit - 0.4) < 1e-9);
  assert.ok(Math.abs(e.chanceProfit - 0.35) < 1e-12);
  assert.ok(Math.abs(e.pricedShare - 1) < 1e-12);
});

test("evaluate: saknade priser markeras", () => {
  const inputs = ten(() => ({ skin: A1, float: 0.1 }));
  const r = computeTradeUp(inputs, ALL);
  const e = evaluate(r, [1, 1, 1, 1, 1, 1, 1, 1, 1, null], () => null);
  assert.equal(e.pricedShare, 0);
  assert.equal(e.missingInputPrices, 1);
});

test("pickBuy: vald sajt eller billigast", () => {
  const p = { tradeit: 1.0, pirateswap: 0.8 };
  assert.deepEqual(pickBuy(p, "tradeit"), { price: 1.0, source: "tradeit" });
  assert.deepEqual(pickBuy(p, "cheapest"), { price: 0.8, source: "pirateswap" });
  assert.deepEqual(pickBuy({ tradeit: 1.0, pirateswap: null }, "cheapest"), { price: 1.0, source: "tradeit" });
  assert.equal(pickBuy({ tradeit: null, pirateswap: null }, "cheapest"), null);
  assert.equal(pickBuy({ tradeit: 1, pirateswap: null }, "pirateswap"), null);
});

test("pickSell: egen divisor per sajt, bäst = högst inbytesvärde", () => {
  const div = { tradeit: 1.15, pirateswap: 1.12 };
  // 2.30/1.15 = 2.00 mot 2.24/1.12 = 2.00 -> lika; 2.28/1.12 ≈ 2.036 vinner
  const s = pickSell({ tradeit: 2.3, pirateswap: 2.28 }, div, "best");
  assert.equal(s.source, "pirateswap");
  assert.ok(Math.abs(s.value - 2.28 / 1.12) < 1e-12);
  assert.equal(pickSell({ tradeit: 2.3, pirateswap: 2.28 }, div, "tradeit").value, 2);
});

test("evaluate med {list, value, source}", () => {
  const inputs = ten(() => ({ skin: A1, float: 0.1 }));
  const r = computeTradeUp(inputs, ALL);
  const e = evaluate(r, Array(10).fill(0.1), () => ({ list: 2.24, value: 2, source: "pirateswap" }));
  assert.ok(Math.abs(e.ev - 2) < 1e-12);
  assert.equal(e.rows[0].source, "pirateswap");
});

test("marknadsnamn", () => {
  assert.equal(marketName(A1, "Field-Tested", true), "StatTrak™ A in 1 (Field-Tested)");
});
