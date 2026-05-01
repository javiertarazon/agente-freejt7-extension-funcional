#!/bin/bash
# Fix Gateway - Free JT7 v2
# Elimina bloqueos obsoletos y reinicia el gateway OpenClaw

set -e

BASE_DIR="/home/javier28/Público/copilot vs code/agente free jt7 extension/agente-freejt7-extension-funcional"
LOCK_DIR="$BASE_DIR/.openclaw/state/agents/main/sessions"
REMOVED=0

echo "🔧 Fix Gateway OpenClaw - Free JT7"
echo "===================================="
echo ""

echo "[1/4] Buscando archivos .lock obsoletos en: $LOCK_DIR"
mkdir -p "$LOCK_DIR"

for LOCK in "$LOCK_DIR"/*.lock; do
  [ -f "$LOCK" ] || continue
  PID=$(python3 -c "
import json
try:
    with open('$LOCK') as f:
        d = json.load(f)
        print(d.get('pid', ''))
except:
    print('')
" 2>/dev/null)
  
  LOCK_NAME=$(basename "$LOCK")
  
  if [ -z "$PID" ]; then
    echo "  ╰ $LOCK_NAME → sin PID válido → ELIMINADO"
    rm -f "$LOCK"
    REMOVED=$((REMOVED+1))
  elif kill -0 "$PID" 2>/dev/null; then
    echo "  ╰ $LOCK_NAME → PID $PID ACTIVO → conservado"
  else
    echo "  ╰ $LOCK_NAME → PID $PID MUERTO → ELIMINADO"
    rm -f "$LOCK"
    REMOVED=$((REMOVED+1))
  fi
done

echo ""
echo "[2/4] Locks eliminados: $REMOVED"

echo ""
echo "[3/4] Iniciando gateway OpenClaw..."
cd "$BASE_DIR"
if command -v openclaw &>/dev/null; then
  openclaw gateway start 2>&1
elif command -v npx &>/dev/null; then
  npx openclaw gateway start 2>&1
else
  echo "  ⚠️  openclaw no encontrado en PATH. Ejecuta: openclaw gateway start"
fi

echo ""
echo "[4/4] Verificando estado..."
sleep 2
if command -v openclaw &>/dev/null; then
  STATUS=$(openclaw gateway status 2>&1)
  echo "  $STATUS"
  if echo "$STATUS" | grep -qi "running"; then
    echo ""
    echo "✅ Gateway operativo. El agente ya puede conectarse."
  else
    echo ""
    echo "⚠️  Gateway no responde. Verifica manual: openclaw gateway status"
  fi
fi

echo ""
echo "===================================="
echo "🔍 Próximo paso sugerido:"
echo "   Si el gateway no arranca, prueba:"
echo "   \$ openclaw doctor --fix"
echo "   \$ openclaw gateway restart"
