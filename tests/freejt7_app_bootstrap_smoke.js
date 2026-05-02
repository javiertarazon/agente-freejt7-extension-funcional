'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  mergeStandaloneSettings,
  buildPaths,
  runBootstrap,
} = require('../scripts/freejt7-app-bootstrap.js');

function main() {
  const merged = mergeStandaloneSettings({
    'freejt7.apiProvider': 'copilot',
    'some.other.setting': true,
  });
  assert.equal(merged['freejt7.apiProvider'], 'openrouter');
  assert.equal(merged['freejt7.panel.enabled'], true);
  assert.equal(merged['freejt7.panel.chatParticipant.enabled'], false);
  assert.equal(merged['freejt7.panel.openOnStartup'], true);
  assert.equal(merged['freejt7.panel.policy.mode'], 'autonomous');
  assert.equal(merged['freejt7.panel.runtimeBackend'], 'freejt7-v2');
  assert.equal(merged['freejt7.ide.ownerMode'], 'agent');
  assert.equal(merged['freejt7.ide.hostVisibility'], 'minimal');
  assert.deepEqual(merged['github.copilot.enable'], { '*': false });

  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-app-smoke-'));
  const repoRoot = process.cwd();
  const fakeVsix = path.join(tempBase, 'fake-freejt7.vsix');
  fs.writeFileSync(fakeVsix, 'vsix-smoke\n', 'utf8');
  const paths = buildPaths(tempBase, 'smoke');
  fs.mkdirSync(path.dirname(paths.settingsPath), { recursive: true });
  fs.writeFileSync(paths.settingsPath, '{}\n', 'utf8');

  const result = runBootstrap({
    repoRoot,
    workspacePath: repoRoot,
    appHome: tempBase,
    profileName: 'smoke',
    ideBin: process.execPath,
    vsixPath: fakeVsix,
    skipInstall: true,
    launch: false,
    dryRun: true,
  });

  assert.ok(result.paths.settingsPath.endsWith(path.join('user-data', 'User', 'settings.json')));
  assert.ok(fs.existsSync(result.paths.settingsPath), 'Debe crear settings de perfil aislado');
  assert.ok(result.paths.controlPlanePath.endsWith('freejt7-owned-ide.json'));
  assert.ok(fs.existsSync(result.paths.controlPlanePath), 'Debe crear control-plane propio del perfil');

  const settings = JSON.parse(fs.readFileSync(result.paths.settingsPath, 'utf8'));
  const controlPlane = JSON.parse(fs.readFileSync(result.paths.controlPlanePath, 'utf8'));
  assert.equal(settings['freejt7.panel.enabled'], true);
  assert.equal(settings['freejt7.panel.chatParticipant.enabled'], false);
  assert.equal(settings['freejt7.panel.openOnStartup'], true);
  assert.equal(settings['freejt7.panel.policy.mode'], 'autonomous');
  assert.equal(settings['freejt7.panel.runtimeBackend'], 'freejt7-v2');
  assert.equal(settings['freejt7.autoRepairGlobalSettings'], false);
  assert.equal(settings['freejt7.autoInstallWorkspaceBridge'], false);
  assert.equal(settings['freejt7.ide.ownerMode'], 'agent');
  assert.equal(settings['freejt7.ide.hostVisibility'], 'minimal');
  assert.equal(settings['freejt7.app.standaloneMode'], true);
  assert.equal(settings['workbench.startupEditor'], 'none');
  assert.equal(controlPlane.mode, 'freejt7-owned-ide');
  assert.equal(controlPlane.ide.ownerMode, 'agent');
  assert.equal(controlPlane.ide.hostVisibility, 'minimal');
  assert.equal(controlPlane.ide.openOnStartup, true);
  assert.equal(controlPlane.runtime.runtimeBackend, 'freejt7-v2');
  assert.equal(controlPlane.runtime.policyMode, 'autonomous');
  assert.equal(controlPlane.provider.activeProvider, 'openrouter');

  console.log('freejt7_app_bootstrap_smoke: ok');
}

main();
