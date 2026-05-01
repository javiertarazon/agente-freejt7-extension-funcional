// Smoke test: el panel distingue modo agente vs modo proveedor directo
// Ejecutar: node tests/panel_execution_mode_smoke.js

'use strict';

const assert = require('assert');

const adapterPath = require.resolve('../src-js/providers/api-provider-adapter.js');
const providerRouterPath = require.resolve('../src-js/core/provider-router.js');

const originalAdapterModule = require.cache[adapterPath];
const originalRouterModule = require.cache[providerRouterPath];

let directCalls = [];
let agentCalls = [];

require.cache[adapterPath] = {
  id: adapterPath,
  filename: adapterPath,
  loaded: true,
  exports: {
    callProvider: async (goal, config) => {
      directCalls.push({ goal, config });
      return {
        run: { summary: 'respuesta directa' },
        final: { summary: 'respuesta directa' },
      };
    },
  },
};

delete require.cache[providerRouterPath];
const { ProviderRouter } = require('../src-js/core/provider-router.js');

async function main() {
  const router = new ProviderRouter({
    executeAgentTask: async (goal, taskContext) => {
      agentCalls.push({ goal, taskContext });
      return {
        run: { summary: 'ejecucion real del agente' },
        final: { summary: 'ejecucion real del agente' },
      };
    },
  });

  const agentResult = await router.execute({
    goal: 'Analiza el workspace y aplica el fix.',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    executionMode: 'agent',
  }, {
    workspacePath: process.cwd(),
    sessionTitle: 'Sesion demo',
  });

  assert.strictEqual(agentCalls.length, 1, 'modo agente debe usar executeAgentTask');
  assert.strictEqual(directCalls.length, 0, 'modo agente no debe llamar al proveedor directo');
  assert.strictEqual(agentResult.provider, 'openrouter', 'modo agente debe reflejar el proveedor externo real del panel');
  assert.strictEqual(agentResult.executionMode, 'agent', 'modo agente debe preservarse');

  // El modo direct ya no está permitido, siempre se fuerza agent
  const directResult = await router.execute({
    goal: 'Responde solo con OK.',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    executionMode: 'direct',
  }, {
    workspacePath: process.cwd(),
  });

  assert.strictEqual(agentCalls.length, 2, 'modo direct ahora usa executeAgentTask');
  assert.strictEqual(directCalls.length, 0, 'modo direct ya no debe llamar al proveedor directo');
  assert.strictEqual(directResult.executionMode, 'agent', 'modo direct debe forzarse a agent');

  console.log('panel_execution_mode_smoke: OK');
}

main()
  .catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    if (originalAdapterModule) {
      require.cache[adapterPath] = originalAdapterModule;
    } else {
      delete require.cache[adapterPath];
    }
    if (originalRouterModule) {
      require.cache[providerRouterPath] = originalRouterModule;
    } else {
      delete require.cache[providerRouterPath];
    }
  });
