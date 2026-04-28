#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SCRIPT="$ROOT_DIR/scripts/build-freejt7-desktop-deb.sh"

"$BUILD_SCRIPT"

LATEST_DEB="$(ls -1t "$ROOT_DIR"/dist-deb/freejt7-desktop_*.deb | head -n 1)"
if [[ -z "${LATEST_DEB:-}" || ! -f "$LATEST_DEB" ]]; then
  echo "[freejt7-deb-install] ERROR: no se encontro .deb generado." >&2
  exit 1
fi

echo "[freejt7-deb-install] paquete: $LATEST_DEB"

if [[ "$(id -u)" -eq 0 ]]; then
  dpkg -i "$LATEST_DEB"
  echo "[freejt7-deb-install] instalado como root."
  exit 0
fi

if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  sudo dpkg -i "$LATEST_DEB"
  echo "[freejt7-deb-install] instalado con sudo."
  exit 0
fi

echo "[freejt7-deb-install] sin permisos root/sudo non-interactive; aplicando instalacion local en ~/.local/freejt7-desktop"
LOCAL_ROOT="$HOME/.local/freejt7-desktop"
rm -rf "$LOCAL_ROOT"
mkdir -p "$LOCAL_ROOT"
dpkg-deb -x "$LATEST_DEB" "$LOCAL_ROOT"

mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/freejt7-desktop" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$LOCAL_ROOT/opt/freejt7-desktop/scripts/freejt7-desktop-launcher.sh" "\$@"
EOF
chmod 0755 "$HOME/.local/bin/freejt7-desktop"

echo "[freejt7-deb-install] instalado localmente. Asegura ~/.local/bin en PATH y ejecuta: freejt7-desktop"
