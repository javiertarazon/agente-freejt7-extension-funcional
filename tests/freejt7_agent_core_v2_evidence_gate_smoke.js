'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createFreeJt7AgentCoreV2,
  operationalGoal,
  __testing,
} = require('../src-js/core/freejt7-agent-core-v2');

async function main() {
  assert.equal(operationalGoal('configura el backend del panel'), true, 'la meta debe requerir tools');
  assert.equal(
    __testing.hasCompletionEvidence({ steps: [], changedFiles: new Set(), requiresTools: true }),
    false,
    'una meta operacional sin pasos ni cambios no debe tener evidencia suficiente',
  );
  assert.equal(
    __testing.hasCompletionEvidence({
      steps: [{ evidence: ['inspect . exists=true kind=dir'] }],
      changedFiles: new Set(),
      requiresTools: true,
    }),
    true,
    'cualquier evidencia real del loop debe habilitar el cierre posterior',
  );

  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-core-v2-evidence-'));
  fs.writeFileSync(path.join(workspacePath, 'README.md'), '# Evidence gate\n', 'utf8');

  let plannerCalls = 0;
  const core = createFreeJt7AgentCoreV2({
    callProvider: async () => {
      plannerCalls += 1;
      return {
        final: {
          summary: JSON.stringify({
            status: 'completed',
            summary: 'El planner intenta cerrar sin acciones.',
            actions: [],
          }),
        },
      };
    },
    maxIterations: 2,
  });

  const result = await core.executeTask({ secrets: {} }, { appendLine() {} }, {
    goal: 'configura el backend del panel a freejt7-v2',
    workspacePath,
    provider: 'ddeksee',
    model: 'deepseek-chat',
  });

  assert.equal(plannerCalls, 2, 'el core no debe aceptar completed inmediato en una meta operacional');
  assert.equal(result.final.status, 'completed', 'tras ejecutar una accion determinista con evidencia, el cierre puede ser valido');
  assert.ok(
    result.coreV2.steps.some((step) => step.evidence.some((item) => item.includes('inspect . exists=true kind=dir'))),
    'la accion determinista debe dejar evidencia trazable',
  );
  assert.ok(
    result.final.verification.some((item) => item.includes('CoreV2: inspect . exists=true kind=dir.')),
    'la verificacion final debe reflejar la evidencia usada para cerrar',
  );

  console.log('freejt7_agent_core_v2_evidence_gate_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});