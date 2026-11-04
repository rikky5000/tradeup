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
            "weapon": (s.get("weapon") or {}).get("name", ""),
        })
    return out


def wanted_names(skins: list[dict]) -> set[str]:
    names = set()
    for s in skins:
        for w in WEARS:
            names.add(f"{s['name']} ({w})")
            if s["stattrak"]:
                names.add(f"StatTrak™ {s['name']} ({w})")
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="site/data.json")
    ap.add_argument("--max-pages", type=int, default=800)
    ap.add_argument("--delay", type=float, default=1.2)
    args = ap.parse_args()

    skins = load_skins()
    print(f"skins: {len(skins)}")
    prices = fetch_tradeit_prices(wanted_names(skins), args.max_pages, args.delay)
    print(f"priser: {len(prices)}")
    if len(prices) < 50:
        print("För få priser – något är fel, avbryter utan att skriva över.", file=sys.stderr)
        return 1

    data = {
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
