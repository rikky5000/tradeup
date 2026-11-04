// Räknemotor för CS2 trade-ups. Ingen DOM här, så den kan testas med node.
//
// Regler (enligt communityns mätningar; Valve publicerar inte formlerna):
// - 10 inputs av samma rarity, alla StatTrak eller ingen.
// - Chans per outcome = (inputs från collectionen / 10) / (antal skins i
//   nästa rarity i den collectionen).
// - Outputfloat (efter uppdateringen 22 okt 2025): varje inputs float
//   normaliseras mot sitt eget intervall, (f - min) / (max - min). Snittet av
//   dessa läggs på outcome-skinnets intervall: min + snitt * (max - min).

export const RARITIES = [
  "Consumer Grade", "Industrial Grade", "Mil-Spec Grade",
  "Restricted", "Classified", "Covert",
];

export const WEARS = [
  ["Factory New", 0, 0.07],
  ["Minimal Wear", 0.07, 0.15],
  ["Field-Tested", 0.15, 0.38],
  ["Well-Worn", 0.38, 0.45],
  ["Battle-Scarred", 0.45, 1],
];

export const INPUT_COUNT = 10;

export function wearOf(f) {
  for (const [name, , hi] of WEARS) if (f < hi) return name;
  return WEARS[WEARS.length - 1][0];
}

// Avstånd till närmaste wear-gräns (för att varna när avrundning kan avgöra).
export function distanceToWearEdge(f) {
  let d = Infinity;
  for (const [, lo, hi] of WEARS) d = Math.min(d, Math.abs(f - lo), Math.abs(f - hi));
  return d;
}

export function marketName(skin, wear, stattrak) {
  return `${stattrak ? "StatTrak™ " : ""}${skin.name} (${wear})`;
}

export function normalizeFloat(skin, f) {
  const span = skin.max - skin.min;
  return span > 0 ? (f - skin.min) / span : 0;
}

/**
 * @param inputs  [{skin, float}] där skin = {name, rarity, collection, min, max, stattrak}
 * @param allSkins alla skins (för att hitta nästa rarity i varje collection)
 * @param opts {stattrak: bool}
 * @returns {errors: string[], outcomes: [{skin, prob, float, wear}], avgNorm}
 */
export function computeTradeUp(inputs, allSkins, { stattrak = false } = {}) {
  const errors = [];
  const filled = inputs.filter((i) => i && i.skin);
  if (filled.length !== INPUT_COUNT) {
    errors.push(`Välj ${INPUT_COUNT} inputs (${filled.length} valda).`);
  }
  if (!filled.length) return { errors, outcomes: [], avgNorm: null };

  const rarity = filled[0].skin.rarity;
  if (filled.some((i) => i.skin.rarity !== rarity)) {
    errors.push("Alla inputs måste ha samma rarity.");
  }
  if (rarity >= RARITIES.length - 1) {
    errors.push("Covert kan inte tradeas upp i en vanlig 10-trade-up.");
  }
  for (const i of filled) {
    if (typeof i.float !== "number" || Number.isNaN(i.float)) {
      errors.push(`${i.skin.name}: ange float.`);
    } else if (i.float < i.skin.min || i.float > i.skin.max) {
      errors.push(`${i.skin.name}: float ${i.float} ligger utanför ${i.skin.min}–${i.skin.max}.`);
    }
    if (stattrak && !i.skin.stattrak) errors.push(`${i.skin.name} finns inte i StatTrak.`);
  }

  const byCollection = new Map();
  for (const i of filled) {
    byCollection.set(i.skin.collection, (byCollection.get(i.skin.collection) || 0) + 1);
  }

  const outcomes = new Map();
  for (const [collection, count] of byCollection) {
    const next = allSkins.filter(
      (s) => s.collection === collection && s.rarity === rarity + 1 && (!stattrak || s.stattrak),
    );
    if (!next.length) {
      errors.push(`${collection} har inga skins i nästa rarity – inputs därifrån kan inte användas.`);
      continue;
    }
    const share = count / INPUT_COUNT / next.length;
    for (const s of next) {
      const o = outcomes.get(s.name) || { skin: s, prob: 0 };
      o.prob += share;
      outcomes.set(s.name, o);
    }
  }

  if (errors.length) return { errors, outcomes: [], avgNorm: null };

  const avgNorm = filled.reduce((a, i) => a + normalizeFloat(i.skin, i.float), 0) / filled.length;
  const list = [...outcomes.values()].map((o) => {
    const f = o.skin.min + avgNorm * (o.skin.max - o.skin.min);
    return { ...o, float: f, wear: wearOf(f) };
  });
  list.sort((a, b) => b.prob - a.prob);
  return { errors, outcomes: list, avgNorm };
}

export const SITES = ["tradeit", "pirateswap"];

/**
 * Inköpspris för en input. prices = {tradeit: listpris|null, pirateswap: ...}.
 * mode = en sajt eller "cheapest" (billigast av de som har pris).
 */
export function pickBuy(prices, mode) {
  const options = (mode === "cheapest" ? SITES : [mode])
    .filter((s) => prices[s] > 0)
    .map((s) => ({ price: prices[s], source: s }));
  if (!options.length) return null;
  return options.reduce((a, b) => (b.price < a.price ? b : a));
}

/**
 * Inbytesvärde för en outcome: listpris / sajtens divisor.
 * mode = en sajt eller "best" (högst inbytesvärde).
 */
export function pickSell(prices, divisors, mode) {
  const options = (mode === "best" ? SITES : [mode])
    .filter((s) => prices[s] > 0)
    .map((s) => ({ list: prices[s], value: prices[s] / divisors[s], source: s }));
  if (!options.length) return null;
  return options.reduce((a, b) => (b.value > a.value ? b : a));
}

/**
 * Lägger på priser. Kostnad = summan av inputs. priceOf(namn) ger antingen ett
 * listpris (värde = listpris / intakeDivisor) eller {list, value, source}.
 */
export function evaluate(result, inputCosts, priceOf, { intakeDivisor = 1.15, stattrak = false } = {}) {
  const cost = inputCosts.reduce((a, c) => a + (c || 0), 0);
  const missingInputPrices = inputCosts.filter((c) => !(c > 0)).length;
  let ev = 0;
  let pProfit = 0;
  let pPriced = 0;
  const rows = result.outcomes.map((o) => {
    const name = marketName(o.skin, o.wear, stattrak);
    const p = priceOf(name);
    let list = null;
    let value = null;
    let source = null;
    if (p && typeof p === "object") ({ list = null, value = null, source = null } = p);
    else if (p != null) [list, value] = [p, p / intakeDivisor];
    if (value != null) {
      ev += o.prob * value;
      pPriced += o.prob;
      if (value > cost) pProfit += o.prob;
    }
    return { ...o, name, list, value, source, profit: value != null ? value - cost : null };
  });
  return {
    rows,
    cost,
    ev,
    profit: ev - cost,
    roi: cost > 0 ? (ev - cost) / cost : null,
    chanceProfit: pProfit,
    // Andel av sannolikheten som har pris; < 1 betyder att EV är ofullständigt.
    pricedShare: pPriced,
    missingInputPrices,
  };
}
