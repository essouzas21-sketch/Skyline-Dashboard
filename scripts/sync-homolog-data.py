#!/usr/bin/env python3
"""Gera fixtures JSON locais para homologação a partir da API."""

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "homolog"

SOURCES = {
    "reparo.json": "https://automation.gruposkytech.com.br/webhook/8407c7c4-ba6d-49f9-b31f-d6d2ebddfeaf",
    "recebimento.json": "https://automation.gruposkytech.com.br/webhook/661802e8-eef7-4ca5-981b-645706f5afda",
}


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "Skyline-Homolog-Sync/1.0"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode("utf-8"))


def count_rows(payload) -> int:
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, list):
                return len(value)
    return 0


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    for name, url in SOURCES.items():
        print(f"Buscando {name}…")
        payload = fetch_json(url)
        dest = OUT / name
        dest.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print(f"  {name}: {count_rows(payload)} registro(s)")

    meta = {
        "generated_by": "sync-homolog-data.py",
        "files": list(SOURCES.keys()),
    }
    (OUT / "manifest.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"\nFixtures em {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
