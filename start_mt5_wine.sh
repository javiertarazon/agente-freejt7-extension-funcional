#!/usr/bin/env bash
# start_mt5_wine.sh — Inicia MetaTrader 5 bajo Wine en Linux
# Free JT7 — Conexion real, datos reales, ejecucion real
set -e

WINEPREFIX="${WINEPREFIX:-$HOME/.wine-mt5}"
export WINEPREFIX
export WINEARCH=win64
export DISPLAY="${DISPLAY:-:0}"

MT5_EXE="$WINEPREFIX/drive_c/Program Files/MetaTrader 5/terminal64.exe"
LOG_DIR="$HOME/.mt5/free-jt7/logs"
LOG_FILE="$LOG_DIR/start_mt5_$(date +%Y%m%dT%H%M%S).log"

mkdir -p "$LOG_DIR"

echo "[free-jt7] Verificando entorno Wine..."

# Verificar wine disponible
if ! command -v wine &>/dev/null; then
    echo "ERROR: 'wine' no encontrado en PATH."
    echo "  → Ejecuta: sudo apt install wine64 winetricks"
    echo "  → O revisa INSTALL_WINE_MT5.md para instrucciones completas."
    exit 1
fi

# Verificar WINEPREFIX
if [ ! -d "$WINEPREFIX" ]; then
    echo "ERROR: WINEPREFIX no existe: $WINEPREFIX"
    echo "  → Inicializa el prefijo con:"
    echo "      WINEPREFIX=$WINEPREFIX WINEARCH=win64 winecfg"
    echo "  → O revisa INSTALL_WINE_MT5.md"
    exit 1
fi

# Verificar terminal64.exe
if [ ! -f "$MT5_EXE" ]; then
    echo "ERROR: terminal64.exe no encontrado en:"
    echo "  $MT5_EXE"
    echo ""
    echo "  → Instala MetaTrader 5 primero:"
    echo "      WINEPREFIX=$WINEPREFIX DISPLAY=:0 wine mt5setup.exe"
    echo "  → O revisa INSTALL_WINE_MT5.md para la guia completa."
    exit 1
fi

# Verificar DISPLAY
if [ -z "$DISPLAY" ]; then
    echo "ERROR: Variable DISPLAY no definida."
    echo "  → Asegurate de estar en una sesion grafica o usa Xvfb:"
    echo "      Xvfb :1 -screen 0 1024x768x24 &"
    echo "      export DISPLAY=:1"
    exit 1
fi

echo "[free-jt7] Iniciando MetaTrader 5..."
echo "  WINEPREFIX : $WINEPREFIX"
echo "  WINEARCH   : $WINEARCH"
echo "  DISPLAY    : $DISPLAY"
echo "  MT5 EXE    : $MT5_EXE"
echo "  LOG        : $LOG_FILE"

wine "$MT5_EXE" >> "$LOG_FILE" 2>&1 &
MT5_PID=$!

echo "[free-jt7] MT5 iniciado con PID $MT5_PID"
echo "  → Espera ~10 segundos a que MT5 cargue antes de conectar el agente."
echo "  → Para verificar: ps aux | grep terminal64"
echo "  → Log en: $LOG_FILE"
