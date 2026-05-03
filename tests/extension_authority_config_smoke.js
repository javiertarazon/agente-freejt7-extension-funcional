'use strict';

const assert = require('assert');

const { getEffectiveAgentAuthorityConfig } = require('../src-js/core/extension.runtime.js');

function main() {
  const authority = getEffectiveAgentAuthorityConfig();
  assert.ok(authority && typeof authority === 'object', 'debe exponer snapshot de autoridad del agente');
  assert.ok(authority.provider, 'debe incluir provider efectivo');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'runtimeBackend'), 'debe incluir runtimeBackend');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'policyProfile'), 'debe incluir policyProfile');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'policyMode'), 'debe incluir policyMode');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'workerPoolSize'), 'debe incluir workerPoolSize');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'authProfile'), 'debe incluir authProfile');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'ownerMode'), 'debe incluir ownerMode');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'hostVisibility'), 'debe incluir hostVisibility');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'openOnStartup'), 'debe incluir openOnStartup');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'productMode'), 'debe incluir productMode');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'hostIntegration'), 'debe incluir hostIntegration');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'primarySurface'), 'debe incluir primarySurface');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'settingsAuthority'), 'debe incluir settingsAuthority');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'chatParticipantEnabled'), 'debe incluir chatParticipantEnabled');
  assert.ok(Object.prototype.hasOwnProperty.call(authority, 'hostAdapterMode'), 'debe incluir hostAdapterMode');

  console.log('extension_authority_config_smoke: ok');
}

main();
