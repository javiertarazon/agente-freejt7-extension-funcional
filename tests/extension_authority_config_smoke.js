'use strict';

const assert = require('assert');

const { getEffectiveAgentAuthorityConfig } = require('../src-js/core/extension.runtime.js');

function main() {
  const authority = getEffectiveAgentAuthorityConfig();
  assert.ok(authority && typeof authority === 'object', 'debe exponer snapshot de autoridad del agente');
  assert.ok(authority.provider, 'debe incluir provider efectivo');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'runtimeBackend'), 'debe incluir runtimeBackend');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'policyProfile'), 'debe incluir policyProfile');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'authProfile'), 'debe incluir authProfile');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'ownerMode'), 'debe incluir ownerMode');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'hostVisibility'), 'debe incluir hostVisibility');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'openOnStartup'), 'debe incluir openOnStartup');

  console.log('extension_authority_config_smoke: ok');
}

main();
