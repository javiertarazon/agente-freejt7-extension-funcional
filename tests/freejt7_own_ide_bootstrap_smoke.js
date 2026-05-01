'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const {
  pickLinuxX64Asset,
  inferVersionFromAsset,
  ensureSupportedOwnIdePlatform,
  readPinnedOwnIdeRuntime,
  verifyFileSha256,
} = require('../scripts/freejt7-own-ide-bootstrap.js');

function main() {
  const fakeRelease = {
    tag_name: '1.99.33120',
    assets: [
      { name: 'something-else.zip', browser_download_url: 'https://example.invalid/else.zip' },
      { name: 'VSCodium-linux-x64-1.99.33120.tar.gz', browser_download_url: 'https://example.invalid/codium.tgz' },
      { name: 'VSCodium-linux-x64-1.99.33120.AppImage', browser_download_url: 'https://example.invalid/codium.appimage' },
    ],
  };

  const selected = pickLinuxX64Asset(fakeRelease);
  assert.ok(selected, 'Debe seleccionar un asset Linux x64');
  assert.equal(selected.name, 'VSCodium-linux-x64-1.99.33120.tar.gz');
  assert.equal(inferVersionFromAsset(selected.name, fakeRelease.tag_name), '1.99.33120');
  assert.equal(inferVersionFromAsset('VSCodium-linux-x64-rolling.AppImage', 'v1.1.1'), 'rolling');
  assert.equal(inferVersionFromAsset('invalid-file', 'v1.2.3'), '1.2.3');
  assert.doesNotThrow(() => ensureSupportedOwnIdePlatform());

  const runtimePin = readPinnedOwnIdeRuntime();
  assert.equal(runtimePin.assetName, 'VSCodium-linux-x64-1.116.02821.tar.gz');
  assert.equal(runtimePin.releaseTag, '1.116.02821');
  assert.match(runtimePin.sha256, /^[a-f0-9]{64}$/);

  const tempFile = path.join(os.tmpdir(), `freejt7-sha256-${process.pid}.txt`);
  fs.writeFileSync(tempFile, 'freejt7 checksum smoke', 'utf8');
  const expectedSha = crypto.createHash('sha256').update(fs.readFileSync(tempFile)).digest('hex');
  assert.equal(verifyFileSha256(tempFile, expectedSha), true);
  assert.equal(verifyFileSha256(tempFile, '0'.repeat(64)), false);
  fs.rmSync(tempFile, { force: true });

  console.log('freejt7_own_ide_bootstrap_smoke: ok');
}

main();
