'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function latestRpm(distDir) {
  if (!fs.existsSync(distDir)) return '';
  const entries = fs.readdirSync(distDir)
    .filter((name) => /^freejt7-desktop_.*\.rpm$/i.test(name))
    .map((name) => path.join(distDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] || '';
}

function main() {
  const root = process.cwd();
  const buildScript = path.join(root, 'scripts', 'build-freejt7-desktop-rpm.sh');
  const installScript = path.join(root, 'scripts', 'install-freejt7-desktop-rpm.sh');
  const toolchainScript = path.join(root, 'scripts', 'ensure-rpm-toolchain.sh');

  assert.ok(fs.existsSync(buildScript), 'Debe existir script de build .rpm');
  assert.ok(fs.existsSync(installScript), 'Debe existir script de install .rpm');
  assert.ok(fs.existsSync(toolchainScript), 'Debe existir helper de toolchain rpm');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const vsixPath = path.join(root, `agente-freejt7-extension-funcional-${pkg.version}.vsix`);
  assert.ok(fs.existsSync(vsixPath), 'Debe existir la VSIX base del release actual');

  const rpm = latestRpm(path.join(root, 'dist-rpm'));
  if (rpm) {
    const stats = fs.statSync(rpm);
    assert.ok(stats.size > 0, 'El .rpm generado no puede estar vacío');
    assert.ok(/_x86_64\.rpm$/i.test(path.basename(rpm)), 'El nombre del RPM debe reflejar arquitectura x86_64');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-rpm-smoke-'));
    const extract = spawnSync(
      'bash',
      ['-lc', `source "${path.join(root, 'scripts', 'ensure-rpm-toolchain.sh')}" && freejt7_rpm_setup_toolchain >/dev/null && "$FREEJT7_RPM2CPIO_BIN" "${rpm}" | (cd "${tempDir}" && "$(command -v cpio)" -idm --quiet)`],
      { encoding: 'utf8' },
    );
    assert.equal(extract.status, 0, `rpm2cpio|cpio debe funcionar: ${extract.stderr || extract.stdout}`);
    const embeddedVsix = path.join(tempDir, 'opt', 'freejt7-desktop', path.basename(vsixPath));
    const desktopEntry = path.join(tempDir, 'usr', 'share', 'applications', 'freejt7-desktop.desktop');
    const bundledIde = path.join(tempDir, 'opt', 'freejt7-desktop', 'runtime', 'vscodium', 'current', 'bin', 'codium');
    const launcherPath = path.join(tempDir, 'opt', 'freejt7-desktop', 'scripts', 'freejt7-desktop-launcher.sh');
    const runtimePinPath = path.join(tempDir, 'opt', 'freejt7-desktop', 'scripts', 'freejt7-vscodium-linux-x64.json');
    assert.ok(fs.existsSync(embeddedVsix), 'El .rpm debe incluir la VSIX del release');
    assert.ok(fs.existsSync(desktopEntry), 'El .rpm debe incluir el desktop entry');
    assert.ok(fs.existsSync(launcherPath), 'El .rpm debe incluir el launcher propio');
    assert.ok(fs.existsSync(runtimePinPath), 'El .rpm debe incluir el pin del runtime VSCodium');
    assert.ok(fs.existsSync(bundledIde), 'El .rpm debe incluir runtime VSCodium embebido');
    const desktopText = fs.readFileSync(desktopEntry, 'utf8');
    const launcherText = fs.readFileSync(launcherPath, 'utf8');
    const runtimePin = JSON.parse(fs.readFileSync(runtimePinPath, 'utf8'));
    assert.ok(desktopText.includes('Exec=freejt7-desktop'));
    assert.ok(desktopText.includes('TryExec=freejt7-desktop'));
    assert.ok(launcherText.includes('--ide-bin=$BUNDLED_IDE'));
    assert.ok(/^[a-f0-9]{64}$/i.test(String(runtimePin.sha256 || '')));
    const rootSha = crypto.createHash('sha256').update(fs.readFileSync(vsixPath)).digest('hex');
    const embeddedSha = crypto.createHash('sha256').update(fs.readFileSync(embeddedVsix)).digest('hex');
    assert.equal(embeddedSha, rootSha, 'La VSIX embebida en el .rpm debe coincidir con la VSIX actual del release');
  }

  console.log('freejt7_rpm_package_smoke: ok');
}

main();
