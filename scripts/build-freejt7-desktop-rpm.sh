#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_JSON="$ROOT_DIR/package.json"

# shellcheck source=./ensure-rpm-toolchain.sh
source "$ROOT_DIR/scripts/ensure-rpm-toolchain.sh"
freejt7_rpm_setup_toolchain

if ! command -v node >/dev/null 2>&1; then
  echo "[freejt7-rpm] ERROR: node no disponible en PATH." >&2
  exit 1
fi

VERSION="$(node -e "console.log(require(process.argv[1]).version)" "$PKG_JSON")"
RELEASE="1"
BUILD_ARCH="x86_64"
CHANGELOG_DATE="$(LC_ALL=C date +"%a %b %d %Y")"

if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "[freejt7-rpm] ERROR: Free JT7 Desktop solo soporta x86_64 por ahora (host=$(uname -m))." >&2
  exit 1
fi

VSIX_PATH="$ROOT_DIR/agente-freejt7-extension-funcional-${VERSION}.vsix"
if [[ ! -f "$VSIX_PATH" ]]; then
  echo "[freejt7-rpm] VSIX ${VSIX_PATH} no encontrada. Ejecutando npm run package:local..."
  (cd "$ROOT_DIR" && npm run package:local)
fi

if [[ ! -f "$VSIX_PATH" ]]; then
  echo "[freejt7-rpm] ERROR: no se pudo generar la VSIX esperada ${VSIX_PATH}" >&2
  exit 1
fi

BUILD_ROOT="$ROOT_DIR/dist-rpm"
RPM_TOP="${FREEJT7_RPM_TOPDIR:-$HOME/.freejt7-app/build/rpm}"
SOURCES_DIR="$RPM_TOP/SOURCES/freejt7-root"
SPECS_DIR="$RPM_TOP/SPECS"
RPMS_DIR="$RPM_TOP/RPMS"
SRPMS_DIR="$RPM_TOP/SRPMS"
BUILD_DIR="$RPM_TOP/BUILD"
BUILDROOT_DIR="$RPM_TOP/BUILDROOT"
SPEC_FILE="$SPECS_DIR/freejt7-desktop.spec"
BUNDLED_RUNTIME_SOURCE="${FREEJT7_VSCODIUM_RUNTIME_DIR:-$HOME/.freejt7-app/runtime/vscodium/current}"

rm -rf "$RPM_TOP"
mkdir -p "$SOURCES_DIR/opt/freejt7-desktop/scripts" "$SOURCES_DIR/usr/bin" "$SOURCES_DIR/usr/share/applications" "$SPECS_DIR" "$RPMS_DIR" "$SRPMS_DIR" "$BUILD_DIR" "$BUILDROOT_DIR"

cat > "$SOURCES_DIR/opt/freejt7-desktop/scripts/freejt7-desktop-launcher.sh" <<'EOF'
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
chmod 0755 "$SOURCES_DIR/opt/freejt7-desktop/scripts/freejt7-desktop-launcher.sh"

cat > "$SOURCES_DIR/usr/bin/freejt7-desktop" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec /opt/freejt7-desktop/scripts/freejt7-desktop-launcher.sh "$@"
EOF
chmod 0755 "$SOURCES_DIR/usr/bin/freejt7-desktop"

cat > "$SOURCES_DIR/usr/share/applications/freejt7-desktop.desktop" <<'EOF'
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
chmod 0644 "$SOURCES_DIR/usr/share/applications/freejt7-desktop.desktop"

