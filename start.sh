#!/usr/bin/env bash
# Servidor local para o dashboard (obrigatório — não abra file:// nas TVs)
cd "$(dirname "$0")"
PORT="${1:-8080}"
HOST="${2:-0.0.0.0}"

echo ""
echo "  Skyline — Análise da Produção"
echo "  -----------------------------"
echo "  Nesta máquina:  http://localhost:${PORT}/menu.html"
echo "  Nas TVs (LAN):  http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo 'SEU-IP'):${PORT}/menu.html"
echo ""
echo "  Ctrl+C para parar"
echo ""

python3 -m http.server "$PORT" --bind "$HOST"
