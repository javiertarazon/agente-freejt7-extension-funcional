'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function latestDeb(distDir) {
  if (!fs.existsSync(distDir)) return '';
  const entries = fs.readdirSync(distDir)
    .filter((name) => /^freejt7-desktop_.*\.deb$/i.test(name))
    .map((name) => path.join(distDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] || '';
}

function main() {
  const root = process.cwd();
  const buildScript = path.join(root, 'scripts', 'build-freejt7-desktop-deb.sh');
  assert.ok(fs.existsSync(buildScript), 'Debe existir script de build .deb');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const vsixPath = path.join(root, `agente-freejt7-extension-funcional-${pkg.version}.vsix`);
  assert.ok(fs.existsSync(vsixPath), 'Debe existir la VSIX base del release actual');

  const deb = latestDeb(path.join(root, 'dist-deb'));
  if (deb) {
    const stats = fs.statSync(deb);
    assert.ok(stats.size > 0, 'El .deb generado no puede estar vacío');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-deb-smoke-'));
    const unpack = spawnSync('dpkg-deb', ['-x', deb, tempDir], { encoding: 'utf8' });
    assert.equal(unpack.status, 0, `dpkg-deb -x debe funcionar: ${unpack.stderr || unpack.stdout}`);
    const embeddedVsix = path.join(tempDir, 'opt', 'freejt7-desktop', path.basename(vsixPath));
    const desktopEntry = path.join(tempDir, 'usr', 'share', 'applications', 'freejt7-desktop.desktop');
    const bundledIde = path.join(tempDir, 'opt', 'freejt7-desktop', 'runtime', 'vscodium', 'current', 'bin', 'codium');
    const launcherPath = path.join(tempDir, 'opt', 'freejt7-desktop', 'scripts', 'freejt7-desktop-launcher.sh');
    const runtimePinPath = path.join(tempDir, 'opt', 'freejt7-desktop', 'scripts', 'freejt7-vscodium-linux-x64.json');
    assert.ok(fs.existsSync(embeddedVsix), 'El .deb debe incluir la VSIX del release');
    assert.ok(fs.existsSync(desktopEntry), 'El .deb debe incluir el desktop entry');
    assert.ok(fs.existsSync(launcherPath), 'El .deb debe incluir el launcher propio');
    assert.ok(fs.existsSync(runtimePinPath), 'El .deb debe incluir el pin del runtime VSCodium');
    assert.ok(fs.existsSync(bundledIde), 'El .deb debe incluir runtime VSCodium embebido');
    const desktopText = fs.readFileSync(desktopEntry, 'utf8');
    const launcherText = fs.readFileSync(launcherPath, 'utf8');
    const runtimePin = JSON.parse(fs.readFileSync(runtimePinPath, 'utf8'));
    assert.ok(desktopText.includes('Exec=freejt7-desktop'));
    assert.ok(desktopText.includes('TryExec=freejt7-desktop'));
    assert.ok(launcherText.includes('--ide-bin=$BUNDLED_IDE'));
    assert.ok(/^[a-f0-9]{64}$/i.test(String(runtimePin.sha256 || '')));
    const rootSha = crypto.createHash('sha256').update(fs.readFileSync(vsixPath)).digest('hex');
    const embeddedSha = crypto.createHash('sha256').update(fs.readFileSync(embeddedVsix)).digest('hex');
    assert.equal(embeddedSha, rootSha, 'La VSIX embebida en el .deb debe coincidir con la VSIX actual del release');
  }

  console.log('freejt7_deb_package_smoke: ok');
}

main();
