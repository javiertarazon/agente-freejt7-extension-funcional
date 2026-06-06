#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_JSON="$ROOT_DIR/package.json"

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "[freejt7-deb] ERROR: dpkg-deb no disponible. Instala dpkg-dev/dpkg." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[freejt7-deb] ERROR: node no disponible en PATH." >&2
  exit 1
fi

VERSION="$(node -e "console.log(require(process.argv[1]).version)" "$PKG_JSON")"
DEB_VERSION="${VERSION}-1"
ARCH="$(dpkg --print-architecture 2>/dev/null || echo amd64)"

if [[ "$ARCH" != "amd64" ]]; then
  echo "[freejt7-deb] ERROR: Free JT7 Desktop solo soporta amd64/x64 por ahora (host=${ARCH})." >&2
  exit 1
fi

VSIX_PATH="$ROOT_DIR/agente-freejt7-extension-funcional-${VERSION}.vsix"
if [[ ! -f "$VSIX_PATH" ]]; then
  echo "[freejt7-deb] VSIX ${VSIX_PATH} no encontrada. Ejecutando npm run package:local..."
  (cd "$ROOT_DIR" && npm run package:local)
fi

if [[ ! -f "$VSIX_PATH" ]]; then
  echo "[freejt7-deb] ERROR: no se pudo generar la VSIX esperada ${VSIX_PATH}" >&2
  exit 1
fi

BUILD_ROOT="$ROOT_DIR/dist-deb"
PKG_ROOT="$BUILD_ROOT/freejt7-desktop_${DEB_VERSION}_${ARCH}"
DEBIAN_DIR="$PKG_ROOT/DEBIAN"
APP_DIR="$PKG_ROOT/opt/freejt7-desktop"
BIN_DIR="$PKG_ROOT/usr/bin"
DESKTOP_DIR="$PKG_ROOT/usr/share/applications"
BUNDLED_RUNTIME_SOURCE="${FREEJT7_VSCODIUM_RUNTIME_DIR:-$HOME/.freejt7-app/runtime/vscodium/current}"

rm -rf "$PKG_ROOT"
mkdir -p "$DEBIAN_DIR" "$APP_DIR/scripts" "$BIN_DIR" "$DESKTOP_DIR"

cat > "$DEBIAN_DIR/control" <<EOF
Package: freejt7-desktop
Version: ${DEB_VERSION}
Section: editors
Priority: optional
Architecture: ${ARCH}
Maintainer: Free JT7 Team <noreply@freejt7.local>
Depends: nodejs (>= 20), ca-certificates, tar
Description: Free JT7 Desktop standalone app launcher
 Free JT7 Desktop instala y ejecuta un entorno aislado del agente Free JT7
 con perfil propio, VSIX propia y runtime VSCodium portable.
EOF

cat > "$DEBIAN_DIR/postinst" <<'EOF'
#!/usr/bin/env bash
set -e
echo "[freejt7-desktop] Instalado. Ejecuta: freejt7-desktop --no-launch"
EOF
chmod 0755 "$DEBIAN_DIR/postinst"

cat > "$APP_DIR/scripts/freejt7-desktop-launcher.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="${NODE_BIN:-node}"

if [[ -n "${FREEJT7_APP_ROOT:-}" ]]; then
  APP_ROOT="$FREEJT7_APP_ROOT"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  RELATIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [[ -f "$RELATIVE_ROOT/scripts/freejt7-own-ide-bootstrap.js" ]]; then
    APP_ROOT="$RELATIVE_ROOT"
  elif [[ -f "/opt/freejt7-desktop/scripts/freejt7-own-ide-bootstrap.js" ]]; then
    APP_ROOT="/opt/freejt7-desktop"
  else
    echo "[freejt7-desktop] ERROR: no se pudo resolver APP_ROOT." >&2
    exit 1
  fi
fi

if ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  echo "[freejt7-desktop] ERROR: no se encontro node en PATH." >&2
  exit 1
fi

WORKSPACE="${FREEJT7_WORKSPACE:-$PWD}"
BUNDLED_IDE="$APP_ROOT/runtime/vscodium/current/bin/codium"

EXTRA_ARGS=()
if [[ -x "$BUNDLED_IDE" ]]; then
  EXTRA_ARGS+=("--ide-bin=$BUNDLED_IDE")
fi

exec "$NODE_BIN" "$APP_ROOT/scripts/freejt7-own-ide-bootstrap.js" \
  --repo-root="$APP_ROOT" \
  --workspace="$WORKSPACE" \
  "${EXTRA_ARGS[@]}" \
  "$@"
EOF
chmod 0755 "$APP_DIR/scripts/freejt7-desktop-launcher.sh"

cat > "$BIN_DIR/freejt7-desktop" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec /opt/freejt7-desktop/scripts/freejt7-desktop-launcher.sh "$@"
EOF
chmod 0755 "$BIN_DIR/freejt7-desktop"

cat > "$DESKTOP_DIR/freejt7-desktop.desktop" <<'EOF'
[Desktop Entry]
Name=Free JT7 Desktop
Comment=Agente Free JT7 en perfil aislado
Exec=freejt7-desktop
TryExec=freejt7-desktop
Terminal=false
Type=Application
Categories=Development;IDE;
StartupNotify=true
EOF

cp "$ROOT_DIR/package.json" "$APP_DIR/package.json"
cp "$ROOT_DIR/README.md" "$APP_DIR/README.md"
cp "$VSIX_PATH" "$APP_DIR/"
cp "$ROOT_DIR/scripts/freejt7-app-bootstrap.js" "$APP_DIR/scripts/freejt7-app-bootstrap.js"
cp "$ROOT_DIR/scripts/freejt7-owned-control-plane.js" "$APP_DIR/scripts/freejt7-owned-control-plane.js"
cp "$ROOT_DIR/scripts/freejt7-own-ide-bootstrap.js" "$APP_DIR/scripts/freejt7-own-ide-bootstrap.js"
cp "$ROOT_DIR/scripts/freejt7-vscodium-linux-x64.json" "$APP_DIR/scripts/freejt7-vscodium-linux-x64.json"
chmod 0755 "$APP_DIR/scripts/freejt7-app-bootstrap.js" "$APP_DIR/scripts/freejt7-own-ide-bootstrap.js"
if [[ -d "$BUNDLED_RUNTIME_SOURCE" ]]; then
  mkdir -p "$APP_DIR/runtime/vscodium"
  cp -a "$BUNDLED_RUNTIME_SOURCE" "$APP_DIR/runtime/vscodium/current"
else
  echo "[freejt7-deb] WARN: no se encontro runtime VSCodium local en $BUNDLED_RUNTIME_SOURCE; el launcher quedara en modo descarga/cache." >&2
fi

OUTPUT_DEB="$BUILD_ROOT/freejt7-desktop_${DEB_VERSION}_${ARCH}.deb"
dpkg-deb --root-owner-group --build "$PKG_ROOT" "$OUTPUT_DEB" >/dev/null

echo "[freejt7-deb] OK => $OUTPUT_DEB"
