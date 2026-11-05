"""Bygger site/data.json: alla skins som kan ingå i trade-ups + tradeits priser.

Körs av GitHub Actions. Bara standardbiblioteket behövs.

  python scripts/fetch_data.py               # hämtar allt
  python scripts/fetch_data.py --max-pages 3 # snabbtest
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SKINS_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json"
TRADEIT_URL = "https://tradeit.gg/api/v2/inventory/data"
RARITIES = ["Consumer Grade", "Industrial Grade", "Mil-Spec Grade",
            "Restricted", "Classified", "Covert"]
WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"]
# Höj när data.json får nytt innehåll, så att publicerad data inte återanvänds.
DATA_FORMAT = 2  # 2: souvenir-flagga och souvenir-priser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/json",
}
PAGE_SIZE = 120


def get_json(url: str, retries: int = 4) -> object:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == retries - 1:
                raise
            wait = 5 * (attempt + 1)
            print(f"  fel ({e}), försöker igen om {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise AssertionError("unreachable")


def load_skins() -> list[dict]:
    """Skins med collection och rarity Consumer–Covert (knivar/handskar utesluts)."""
    out = []
    for s in get_json(SKINS_URL):
        cols = s.get("collections") or []
        rarity = (s.get("rarity") or {}).get("name")
        if not cols or rarity not in RARITIES or s.get("min_float") is None:
            continue
        out.append({
            "name": s["name"],
            "rarity": RARITIES.index(rarity),
            "collection": cols[0]["name"],
            "min": s["min_float"],
            "max": s["max_float"],
            "stattrak": bool(s.get("stattrak")),
            "souvenir": bool(s.get("souvenir")),
            "weapon": (s.get("weapon") or {}).get("name", ""),
        })
    return out


def wanted_names(skins: list[dict]) -> set[str]:
    """Namnen vi vill ha pris på: normal, StatTrak och Souvenir (souvenir får
    användas som input i trade-ups, men outcomes är alltid normala)."""
    names = set()
    for s in skins:
        for w in WEARS:
            names.add(f"{s['name']} ({w})")
            if s["stattrak"]:
                names.add(f"StatTrak™ {s['name']} ({w})")
            if s.get("souvenir"):
                names.add(f"Souvenir {s['name']} ({w})")
    return names


def fetch_tradeit_prices(wanted: set[str], max_pages: int, delay: float) -> dict[str, float]:
    """Går igenom tradeits lager (billigast först) och sparar lägsta listpris
    (bytesvärde, USD) per skinnamn."""
    prices: dict[str, float] = {}
    for page in range(max_pages):
        params = {
            "gameId": 730, "offset": page * PAGE_SIZE, "limit": PAGE_SIZE,
            "sortType": "Price - low", "searchValue": "", "minFloat": 0, "maxFloat": 1,
            "showTradeLock": "true", "onlyTradeLock": "false", "showUserListing": "true",
            "stickerName": "", "context": "trade", "fresh": "true", "isForStore": 0,
        }
        data = get_json(f"{TRADEIT_URL}?{urllib.parse.urlencode(params)}")
        items = data.get("items") or []
        if not items:
            print(f"tradeit: slut efter {page} sidor")
            break
        for it in items:
            name, price = it.get("name"), it.get("price")
            if name in wanted and isinstance(price, (int, float)) and price > 0:
                usd = price / 100
                if usd < prices.get(name, float("inf")):
                    prices[name] = usd
        if page % 20 == 0:
            print(f"tradeit: sida {page}, {len(prices)} priser hittills")
        time.sleep(delay)
    else:
        print(f"tradeit: stannade vid max {max_pages} sidor")
    return prices


def filter_collections(skins: list[dict], wanted: list[str]) -> list[dict]:
    """Behåller skins vars collection innehåller något av namnen (t.ex. "Harlequin")."""
    keys = [w.lower() for w in wanted]
    return [s for s in skins if any(k in s["collection"].lower() for k in keys)]


def fetch_prices_by_search(skins: list[dict], delay: float) -> dict[str, float]:
    """Söker upp varje skin på tradeit (en sökning per skin ger alla wears och
    StatTrak) och sparar lägsta listpris per exakt namn."""
    wanted = wanted_names(skins)
    prices: dict[str, float] = {}
    for n, s in enumerate(skins, 1):
        # Sök på mönsternamnet ("Rose Hex"); resultaten filtreras på exakt namn.
        query = s["name"].split(" | ", 1)[-1]
        params = {
            "gameId": 730, "offset": 0, "limit": PAGE_SIZE, "sortType": "Price - low",
            "searchValue": query, "minFloat": 0, "maxFloat": 1, "showTradeLock": "true",
            "onlyTradeLock": "false", "showUserListing": "true", "stickerName": "",
            "context": "trade", "fresh": "true", "isForStore": 0,
        }
        data = get_json(f"{TRADEIT_URL}?{urllib.parse.urlencode(params)}")
        for it in data.get("items") or []:
            name, price = it.get("name"), it.get("price")
            if name in wanted and isinstance(price, (int, float)) and price > 0:
                prices[name] = min(price / 100, prices.get(name, float("inf")))
        print(f"  {n}/{len(skins)} {s['name']}")
        time.sleep(delay)
    return prices


def reuse_published(url: str, collections: set[str], out: str) -> bool:
    """Kopierar den publicerade data.json om den gäller samma collections.
    Då slipper en ändring av sidan hämta om alla priser."""
    try:
        old = get_json(url, retries=2)
    except Exception as e:  # noqa: BLE001 - finns ingen publicerad version hämtas allt
        print(f"kunde inte läsa publicerad data ({e}), hämtar nya priser")
        return False
    old_cols = {s.get("collection") for s in old.get("skins", [])}
    if old_cols != collections or not old.get("prices"):
        print("collections har ändrats, hämtar nya priser")
        return False
    if old.get("format") != DATA_FORMAT:
        print("dataformatet har ändrats, hämtar nya priser")
        return False
    Path(out).write_text(json.dumps(old, ensure_ascii=False, separators=(",", ":")),
                         encoding="utf-8")
    print(f"återanvände priser från {old.get('updated')} ({len(old['prices'])} st)")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="site/data.json")
    ap.add_argument("--collections", default="collections.json",
                    help="JSON-lista med collections att hämta priser för (tom = alla)")
    ap.add_argument("--max-pages", type=int, default=800)
    ap.add_argument("--delay", type=float, default=1.2)
    ap.add_argument("--reuse", metavar="URL",
                    help="återanvänd publicerad data.json om den har samma collections")
    args = ap.parse_args()

    skins = load_skins()
    print(f"skins: {len(skins)}")
    path = Path(args.collections)
    chosen = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    if chosen:
        skins = filter_collections(skins, chosen)
        found = sorted({s["collection"] for s in skins})
        print(f"collections: {found} ({len(skins)} skins)")
        missing = [c for c in chosen if not any(c.lower() in f.lower() for f in found)]
        if missing:
            print(f"Hittade inte: {missing}", file=sys.stderr)
            return 1
        if args.reuse and reuse_published(args.reuse, set(found), args.out):
            return 0
        prices = fetch_prices_by_search(skins, args.delay)
    else:
        prices = fetch_tradeit_prices(wanted_names(skins), args.max_pages, args.delay)
    print(f"priser: {len(prices)}")
    if len(prices) < min(50, len(skins)):
        print("För få priser – något är fel, avbryter utan att skriva över.", file=sys.stderr)
        return 1

    data = {
        "format": DATA_FORMAT,
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "skins": skins,
        "prices": dict(sorted(prices.items())),
    }
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                              encoding="utf-8")
    print(f"skrev {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
