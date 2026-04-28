#!/usr/bin/env bash
set -euo pipefail

freejt7_rpm_setup_toolchain() {
  if command -v rpmbuild >/dev/null 2>&1 && command -v rpm >/dev/null 2>&1 && command -v rpm2cpio >/dev/null 2>&1; then
    FREEJT7_RPMBUILD_BIN="$(command -v rpmbuild)"
    FREEJT7_RPM_BIN="$(command -v rpm)"
    FREEJT7_RPM2CPIO_BIN="$(command -v rpm2cpio)"
    if [[ -d "/usr/lib/rpm" ]]; then
      FREEJT7_RPM_CONFIGDIR="/usr/lib/rpm"
      export FREEJT7_RPM_CONFIGDIR RPM_CONFIGDIR="$FREEJT7_RPM_CONFIGDIR"
    fi
    export FREEJT7_RPMBUILD_BIN FREEJT7_RPM_BIN FREEJT7_RPM2CPIO_BIN
    return 0
  fi

  if ! command -v apt >/dev/null 2>&1 || ! command -v dpkg-deb >/dev/null 2>&1; then
    echo "[freejt7-rpm-tools] ERROR: no hay rpmbuild del sistema ni toolchain apt local disponible." >&2
    return 1
  fi

  local toolroot="${FREEJT7_RPM_TOOLROOT:-$HOME/.freejt7-app/runtime/rpm-tools}"
  local pkgdir="$toolroot/pkgs"
  local rootfs="$toolroot/rootfs"
  local marker="$toolroot/.bootstrap-complete"
  local lockdir="$toolroot/.bootstrap.lock"

  mkdir -p "$pkgdir" "$rootfs"

  local packages=(
    rpm
    rpm-common
    rpm2cpio
    debugedit
    librpm9t64
    librpmbuild9t64
    librpmio9t64
    librpmsign9t64
    liblua5.3-0
  )

  local wait_count=0
  while ! mkdir "$lockdir" 2>/dev/null; do
    wait_count=$((wait_count + 1))
    if [[ "$wait_count" -gt 300 ]]; then
      echo "[freejt7-rpm-tools] ERROR: timeout esperando lock de bootstrap." >&2
      return 1
    fi
    sleep 0.2
  done
  trap 'rmdir "$lockdir" >/dev/null 2>&1 || true' RETURN

  freejt7_rpm_bootstrap_now() {
    local tempfs="$toolroot/rootfs.new.$$"
    rm -rf "$tempfs"
    mkdir -p "$tempfs"
    (
      cd "$pkgdir"
      apt download "${packages[@]}"
    )

    local deb
    for deb in "$pkgdir"/*.deb; do
      dpkg-deb -x "$deb" "$tempfs"
    done
    rm -rf "$rootfs"
    mv "$tempfs" "$rootfs"
    touch "$marker"
  }

  if [[ ! -f "$marker" ]]; then
    freejt7_rpm_bootstrap_now
  fi

  export PATH="$rootfs/usr/bin:$PATH"
  export LD_LIBRARY_PATH="$rootfs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
  export FREEJT7_RPM_CONFIGDIR="$rootfs/usr/lib/rpm"
  export RPM_CONFIGDIR="$FREEJT7_RPM_CONFIGDIR"

  if ! command -v rpmbuild >/dev/null 2>&1 || ! command -v rpm >/dev/null 2>&1 || ! command -v rpm2cpio >/dev/null 2>&1; then
    rm -f "$marker"
    freejt7_rpm_bootstrap_now
    export PATH="$rootfs/usr/bin:$PATH"
    export LD_LIBRARY_PATH="$rootfs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
    export FREEJT7_RPM_CONFIGDIR="$rootfs/usr/lib/rpm"
    export RPM_CONFIGDIR="$FREEJT7_RPM_CONFIGDIR"
  fi

  if ! command -v rpmbuild >/dev/null 2>&1 || ! command -v rpm >/dev/null 2>&1 || ! command -v rpm2cpio >/dev/null 2>&1; then
    echo "[freejt7-rpm-tools] ERROR: toolchain local incompleta tras bootstrap." >&2
    return 1
  fi

  FREEJT7_RPMBUILD_BIN="$(command -v rpmbuild)"
  FREEJT7_RPM_BIN="$(command -v rpm)"
  FREEJT7_RPM2CPIO_BIN="$(command -v rpm2cpio)"
  export FREEJT7_RPMBUILD_BIN FREEJT7_RPM_BIN FREEJT7_RPM2CPIO_BIN FREEJT7_RPM_CONFIGDIR
}
