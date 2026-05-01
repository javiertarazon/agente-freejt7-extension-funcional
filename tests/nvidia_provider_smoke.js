'use strict';

const assert = require('assert');

const {
  getApiKey,
  getFreeModelsCatalog,
  getFreeModelDefault,
} = require('../src-js/core/api-provider-adapter');

function createSecretStorage(values) {
  const store = new Map(Object.entries(values || {}));
  return {
    async get(key) {
      return store.get(key);
    },
  };
}

async function main() {
  const catalog = getFreeModelsCatalog('nvidia');
  assert.equal(Array.isArray(catalog), true, 'NVIDIA debe exponer catálogo base');
  assert.equal(catalog.length, 4, 'NVIDIA debe listar los 4 modelos iniciales');
  assert.equal(getFreeModelDefault('nvidia'), 'deepseek-ai/deepseek-v4-pro');

  const secrets = createSecretStorage({
    'freejt7.apiKey.nvidia.deepseek.ai.deepseek.v4.pro': 'nv-model-key',
    'freejt7.apiKey.nvidia': 'nv-provider-key',
  });
  const scoped = await getApiKey('nvidia', secrets, {
    model: 'deepseek-ai/deepseek-v4-pro',
  });
  assert.equal(scoped, 'nv-model-key', 'debe priorizar API key por modelo para NVIDIA');

  const fallback = await getApiKey('nvidia', createSecretStorage({
    'freejt7.apiKey.nvidia': 'nv-provider-key',
  }), {
    model: 'z-ai/glm-5.1',
  });
  assert.equal(fallback, 'nv-provider-key', 'debe mantener fallback compatible por proveedor cuando no exista key del modelo');

  console.log('nvidia_provider_smoke: OK');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
