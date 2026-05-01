#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SCRIPT="$ROOT_DIR/scripts/build-freejt7-desktop-rpm.sh"

# shellcheck source=./ensure-rpm-toolchain.sh
source "$ROOT_DIR/scripts/ensure-rpm-toolchain.sh"
freejt7_rpm_setup_toolchain

"$BUILD_SCRIPT"

LATEST_RPM="$(ls -1t "$ROOT_DIR"/dist-rpm/freejt7-desktop_*.rpm | head -n 1)"
if [[ -z "${LATEST_RPM:-}" || ! -f "$LATEST_RPM" ]]; then
  echo "[freejt7-rpm-install] ERROR: no se encontro .rpm generado." >&2
  exit 1
fi

echo "[freejt7-rpm-install] paquete: $LATEST_RPM"

if [[ "$(id -u)" -eq 0 ]]; then
  "$FREEJT7_RPM_BIN" -Uvh --replacepkgs "$LATEST_RPM"
  echo "[freejt7-rpm-install] instalado como root."
  exit 0
fi

if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  sudo "$FREEJT7_RPM_BIN" -Uvh --replacepkgs "$LATEST_RPM"
  echo "[freejt7-rpm-install] instalado con sudo."
  exit 0
fi

echo "[freejt7-rpm-install] sin permisos root/sudo non-interactive; aplicando instalacion local en ~/.local/freejt7-desktop-rpm"
LOCAL_ROOT="$HOME/.local/freejt7-desktop-rpm"
rm -rf "$LOCAL_ROOT"
mkdir -p "$LOCAL_ROOT"

"$FREEJT7_RPM2CPIO_BIN" "$LATEST_RPM" | (cd "$LOCAL_ROOT" && cpio -idm --quiet)

mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/freejt7-desktop" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$LOCAL_ROOT/opt/freejt7-desktop/scripts/freejt7-desktop-launcher.sh" "\$@"
EOF
chmod 0755 "$HOME/.local/bin/freejt7-desktop"

cat > "$HOME/.local/bin/freejt7-desktop-rpm" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$HOME/.local/bin/freejt7-desktop" "\$@"
EOF
chmod 0755 "$HOME/.local/bin/freejt7-desktop-rpm"

echo "[freejt7-rpm-install] instalado localmente. Asegura ~/.local/bin en PATH y ejecuta: freejt7-desktop"
