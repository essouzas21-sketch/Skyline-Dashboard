#!/usr/bin/env python3
"""Atualiza version.json para forçar reload nas TVs após deploy."""

import json
from datetime import datetime
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "version.json"


def main() -> int:
    version = datetime.now().strftime("%Y%m%d%H%M%S")
    OUT.write_text(json.dumps({"version": version}, indent=2) + "\n", encoding="utf-8")
    print(f"version.json → {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
