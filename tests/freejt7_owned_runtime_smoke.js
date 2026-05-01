'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createFreeJt7OwnedRuntime } = require('../src-js/core/freejt7-owned-runtime');
const {
  executeLocalActions,
  deriveLocalActions,
  listWorkspace,
  readPackageSummary,
} = require('../src-js/core/local-agent-runtime');

async function main() {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-owned-runtime-'));
  fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
    name: 'owned-runtime-smoke',
    version: '1.0.0',
    scripts: {
      build: 'node --version',
    },
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(workspacePath, 'README.md'), '# Demo\n\ncontenido inicial\n', 'utf8');

  const calls = [];
  const runtime = createFreeJt7OwnedRuntime({
    callProvider: async (goal, config) => {
      calls.push({ goal, config });
      const callIndex = calls.length;
      if (callIndex === 1) {
        return {
          final: {
            summary: 'No es JSON todavia, pero quiero leer README.md primero.',
          },
        };
      }
      if (callIndex === 2) {
        return {
          final: {
            summary: JSON.stringify({
              status: 'needs_action',
              summary: 'Necesito inspeccionar el README antes de responder.',
              reasoning: 'Primero leo el contexto del proyecto.',
              actions: [
                { type: 'read', path: 'README.md' },
              ],
            }),
          },
        };
      }
      if (callIndex === 3) {
        return {
          final: {
            summary: JSON.stringify({
              status: 'needs_action',
              summary: 'Voy a crear un archivo de salida verificado.',
              reasoning: 'Ya lei el README y ahora puedo crear el artefacto pedido.',
              actions: [
                { type: 'write', path: 'out/result.md', content: '# Resultado\n\nok\n' },
              ],
            }),
          },
        };
      }
      return {
        final: {
          summary: JSON.stringify({
            status: 'completed',
            summary: 'Revise el README y deje `out/result.md` creado y verificado.',
            reasoning: 'La tarea ya quedo respaldada por lecturas y escritura verificada.',
            actions: [],
          }),
        },
      };
    },
    executeLocalActions,
    deriveLocalActions,
    listWorkspace,
    readPackageSummary,
  });

  const result = await runtime.executeTask({ secrets: {} }, { appendLine() {} }, {
    goal: 'Analiza el README y deja un archivo de resultado.',
    workspacePath,
    provider: 'ddeksee',
    model: 'deepseek-chat',
    authProfile: 'default',
  });

  assert.equal(result.executionRoute, 'freejt7-owned-agent');
  assert.ok(result.final.summary.includes('out/result.md'));
  assert.equal(fs.existsSync(path.join(workspacePath, 'out', 'result.md')), true);
  assert.equal(fs.readFileSync(path.join(workspacePath, 'out', 'result.md'), 'utf8'), '# Resultado\n\nok\n');
  assert.ok(result.final.verification.some((item) => item.includes('OwnedRuntime: escritura out/result.md verificada por readback.')));
  assert.ok(result.ownedRuntime.iterations >= 2, 'debe ejecutar varias iteraciones del planner');
  assert.ok(calls.length >= 4, 'debe reintentar al menos una vez cuando el planner no devuelve JSON');

  const riskyRuntime = createFreeJt7OwnedRuntime({
    callProvider: async () => ({
      final: {
        summary: JSON.stringify({
          status: 'needs_action',
          summary: 'Intento ejecutar un comando peligroso.',
          reasoning: 'Prueba de bloqueo.',
          actions: [
            { type: 'exec', commandLine: 'rm -rf /' },
          ],
        }),
      },
    }),
    executeLocalActions,
    deriveLocalActions,
    listWorkspace,
    readPackageSummary,
    maxIterations: 1,
  });

  const riskyResult = await riskyRuntime.executeTask({ secrets: {} }, { appendLine() {} }, {
    goal: 'Haz algo peligroso.',
    workspacePath,
    provider: 'ddeksee',
    model: 'deepseek-chat',
    authProfile: 'default',
  });
  assert.ok(
    riskyResult.final.verification.some((item) => item.includes('exec rm -rf / exit=1 blocked')),
    'el backend propio debe heredar el bloqueo de comandos peligrosos',
  );

  console.log('freejt7_owned_runtime_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
