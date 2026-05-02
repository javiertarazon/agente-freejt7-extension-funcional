'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createFreeJt7AgentCoreV2, normalizeActions } = require('../src-js/core/freejt7-agent-core-v2');

async function main() {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-core-v2-'));
  fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
    name: 'freejt7-core-v2-smoke',
    version: '1.0.0',
    scripts: { check: 'node --version' },
  }, null, 2), 'utf8');
  fs.writeFileSync(path.join(workspacePath, 'README.md'), '# Core V2\n', 'utf8');

  const calls = [];
  const core = createFreeJt7AgentCoreV2({
    callProvider: async (prompt) => {
      calls.push(prompt);
      if (calls.length === 1) {
        return {
          final: {
            summary: JSON.stringify({
              status: 'completed',
              summary: 'No debo cerrar sin tools aunque el modelo lo intente.',
              actions: [],
            }),
          },
        };
      }
      if (calls.length === 2) {
        return {
          final: {
            summary: JSON.stringify({
              status: 'needs_action',
              summary: 'Cargo skill, consulto MCP, creo archivo y verifico.',
              actions: [
                { type: 'skill_resolve', query: 'autonomous agents', top: 2 },
                { type: 'skill_inspect', skillId: 'agent-orchestration', maxChars: 1200 },
                { type: 'mcp_list_tools', serverId: 'free-jt7-local' },
                { type: 'mcp_call', serverId: 'free-jt7-local', toolName: 'jt7_document_read', path: 'README.md', maxChars: 500 },
                { type: 'write', path: 'core-v2-output/result.txt', content: 'ok core v2\n' },
                { type: 'verify', command: 'node', args: ['--version'] },
              ],
            }),
          },
        };
      }
      return {
        final: {
          summary: JSON.stringify({
            status: 'completed',
            summary: 'Skill, MCP y archivo ejecutados con tools reales.',
            actions: [],
          }),
        },
      };
    },
    maxIterations: 4,
    maxActions: 6,
  });

  const result = await core.executeTask({ secrets: {} }, { appendLine() {} }, {
    goal: 'crea el archivo core-v2-output/result.txt y verifica node',
    workspacePath,
    provider: 'ddeksee',
    model: 'deepseek-chat',
    selectedSkills: [
      { id: 'agent-orchestration', gh_path: '.github/skills/agent-orchestration/SKILL.md' },
      { id: 'memory-forensics' },
    ],
    capabilityPlan: {
      toolMode: 'agent-owned',
      selectedSkills: ['agent-orchestration', 'memory-forensics'],
      mcpServers: [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
      nativeMcpTools: [{ family: 'documents', reason: 'read repo docs' }],
      dispatch: {
        dispatchTarget: 'freejt7-agent-core-v2',
        trace: ['skill:agent-orchestration->conversation-context', 'mcp:free-jt7-local->freejt7-agent-core-v2'],
      },
    },
  });

  const outputPath = path.join(workspacePath, 'core-v2-output', 'result.txt');
  assert.equal(result.executionRoute, 'freejt7-agent-core-v2');
  assert.equal(fs.existsSync(outputPath), true, 'debe ejecutar write real');
  assert.equal(fs.readFileSync(outputPath, 'utf8'), 'ok core v2\n');
  assert.ok(result.final.verification.some((line) => line.includes('CoreV2: write core-v2-output/result.txt')));
  assert.ok(result.final.verification.some((line) => line.includes('CoreV2: verify')));
  assert.ok(result.final.verification.some((line) => line.includes('CoreV2: skill_resolve query=autonomous agents')));
  assert.ok(result.final.verification.some((line) => line.includes('CoreV2: skill_inspect agent-orchestration')));
  assert.ok(result.final.verification.some((line) => line.includes('CoreV2: mcp_list_tools free-jt7-local')));
  assert.ok(result.final.verification.some((line) => line.includes('CoreV2: mcp_call free-jt7-local/jt7_document_read ok=true')));
  assert.equal(fs.existsSync(result.coreV2.tracePath), true, 'debe persistir traza jsonl');
  const trace = fs.readFileSync(result.coreV2.tracePath, 'utf8');
  assert.ok(trace.includes('"event":"run.start"'));
  assert.ok(trace.includes('"event":"step"'));
  assert.ok(trace.includes('"event":"run.end"'));
  assert.ok(calls.length >= 3, 'no debe aceptar completed sin tools en una meta operacional');
  assert.ok(calls[0].includes('"selectedSkills"'), 'el prompt debe incluir contexto de skills');
  assert.ok(calls[0].includes('"mcpServers"'), 'el prompt debe incluir snapshot MCP');
  assert.deepStrictEqual(result.coreV2.capabilities.selectedSkills, ['agent-orchestration', 'memory-forensics']);
  assert.equal(result.coreV2.capabilities.mcpServers[0].id, 'free-jt7-local');
  assert.ok(result.final.verification.some((line) => line.includes('capability-context')));
  assert.ok(result.coreV2.steps.some((step) => step.evidence.some((line) => line.includes('skill_inspect agent-orchestration'))));
  assert.ok(result.coreV2.steps.some((step) => step.evidence.some((line) => line.includes('mcp_call free-jt7-local/jt7_document_read ok=true'))));

  const settingsPath = path.join(workspacePath, '.vscode', 'settings.json');
  const configCore = createFreeJt7AgentCoreV2({
    callProvider: async () => ({
      final: {
        summary: JSON.stringify({
          status: 'needs_action',
          summary: 'Aplico configuracion.',
          actions: [
            { type: 'config_patch', settings: { 'freejt7.panel.runtimeBackend': 'freejt7-v2' }, settingsPath },
          ],
        }),
      },
    }),
    maxIterations: 1,
  });
  const configResult = await configCore.executeTask({ secrets: {} }, { appendLine() {} }, {
    goal: 'configura el backend del panel a freejt7-v2',
    workspacePath,
    provider: 'ddeksee',
    model: 'deepseek-chat',
    settingsPath,
  });
  assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))['freejt7.panel.runtimeBackend'], 'freejt7-v2');
  assert.ok(configResult.final.verification.some((line) => line.includes('CoreV2: config_patch')));

  let parentCalls = 0;
  let childCalls = 0;
  const subagentCore = createFreeJt7AgentCoreV2({
    callProvider: async (prompt) => {
      if (prompt.includes('Goal: subagente crea child-output/subagent.txt y verifica node')) {
        childCalls += 1;
        if (childCalls === 1) {
          return {
            final: {
              summary: JSON.stringify({
                status: 'needs_action',
                summary: 'El subagente crea el artefacto y verifica.',
                actions: [
                  { type: 'write', path: 'child-output/subagent.txt', content: 'subagent ok\n' },
                  { type: 'verify', command: 'node', args: ['--version'] },
                ],
              }),
            },
          };
        }
        return {
          final: {
            summary: JSON.stringify({
              status: 'completed',
              summary: 'Subagente completado con evidencia.',
              actions: [],
            }),
          },
        };
      }
      parentCalls += 1;
      if (parentCalls === 1) {
        return {
          final: {
            summary: JSON.stringify({
              status: 'needs_action',
              summary: 'Delego la subtarea al subagente.',
              actions: [
                { type: 'subagent_run', subagentName: 'writer-subagent', goal: 'subagente crea child-output/subagent.txt y verifica node' },
              ],
            }),
          },
        };
      }
      return {
        final: {
          summary: JSON.stringify({
            status: 'completed',
            summary: 'Delegacion completada con evidencia del hijo.',
            actions: [],
          }),
        },
      };
    },
    maxIterations: 4,
    maxSubagentDepth: 2,
  });
  const subagentResult = await subagentCore.executeTask({ secrets: {} }, { appendLine() {} }, {
    goal: 'crea child-output/subagent.txt delegando la subtarea y verifica node',
    workspacePath,
    provider: 'ddeksee',
    model: 'deepseek-chat',
    capabilityPlan: {
      toolMode: 'agent-owned',
      selectedSkills: ['agent-orchestration'],
      mcpServers: [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
      dispatch: {
        dispatchTarget: 'freejt7-agent-core-v2',
        trace: ['subagent:native->freejt7-agent-core-v2'],
      },
    },
  });
  const subagentOutputPath = path.join(workspacePath, 'child-output', 'subagent.txt');
  assert.equal(fs.existsSync(subagentOutputPath), true, 'el subagente debe crear el artefacto hijo');
  assert.equal(fs.readFileSync(subagentOutputPath, 'utf8'), 'subagent ok\n');
  assert.equal(parentCalls >= 2, true, 'el padre debe replanificar despues del subagente');
  assert.equal(childCalls >= 2, true, 'el hijo debe ejecutar su propio loop');
  assert.ok(subagentResult.final.verification.some((line) => line.includes('CoreV2: subagent_run writer-subagent status=completed')));
  assert.equal(Array.isArray(subagentResult.coreV2.subagents), true);
  assert.equal(subagentResult.coreV2.subagents.length, 1);
  assert.equal(subagentResult.coreV2.subagents[0].subagentId, 'writer-subagent');
  assert.ok(subagentResult.coreV2.subagents[0].tracePath);
  assert.ok(subagentResult.coreV2.technicalSummary.includes('Subagentes: 1.'));
  assert.equal(subagentResult.run.summary.includes('Subagentes: 1.'), false);
  assert.ok(subagentResult.final.changedFiles.some((filePath) => String(filePath).includes('child-output/subagent.txt')));

  const conversationalCore = createFreeJt7AgentCoreV2({
    callProvider: async () => ({
      final: {
        summary: JSON.stringify({
          status: 'completed',
          summary: 'Respuesta conversacional sin tools forzadas.',
          actions: [],
        }),
      },
    }),
    maxIterations: 2,
  });
  const conversationalResult = await conversationalCore.executeTask({ secrets: {} }, { appendLine() {} }, {
    goal: [
      'Solicitud base:',
      'tu respuesta no fue correcta y tus preguntas deben estar en el chat',
      '',
      'Aclaraciones obligatorias previas al plan:',
      '- Entregable esperado: corregir la respuesta del agente',
      '- Restricciones / no-goals: sin modales fuera del chat',
      '- Verificacion esperada: evidencia breve',
      '',
      'Politica operativa obligatoria:',
      '- No declarar exito sin verificacion y cierre trazado.',
    ].join('\n'),
    workspacePath,
    provider: 'ddeksee',
    model: 'deepseek-chat',
  });
  assert.equal(conversationalResult.run.status, 'completed');
  assert.equal(conversationalResult.coreV2.steps.length, 0, 'no debe forzar inspect_path por texto auditado en una solicitud conversacional');
  assert.ok(conversationalResult.run.summary.includes('Respuesta conversacional sin tools forzadas.'));

  const externalProject = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-core-v2-external-'));
  fs.writeFileSync(path.join(externalProject, 'README.md'), '# Externo\n', 'utf8');
  const externalPathCore = createFreeJt7AgentCoreV2({
    callProvider: async () => ({
      final: {
        summary: JSON.stringify({
          status: 'needs_action',
          summary: 'Leo un archivo fuera del workspace usando ruta absoluta.',
          actions: [
            { type: 'mcp_call', serverId: 'free-jt7-local', toolName: 'jt7_document_read', path: path.join(externalProject, 'README.md'), maxChars: 200 },
          ],
        }),
      },
    }),
    maxIterations: 1,
  });
  const externalPathResult = await externalPathCore.executeTask({ secrets: {} }, { appendLine() {} }, {
    goal: 'analiza el archivo externo ' + path.join(externalProject, 'README.md'),
    workspacePath,
    provider: 'ddeksee',
    model: 'deepseek-chat',
    capabilityPlan: {
      toolMode: 'agent-owned',
      mcpServers: [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
    },
  });
  assert.equal(externalPathResult.run.status, 'completed');
  assert.ok(externalPathResult.final.verification.some((line) => line.includes('mcp_call free-jt7-local/jt7_document_read ok=true')));

  const normalized = normalizeActions([{ tool: 'settings_patch', settings: { a: 1 } }]);
  assert.equal(normalized[0].type, 'config_patch');
  const normalizedSubagent = normalizeActions([{ tool: 'spawn_subagent', goal: 'haz algo' }]);
  assert.equal(normalizedSubagent[0].type, 'subagent_run');

  console.log('freejt7_agent_core_v2_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
