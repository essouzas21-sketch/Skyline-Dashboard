#!/usr/bin/env python3
"""Gera fixtures JSON locais para homologação a partir da API."""

import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "homolog"

SOURCES = {
    "reparo.json": "https://automacao.skylinemobile.com.br/webhook/8d085005-6279-410a-882c-051ad2a189cf",
    "recebimento.json": "https://automacao.skylinemobile.com.br/webhook/f16be280-a545-440c-80f4-9481b1dd06f6",
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
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "files": list(SOURCES.keys()),
    }
    (OUT / "manifest.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"\nFixtures em {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
