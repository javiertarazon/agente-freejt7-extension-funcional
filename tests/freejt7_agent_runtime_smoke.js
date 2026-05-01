'use strict';

const assert = require('assert');

const { createFreeJt7AgentRuntime } = require('../src-js/core/freejt7-agent-runtime');

async function main() {
  const calls = [];
  const runtime = createFreeJt7AgentRuntime({
    context: { secrets: {} },
    output: { appendLine(message) { calls.push({ type: 'log', message }); } },
    getWorkspacePath: () => '/tmp/workspace',
    getProviderConfig: () => ({ provider: 'openrouter', model: 'qwen/qwen3-coder:free' }),
    runLocalAgentTask: async (_context, _output, options) => {
      calls.push({ type: 'local', goal: options.goal, reason: options.fallbackReason, actions: options.actions });
      return {
        provider: 'local',
        model: 'freejt7-local-tools',
        executionRoute: 'local-agent-tools',
        run: { summary: 'local ok' },
        final: { summary: 'local ok' },
      };
    },
    runOpenClawAgentTask: async (_context, _output, options) => {
      calls.push({ type: 'openclaw', goal: options.goal, provider: options.provider });
      const error = new Error('network connection error');
      error.isRetryable = true;
      throw error;
    },
    runOwnedAgentTask: async (_context, _output, options) => {
      calls.push({ type: 'owned', goal: options.goal, provider: options.provider, runtimeBackend: options.runtimeBackend });
      return {
        provider: options.provider,
        model: options.model,
        executionRoute: 'freejt7-owned-agent',
        routeMeta: {
          runtimeBackend: 'freejt7',
          backend: {
            kind: 'provider-direct',
            provider: options.provider,
            model: options.model,
            runtimeBackend: 'freejt7',
            authProfile: options.authProfile || 'default',
            fallbackSelected: 'provider-direct',
          },
        },
        run: { summary: 'owned ok' },
        final: { summary: 'owned ok' },
      };
    },
    runCoreV2Task: async (_context, _output, options) => {
      calls.push({ type: 'core-v2', goal: options.goal, provider: options.provider, runtimeBackend: options.runtimeBackend });
      return {
        provider: options.provider,
        model: options.model,
        executionRoute: 'freejt7-agent-core-v2',
        coreV2: { runId: 'run-core-v2', tracePath: '/tmp/workspace/copilot-agent/core-v2-runs.jsonl' },
        routeMeta: {
          runtimeBackend: 'freejt7-v2',
          backend: {
            kind: 'freejt7-core-v2',
            provider: options.provider,
            model: options.model,
            runtimeBackend: 'freejt7-v2',
            authProfile: options.authProfile || 'default',
          },
        },
        run: { summary: 'core v2 ok' },
        final: { summary: 'core v2 ok', verification: ['CoreV2 ok'] },
      };
    },
    runProviderDirectFallbackTask: async (_context, _output, options) => {
      calls.push({ type: 'direct', goal: options.goal, provider: options.provider });
      return {
        provider: options.provider,
        model: options.model,
        executionRoute: 'provider-direct-fallback',
        run: { summary: 'direct ok' },
        final: { summary: 'direct ok' },
      };
    },
    runAcpTask: async () => ({ run: { summary: 'acp ok' }, final: { summary: 'acp ok' } }),
    runCopilotTask: async (goal) => {
      calls.push({ type: 'copilot', goal });
      return {
        provider: 'copilot',
        model: '',
        executionRoute: 'copilot',
        run: { summary: 'copilot ok' },
        final: { summary: 'copilot ok' },
      };
    },
    buildLocalActions: (goal) => /crear carpeta/i.test(String(goal || ''))
      ? [{ type: 'mkdir', path: '/tmp/demo', allowAbsolute: true }]
      : [],
    getMcpServers: () => [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
    canResolveLocalGoal: (goal) => /crear carpeta|instala git|historial conversacional previo|contexto del workspace/i.test(String(goal || '')),
    shouldPreferLocalExecution: (goal) => /crear carpeta|historial conversacional previo|contexto del workspace/i.test(String(goal || '')),
    shouldUseProviderDirectFallback: (error) => /network connection error/i.test(String(error?.message || error)),
    shouldUseLocalAgentFallback: (goal) => /instala git/i.test(String(goal || '')),
  });

  const localPlan = runtime.planTaskExecution('crear carpeta en /tmp/demo', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
  });
  assert.equal(localPlan.primaryRoute, 'local-agent');
  assert.equal(localPlan.reason, 'goal-resoluble-localmente');
  assert.equal(localPlan.capabilityPlan.toolMode, 'local-tools');
  assert.equal(localPlan.capabilityPlan.mcpServers[0].id, 'free-jt7-local');
  assert.equal(localPlan.capabilityPlan.localOperations.includes('filesystem.mkdir'), true);
  assert.deepStrictEqual(localPlan.capabilityPlan.plannedActions, ['mkdir:/tmp/demo']);
  assert.equal(localPlan.capabilityPlan.dispatchOwnedByRuntime, true);
  assert.equal(localPlan.capabilityPlan.dispatch.owner, 'freejt7-agent-runtime');
  assert.equal(localPlan.capabilityPlan.dispatch.providerIndependent, true);
  assert.equal(localPlan.capabilityPlan.dispatch.dispatchTarget, 'local-agent-runtime');
  assert.ok(localPlan.capabilityPlan.dispatch.trace.includes('mcp:free-jt7-local->local-agent-runtime'));
  assert.ok(localPlan.capabilityPlan.dispatch.trace.includes('native-tool:mkdir:/tmp/demo->local-agent-runtime'));

  const mcpPlan = runtime.planTaskExecution('abre sample.pdf, busca free jt7 agent en la web y revela el archivo en el escritorio', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    selectedSkills: [{ id: 'document-triage' }, { id: 'web-investigation' }],
  });
  assert.equal(mcpPlan.primaryRoute, 'openclaw-agent');
  assert.deepStrictEqual(
    mcpPlan.capabilityPlan.nativeMcpTools.map((item) => item.family).sort(),
    ['browser', 'desktop', 'documents'],
  );
  assert.deepStrictEqual(
    mcpPlan.capabilityPlan.skillDispatch.map((item) => item.id),
    ['document-triage', 'web-investigation'],
  );
  assert.equal(mcpPlan.capabilityPlan.dispatch.dispatchTarget, 'openclaw-agent-runtime');
  assert.ok(mcpPlan.capabilityPlan.dispatch.trace.includes('mcp-tool:documents->openclaw-agent-runtime'));
  assert.ok(mcpPlan.capabilityPlan.dispatch.trace.includes('skill:document-triage->conversation-context'));

  const ownedPlan = runtime.planTaskExecution('analiza el cambio y responde como agente', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    runtimeBackend: 'freejt7',
  });
  assert.equal(ownedPlan.primaryRoute, 'freejt7-agent');
  assert.equal(ownedPlan.runtimeBackend, 'freejt7');
  assert.equal(ownedPlan.capabilityPlan.toolMode, 'agent-owned');
  assert.equal(ownedPlan.capabilityPlan.dispatch.dispatchTarget, 'freejt7-owned-runtime');

  const coreV2Plan = runtime.planTaskExecution('crea y verifica un archivo como agente autonomo', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    runtimeBackend: 'freejt7-v2',
  });
  assert.equal(coreV2Plan.primaryRoute, 'freejt7-agent-core-v2');
  assert.equal(coreV2Plan.runtimeBackend, 'freejt7-v2');
  assert.equal(coreV2Plan.capabilityPlan.toolMode, 'agent-owned');
  assert.equal(coreV2Plan.capabilityPlan.dispatch.dispatchTarget, 'freejt7-agent-core-v2');

  const localResult = await runtime.executeAgentTask('crear carpeta en /tmp/demo', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
  });
  assert.equal(localResult.final.summary, 'local ok');
  assert.equal(localResult.raw.routeMeta.executionPlan.primaryRoute, 'local-agent');
  assert.equal(calls.some((item) => item.type === 'local'), true, 'debe priorizar runtime local para objetivos deterministas');
  assert.equal(calls.some((item) => item.type === 'openclaw'), false, 'no debe pasar por OpenClaw cuando el objetivo es local-first');
  assert.equal(calls.some((item) => item.type === 'direct'), false, 'no debe ir a provider directo cuando el objetivo es local-first');
  assert.deepStrictEqual(calls.find((item) => item.type === 'local').actions, [{ type: 'mkdir', path: '/tmp/demo', allowAbsolute: true }], 'debe despachar acciones locales preparadas por el runtime');

  calls.length = 0;
  const directResult = await runtime.executeAgentTask('explica el error de mi API', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
  });
  assert.equal(directResult.final.summary, 'direct ok');
  assert.equal(directResult.provider, 'freejt7-agent');
  assert.equal(directResult.model, 'freejt7-runtime');
  assert.equal(calls.some((item) => item.type === 'openclaw'), true, 'debe intentar OpenClaw primero');
  assert.equal(calls.some((item) => item.type === 'direct'), true, 'debe usar provider directo como fallback operativo');
  assert.equal(directResult.raw.routeMeta.executionPlan.capabilityPlan.toolMode, 'agent-backends');
  assert.equal(directResult.raw.routeMeta.controlPlaneOwner, 'freejt7-agent');
  assert.equal(directResult.raw.routeMeta.backend.kind, 'provider-direct');
  assert.equal(directResult.raw.routeMeta.backend.provider, 'openrouter');
  assert.equal(directResult.raw.routeMeta.executionPlan.capabilityPlan.dispatch.owner, 'freejt7-agent-runtime');
  assert.equal(directResult.raw.routeMeta.executionPlan.capabilityPlan.dispatch.dispatchTarget, 'openclaw-agent-runtime');

  calls.length = 0;
  const ownedResult = await runtime.executeAgentTask('analiza el cambio y responde como agente', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    runtimeBackend: 'freejt7',
  });
  assert.equal(ownedResult.final.summary, 'owned ok');
  assert.equal(ownedResult.raw.routeMeta.executionPlan.primaryRoute, 'freejt7-agent');
  assert.equal(calls.some((item) => item.type === 'owned'), true, 'debe usar backend propio cuando runtimeBackend=freejt7');
  assert.equal(calls.some((item) => item.type === 'openclaw'), false, 'freejt7 propio no debe depender de OpenClaw en la ruta principal');

  calls.length = 0;
  const coreV2Result = await runtime.executeAgentTask('crea y verifica un archivo como agente autonomo', {
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    runtimeBackend: 'freejt7-v2',
  });
  assert.equal(coreV2Result.final.summary, 'core v2 ok');
  assert.equal(coreV2Result.raw.routeMeta.executionPlan.primaryRoute, 'freejt7-agent-core-v2');
  assert.equal(calls.some((item) => item.type === 'core-v2'), true, 'debe usar core-v2 cuando runtimeBackend=freejt7-v2');
  assert.equal(calls.some((item) => item.type === 'openclaw'), false, 'core-v2 no debe depender de OpenClaw en la ruta principal');

  calls.length = 0;
  const continuityResult = await runtime.executeTask({
    goal: 'continua',
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    sessionTitle: 'Sesion demo',
    selectedSkills: [{ id: 'memory-forensics' }, { id: 'prompt-engineering-patterns' }],
    chatHistorySnapshot: [
      { role: 'user', text: 'crea el plan base' },
      { role: 'assistant', text: 'Plan base listo con checkpoint-1' },
    ],
  }, {
    workspacePath: '/tmp/workspace',
    sessionAgentState: {
      lastTaskId: 'task-previa',
      lastUserGoal: 'crea el plan base',
      lastAssistantSummary: 'Plan base listo con checkpoint-1',
      continuationHint: 'Objetivo: crea el plan base | Ultimo resultado: Plan base listo con checkpoint-1',
    },
  });
  const openclawCall = calls.find((item) => item.type === 'openclaw');
  assert.ok(openclawCall, 'executeTask debe seguir usando el runtime propio para agent routes');
  assert.match(openclawCall.goal, /Historial conversacional previo:/, 'debe serializar continuidad conversacional dentro del runtime del agente');
  assert.match(openclawCall.goal, /checkpoint-1/, 'debe incluir el contexto previo del assistant');
  assert.match(openclawCall.goal, /Contexto de continuidad recuperado por Free JT7:/, 'debe enriquecer prompts breves de continuidad con agent state persistido');
  assert.deepStrictEqual(
    continuityResult.raw.routeMeta.executionPlan.capabilityPlan.selectedSkills,
    ['memory-forensics', 'prompt-engineering-patterns'],
  );
  assert.ok(
    continuityResult.raw.routeMeta.executionPlan.capabilityPlan.dispatch.trace.includes('skill:memory-forensics->conversation-context'),
    'debe trazar el activation path de skills desde el runtime propio',
  );
  assert.ok(
    continuityResult.raw.routeMeta.executionPlan.capabilityPlan.dispatch.trace.includes('mcp:free-jt7-local->openclaw-agent-runtime'),
    'debe trazar el snapshot MCP sin depender del provider',
  );
  assert.equal(
    continuityResult.raw.routeMeta.executionPlan.primaryRoute,
    'openclaw-agent',
    'debe planificar con el objetivo real del usuario aunque el prompt serializado contenga pistas que parezcan local-first',
  );

  calls.length = 0;
  const vagueContinuationResult = await runtime.executeTask({
    goal: 'realiza las modificaciones necesarias',
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    sessionTitle: 'Sesion demo',
    chatHistorySnapshot: [
      { role: 'user', text: 'corrige el bug del runtime agente' },
      { role: 'assistant', text: 'Diagnostico listo: el routing cae a local por usar el prompt serializado.' },
    ],
  }, {
    workspacePath: '/tmp/workspace',
    sessionAgentState: {
      lastTaskId: 'task-bug-runtime',
      lastUserGoal: 'corrige el bug del runtime agente',
      lastAssistantSummary: 'Diagnostico listo: el routing cae a local por usar el prompt serializado.',
      continuationHint: 'Aplica el fix en el runtime propio y verifica con smokes.',
    },
  });
  const vagueOpenclawCall = calls.find((item) => item.type === 'openclaw');
  assert.ok(vagueOpenclawCall, 'las continuaciones vagas deben seguir yendo por la ruta agente cuando existe contexto previo');
  assert.match(vagueOpenclawCall.goal, /Contexto de continuidad recuperado por Free JT7:/);
  assert.match(vagueOpenclawCall.goal, /corrige el bug del runtime agente/);
  assert.equal(vagueContinuationResult.raw.routeMeta.executionPlan.primaryRoute, 'openclaw-agent');
  assert.equal(calls.some((item) => item.type === 'local'), false, 'no debe degradar a local por confundir continuidad con auditoria serializada');

  const health = runtime.getHealthStatus();
  assert.equal(health.ok, true);
  assert.equal(health.ownsFlow, true);
  assert.equal(health.continuityOwnedByRuntime, true);
  assert.equal(health.routePlanningOwnedByRuntime, true);
  assert.equal(health.capabilityPlanningOwnedByRuntime, true);
  assert.equal(health.backendSubordinationOwnedByRuntime, true);
  assert.equal(health.skillsOwnedByRuntime, true);
  assert.equal(health.mcpOwnedByRuntime, true);
  assert.equal(health.nativeToolsOwnedByRuntime, true);

  console.log('freejt7_agent_runtime_smoke: OK');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
