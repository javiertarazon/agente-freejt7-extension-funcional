'use strict';

const assert = require('assert');

const adapterPath = require.resolve('../src-js/providers/api-provider-adapter.js');
const routerPath = require.resolve('../src-js/core/provider-router.js');
const originalAdapter = require.cache[adapterPath];
const originalRouter = require.cache[routerPath];

const directCalls = [];
let agentCalls = 0;

require.cache[adapterPath] = {
  id: adapterPath,
  filename: adapterPath,
  loaded: true,
  exports: {
    callProvider: async (request, config) => {
      directCalls.push({ request, config });
      return {
        run: { summary: 'direct ok' },
        final: { summary: 'direct ok' },
      };
    },
  },
};

delete require.cache[routerPath];
const { ProviderRouter } = require('../src-js/core/provider-router.js');

async function main() {
  const router = new ProviderRouter({
    executeAgentTask: async () => {
      agentCalls += 1;
      return {
        run: { summary: 'agent ok' },
        final: { summary: 'agent ok' },
      };
    },
  });

  // El modo direct ya no está permitido, siempre se fuerza agent
  const direct = await router.execute({
    goal: 'responde directo',
    provider: 'clod',
    model: 'OpenAI/gpt-oss-20B',
    executionMode: 'direct',
  }, {
    workspacePath: process.cwd(),
  });

  assert.equal(direct.executionMode, 'agent');
  assert.equal(agentCalls, 1, 'modo direct ahora invoca agente');
  assert.equal(directCalls.length, 0, 'modo direct ya no debe llamar proveedor directo');

  const copilot = await router.execute({
    goal: 'aunque pidan direct, copilot debe ir por agente',
    provider: 'copilot',
    executionMode: 'direct',
  }, {
    workspacePath: process.cwd(),
  });
  assert.equal(copilot.executionMode, 'agent');
  assert.equal(agentCalls, 2, 'copilot debe conservar ruta agente');
  assert.equal(directCalls.length, 0, 'copilot no debe llamar proveedor directo');

  console.log('provider_direct_mode_smoke: OK');
}

main()
  .catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    if (originalAdapter) {
      require.cache[adapterPath] = originalAdapter;
    } else {
      delete require.cache[adapterPath];
    }
    if (originalRouter) {
      require.cache[routerPath] = originalRouter;
    } else {
      delete require.cache[routerPath];
    }
  });