cp "$ROOT_DIR/package.json" "$SOURCES_DIR/opt/freejt7-desktop/package.json"
cp "$ROOT_DIR/README.md" "$SOURCES_DIR/opt/freejt7-desktop/README.md"
cp "$VSIX_PATH" "$SOURCES_DIR/opt/freejt7-desktop/"
cp "$ROOT_DIR/scripts/freejt7-app-bootstrap.js" "$SOURCES_DIR/opt/freejt7-desktop/scripts/freejt7-app-bootstrap.js"
cp "$ROOT_DIR/scripts/freejt7-owned-control-plane.js" "$SOURCES_DIR/opt/freejt7-desktop/scripts/freejt7-owned-control-plane.js"
cp "$ROOT_DIR/scripts/freejt7-own-ide-bootstrap.js" "$SOURCES_DIR/opt/freejt7-desktop/scripts/freejt7-own-ide-bootstrap.js"
cp "$ROOT_DIR/scripts/freejt7-vscodium-linux-x64.json" "$SOURCES_DIR/opt/freejt7-desktop/scripts/freejt7-vscodium-linux-x64.json"
chmod 0755 "$SOURCES_DIR/opt/freejt7-desktop/scripts/freejt7-app-bootstrap.js" "$SOURCES_DIR/opt/freejt7-desktop/scripts/freejt7-own-ide-bootstrap.js"
if [[ -d "$BUNDLED_RUNTIME_SOURCE" ]]; then
  mkdir -p "$SOURCES_DIR/opt/freejt7-desktop/runtime/vscodium"
  cp -a "$BUNDLED_RUNTIME_SOURCE" "$SOURCES_DIR/opt/freejt7-desktop/runtime/vscodium/current"
else
  echo "[freejt7-rpm] WARN: no se encontro runtime VSCodium local en $BUNDLED_RUNTIME_SOURCE; el launcher quedara en modo descarga/cache." >&2
fi

cat > "$SPEC_FILE" <<EOF
%global debug_package %{nil}
%global _missing_build_ids_terminate_build 0
# El runtime VSCodium embebido incluye modulos nativos precompilados de upstream
# sin build-id ELF util para rpmbuild. Este spec no compila esos binarios; los
# empaqueta como payload vendor y no debe fallar por esa ausencia.
Name: freejt7-desktop
Version: ${VERSION}
Release: ${RELEASE}%{?dist}
Summary: Free JT7 Desktop standalone app launcher
License: MIT
URL: https://github.com/javiertarazon/agente-freejt7-extension-funcional
BuildArch: ${BUILD_ARCH}
Requires: nodejs >= 20

%description
Free JT7 Desktop instala y ejecuta un entorno aislado del agente Free JT7
con perfil propio, VSIX propia y runtime VSCodium portable.

%prep
# no-op

%build
# no-op

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}
cp -a %{_sourcedir}/freejt7-root/. %{buildroot}/

%files
%defattr(-,root,root,-)
/opt/freejt7-desktop
/usr/bin/freejt7-desktop
/usr/share/applications/freejt7-desktop.desktop

%post
echo "[freejt7-desktop] Instalado. Ejecuta: freejt7-desktop --no-launch"

%changelog
* ${CHANGELOG_DATE} Free JT7 Team <noreply@freejt7.local> - ${VERSION}-${RELEASE}
- Initial RPM package for Free JT7 Desktop standalone launcher.
EOF

"$FREEJT7_RPMBUILD_BIN" \
  --define "_topdir $RPM_TOP" \
  --define "__strip /bin/true" \
  --define "__objdump /bin/true" \
  -bb "$SPEC_FILE"

RPM_OUTPUT="$(ls -1 "$RPMS_DIR"/**/freejt7-desktop-"${VERSION}"-"${RELEASE}"*.rpm 2>/dev/null | head -n 1 || true)"
if [[ -z "${RPM_OUTPUT:-}" || ! -f "$RPM_OUTPUT" ]]; then
  RPM_OUTPUT="$(find "$RPMS_DIR" -type f -name "freejt7-desktop-${VERSION}-${RELEASE}*.rpm" | head -n 1 || true)"
fi

if [[ -z "${RPM_OUTPUT:-}" || ! -f "$RPM_OUTPUT" ]]; then
  echo "[freejt7-rpm] ERROR: rpmbuild no produjo el RPM esperado." >&2
  exit 1
fi

FINAL_RPM="$BUILD_ROOT/freejt7-desktop_${VERSION}-${RELEASE}_${BUILD_ARCH}.rpm"
cp "$RPM_OUTPUT" "$FINAL_RPM"

echo "[freejt7-rpm] OK => $FINAL_RPM"
