'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getOwnIdeRoot() {
  return path.join(os.homedir(), '.freejt7-app', 'profiles', 'own-ide');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const profileRoot = getOwnIdeRoot();
  const settingsPath = path.join(profileRoot, 'user-data', 'User', 'settings.json');
  assert.ok(fs.existsSync(settingsPath), 'Debe existir settings.json del perfil own-ide');
  const settings = readJson(settingsPath);
  assert.equal(settings['freejt7.panel.runtimeBackend'], 'freejt7-v2');
  assert.equal(settings['freejt7.app.standaloneMode'], true);
  assert.equal(settings['freejt7.ide.ownerMode'], 'agent');

  const extensionRoot = path.join(profileRoot, 'extensions', 'javiertarazon.agente-freejt7-extension-funcional-4.2.11');
  assert.ok(fs.existsSync(extensionRoot), 'Debe existir la extension instalada en own-ide');

  const bundlePath = path.join(extensionRoot, 'dist', 'extension.cjs');
  const packageJsonPath = path.join(extensionRoot, 'package.json');
  assert.ok(fs.existsSync(bundlePath), 'La extension instalada en own-ide debe contener dist/extension.cjs');
  assert.ok(fs.existsSync(packageJsonPath), 'La extension instalada en own-ide debe contener package.json');

  const installedPkg = readJson(packageJsonPath);
  assert.equal(installedPkg.version, '4.2.11');
  assert.equal(installedPkg.contributes.configuration.properties['freejt7.panel.runtimeBackend'].default, 'freejt7-v2');

  const bundle = fs.readFileSync(bundlePath, 'utf8');
  for (const marker of [
    'freejt7-agent-core-v2',
    'subagent_run',
    'executeSubagentRun',
    'spawnSubagent',
    'session.spawnSubagent',
    'freejt7-v2',
  ]) {
    assert.ok(bundle.includes(marker), `El bundle own-ide debe incluir ${marker}`);
  }

  console.log('own_ide_installed_extension_smoke: ok');
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}
