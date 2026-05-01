'use strict';

const assert = require('assert');

const adapterPath = require.resolve('../src-js/providers/api-provider-adapter.js');
const runtimePath = require.resolve('../src-js/core/extension.runtime.js');

const originalAdapter = require.cache[adapterPath];
const originalRuntime = require.cache[runtimePath];

require.cache[adapterPath] = {
  id: adapterPath,
  filename: adapterPath,
  loaded: true,
  exports: {
    callProvider: async (_request, config) => {
      if (config.provider === 'clod') {
        const error = new Error('HTTP 429 para el modelo moonshotai/Kimi-K2.5. Team quota exceeded');
        error.isRateLimitError = true;
        error.isRetryable = true;
        throw error;
      }
      return {
        run: { summary: `ok ${config.provider}` },
        final: { summary: `ok ${config.provider}` },
      };
    },
    getApiKey: async (provider) => {
      if (provider === 'ddeksee' || provider === 'clod') {
        return `key-${provider}`;
      }
      return null;
    },
    getFreeModelsCatalog: () => ({
      openrouter: [{ label: 'GPT OSS 20B', value: 'openai/gpt-oss-20b:free' }],
      hf: [{ label: 'Qwen Turbo', value: 'Qwen/Qwen2.5-7B-Instruct-Turbo' }],
      zai: [{ label: 'GLM Flash', value: 'glm-4.5-flash' }],
      ddeksee: [{ label: 'DeepSeek Chat', value: 'deepseek-chat' }],
      clod: [{ label: 'Kimi K2.5', value: 'moonshotai/Kimi-K2.5' }],
      copilot: [],
    }),
    getFreeModelDefault: (provider) => ({
      openrouter: 'openai/gpt-oss-20b:free',
      hf: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
      zai: 'glm-4.5-flash',
      ddeksee: 'deepseek-chat',
      clod: 'moonshotai/Kimi-K2.5',
      copilot: '',
    }[provider] || ''),
    getFreeModelDefaults: () => ({
      openrouter: 'openai/gpt-oss-20b:free',
      hf: 'Qwen/Qwen2.5-7B-Instruct-Turbo',
      zai: 'glm-4.5-flash',
      ddeksee: 'deepseek-chat',
      clod: 'moonshotai/Kimi-K2.5',
      copilot: '',
    }),
  },
};

delete require.cache[runtimePath];
const {
  runProviderDirectFallbackTask,
  resolveProviderFallbackChain,
} = require('../src-js/core/extension.runtime.js');

async function main() {
  const context = {
    extensionPath: process.cwd(),
    secrets: {},
  };
  const output = {
    appendLine() {},
  };

  const autoFallbacks = await resolveProviderFallbackChain(context, {
    provider: 'clod',
    model: 'moonshotai/Kimi-K2.5',
    authProfile: 'default',
    fallbackProviders: [],
    workspacePath: process.cwd(),
  });
  assert.deepStrictEqual(
    autoFallbacks,
    [{ provider: 'ddeksee', model: 'deepseek-chat' }],
    'debe proponer providers alternos con key configurada antes de degradar',
  );

  const result = await runProviderDirectFallbackTask(context, output, {
    goal: 'hola',
    provider: 'clod',
    model: 'moonshotai/Kimi-K2.5',
    authProfile: 'default',
    workspacePath: process.cwd(),
    fallbackProviders: autoFallbacks,
    fallbackReason: 'Free JT7 (clod/OpenClaw agent): 403 status code (no body).',
  });

  assert.equal(result.provider, 'ddeksee');
  assert.equal(result.model, 'deepseek-chat');
  assert.equal(result.executionRoute, 'provider-direct-fallback');
  assert.equal(Array.isArray(result.routeMeta.fallbackAttempts), true);
  assert.equal(result.routeMeta.fallbackAttempts.length, 2);
  assert.equal(result.routeMeta.fallbackAttempts[0].provider, 'clod');
  assert.equal(result.routeMeta.fallbackAttempts[0].ok, false);
  assert.equal(result.routeMeta.fallbackAttempts[1].provider, 'ddeksee');
  assert.equal(result.routeMeta.fallbackAttempts[1].ok, true);
  assert.match(
    result.final.verification.join('\n'),
    /cambio de clod\/moonshotai\/Kimi-K2\.5 a ddeksee\/deepseek-chat/i,
    'debe dejar trazado el cambio de provider en el fallback directo',
  );

  console.log('extension_runtime_provider_fallback_smoke: OK');
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
    if (originalRuntime) {
      require.cache[runtimePath] = originalRuntime;
    } else {
      delete require.cache[runtimePath];
    }
  });
