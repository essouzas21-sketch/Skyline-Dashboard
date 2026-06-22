#!/usr/bin/env bash
# Homologação local — dados em data/homolog/ (sem bater na API de produção)
cd "$(dirname "$0")"

if [ ! -f "data/homolog/reparo.json" ] || [ ! -f "data/homolog/recebimento.json" ]; then
  echo "Gerando fixtures locais…"
  python3 scripts/sync-homolog-data.py || {
    echo "Erro ao gerar fixtures. Rode: python3 scripts/sync-homolog-data.py"
    exit 1
  }
fi

PORT="${1:-8080}"
HOST="${2:-0.0.0.0}"

echo ""
echo "  Skyline — HOMOLOGAÇÃO (dados locais)"
echo "  ------------------------------------"
echo "  Menu:        http://localhost:${PORT}/menu.html?homolog=1"
echo "  Consolidado: http://localhost:${PORT}/consolidado.html?homolog=1"
echo "  TVs (LAN):   http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo 'SEU-IP'):${PORT}/menu.html?homolog=1"
echo ""
echo "  Atualizar dados: python3 scripts/sync-homolog-data.py --api"
echo "  API real local:  acrescente ?prod=1 na URL"
echo "  Ctrl+C para parar"
echo ""

python3 -m http.server "$PORT" --bind "$HOST"
