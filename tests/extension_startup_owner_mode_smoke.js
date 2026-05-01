'use strict';

const assert = require('assert');

const { shouldAutoOpenControlPanel } = require('../src-js/core/extension.runtime.js');

function fakeConfig(values = {}) {
  return {
    get(key, fallback) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback;
    },
  };
}

function main() {
  assert.equal(
    shouldAutoOpenControlPanel(fakeConfig({
      'panel.enabled': true,
      'panel.openOnStartup': true,
      'ide.ownerMode': 'agent',
    }), { standaloneMode: false }),
    true,
    'ownerMode=agent debe abrir el panel al arranque',
  );

  assert.equal(
    shouldAutoOpenControlPanel(fakeConfig({
      'panel.enabled': true,
      'panel.openOnStartup': false,
      'ide.ownerMode': 'agent',
    }), { standaloneMode: true }),
    false,
    'si openOnStartup está desactivado no debe autoabrirse aunque sea standalone',
  );

  assert.equal(
    shouldAutoOpenControlPanel(fakeConfig({
      'panel.enabled': true,
      'panel.openOnStartup': true,
      'ide.ownerMode': 'mixed',
    }), { standaloneMode: true }),
    true,
    'standalone own-ide debe abrir el panel incluso en modo mixed',
  );

  assert.equal(
    shouldAutoOpenControlPanel(fakeConfig({
      'panel.enabled': false,
      'panel.openOnStartup': true,
      'ide.ownerMode': 'agent',
    }), { standaloneMode: true }),
    false,
    'si el panel está deshabilitado no debe autoabrirse',
  );

  console.log('extension_startup_owner_mode_smoke: ok');
}

main();
