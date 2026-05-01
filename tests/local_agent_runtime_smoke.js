'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ProviderRouter } = require('../src-js/core/provider-router');
const { runLocalAgentTask, canResolveLocalGoal } = require('../src-js/core/local-agent-runtime');

async function main() {
  assert.equal(
    canResolveLocalGoal('continua'),
    false,
    'una continuacion vacia no debe resolverse localmente sin contexto operativo',
  );
  assert.equal(
    canResolveLocalGoal('Solicitud actual: continua\nUltimo objetivo: lee package.json y verifica scripts'),
    true,
    'una continuacion con contexto operativo debe seguir siendo resoluble localmente',
  );
  assert.equal(
    canResolveLocalGoal('porque no estas usando el agente'),
    false,
    'preguntas conversacionales no deben marcarse como meta local resoluble',
  );
  assert.equal(
    canResolveLocalGoal('quiero que me digas poque el modo agente no funciona como un verdadero agenteautonomo'),
    true,
    'diagnosticos sobre autonomía del agente deben resolverse localmente',
  );
  assert.equal(
    canResolveLocalGoal('quiero que me digas porque no aparece el proveedor deepseek en la lista de proveedores'),
    true,
    'diagnosticos del catalogo de providers deben marcarse como resolubles localmente',
  );

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-local-runtime-'));
  fs.writeFileSync(path.join(tmpRoot, 'input.txt'), 'contenido local\n', 'utf8');
  fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({
    name: 'local-runtime-smoke',
    version: '1.0.0',
    scripts: {
      build: 'node --version',
    },
  }, null, 2), 'utf8');

  const localResult = await runLocalAgentTask('runtime-audit local', {
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    fallbackReason: 'smoke',
    capabilityPlan: {
      selectedSkills: ['memory-forensics'],
      mcpServers: [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
      plannedActions: ['read:input.txt', 'write:out/result.txt'],
      dispatch: {
        owner: 'freejt7-agent-runtime',
        dispatchTarget: 'local-agent-runtime',
        trace: [
          'skill:memory-forensics->conversation-context',
          'mcp:free-jt7-local->local-agent-runtime',
          'native-tool:write:out/result.txt->local-agent-runtime',
        ],
      },
    },
    actions: [
      { type: 'read', path: 'input.txt' },
      { type: 'write', path: 'out/result.txt', content: 'ok local\n' },
      { type: 'write', path: '../blocked.txt', content: 'nope' },
      { type: 'verify', command: 'node', args: ['--version'] },
    ],
  });

  assert.strictEqual(localResult.executionMode, 'agent');
  assert.strictEqual(localResult.executionRoute, 'local-agent-tools');
  assert.ok(localResult.final.summary.includes('Free JT7 activó su ruta local') || localResult.final.summary.includes('Free JT7 respondio con la ruta local de herramientas'));
  assert.ok(localResult.final.summary.includes('Evidencia breve:'));
  assert.ok(localResult.local.technicalSummary.includes('sin depender de Copilot ni OpenClaw'));
  assert.ok(localResult.local.technicalSummary.includes('Dispatch nativo del runtime:'));
  assert.ok(localResult.local.technicalSummary.includes('mcp:free-jt7-local->local-agent-runtime'));
  assert.ok(localResult.final.verification.some((item) => item.includes('git status --short')));
  assert.ok(localResult.final.verification.some((item) => item.includes('runtime dispatch owner=freejt7-agent-runtime')));
  assert.ok(localResult.final.verification.some((item) => item.includes('lectura workspace-safe input.txt')));
  assert.ok(localResult.final.verification.some((item) => item.includes('escritura verificada por readback out/result.txt')));
  assert.ok(localResult.final.verification.some((item) => item.includes('fuera del workspace bloqueada')));
  assert.deepStrictEqual(localResult.final.changedFiles, ['out/result.txt']);
  assert.equal(fs.readFileSync(path.join(tmpRoot, 'out', 'result.txt'), 'utf8'), 'ok local\n');

  const inferredResult = await runLocalAgentTask('Verifica el build y revisa input.txt antes de responder.', {
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
  });

  assert.ok(inferredResult.final.summary.includes('Solicitud atendida: Verifica el build y revisa input.txt antes de responder.'));
  assert.ok(inferredResult.final.summary.includes('Siguiente paso ejecutable inferido:'));
  assert.ok(inferredResult.final.summary.includes('leer input.txt'));
  assert.ok(inferredResult.final.summary.includes('npm run build'));
  assert.ok(inferredResult.local.technicalSummary.includes('Archivos inspeccionados: input.txt: contenido local'));
  assert.ok(inferredResult.local.technicalSummary.includes('Verificaciones ejecutadas:'));
  assert.ok(inferredResult.final.verification.some((item) => item.includes('npm run build') && item.includes('exit=0')));

  const serializedConversationGoal = [
    'Instrucciones base del agente: Eres free jt7...',
    'Sesion actual: Sesión Free JT7.',
    'Canal actual: control-panel.',
    'Solicitud actual: analiza el repositorio open claw y dime el siguiente paso',
  ].join('\n');
  const focusedResult = await runLocalAgentTask(serializedConversationGoal, {
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
  });
  assert.ok(
    focusedResult.final.summary.includes('Solicitud atendida: analiza el repositorio open claw y dime el siguiente paso'),
    'El resumen local debe priorizar la solicitud actual y no volcar todo el prompt interno',
  );
  assert.ok(
    !focusedResult.final.summary.includes('Instrucciones base del agente:'),
    'El resumen local no debe incluir bloque completo de instrucciones internas',
  );

  const contaminatedConversationGoal = [
    'Historial conversacional previo:',
    '[user] instala git',
    '[assistant] Resultado: no pude completar la instalacion porque sudo pidio contrasena.',
    'Solicitud actual: porque no estas usando el agente',
  ].join('\n');
  const contaminatedResult = await runLocalAgentTask(contaminatedConversationGoal, {
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'qwen/qwen3-coder:free',
    fallbackReason: 'Free JT7 (openrouter/OpenClaw agent): Bind: loopback). Start the gateway and retry.',
  });
  assert.ok(
    contaminatedResult.final.summary.includes('Solicitud atendida: porque no estas usando el agente'),
    'debe responder sobre la solicitud actual, no sobre el historial previo',
  );
  assert.ok(
    contaminatedResult.final.summary.includes('Motivo operativo: El runtime de OpenClaw no quedo operativo a tiempo'),
    'debe explicar por que no uso el motor agente cuando la pregunta actual lo pide',
  );
  assert.ok(
    !contaminatedResult.final.summary.includes('Bind: loopback'),
    'el resumen visible no debe volcar el error crudo del backend subordinado',
  );
  assert.ok(
    !contaminatedResult.final.summary.includes('system_install'),
    'no debe inferir una instalacion de sistema a partir del historial previo',
  );

  const greetingResult = await runLocalAgentTask('hola', {
    workspacePath: tmpRoot,
    provider: 'clod',
    model: 'moonshotai/Kimi-K2.5',
    fallbackReason: 'Free JT7 (clod/OpenClaw agent): 403 status code (no body).',
  });
  assert.ok(
    greetingResult.final.summary.includes('Hola.'),
    'un saludo debe responder con una salida conversacional corta',
  );
  assert.ok(
    !greetingResult.final.summary.includes('Evidencia breve:'),
    'un saludo no debe degradar a auditoria local con evidencia del workspace',
  );
  assert.ok(
    !greetingResult.final.summary.includes('concreta el archivo, prueba o cambio esperado'),
    'un saludo no debe caer al cierre generico de auditoria basica',
  );

  const providerDiagnosticResult = await runLocalAgentTask(
    'quiero que me digas porque no aparece el proveedor deepseek en la lista de proveedores',
    {
      workspacePath: process.cwd(),
      provider: 'hf',
      model: 'deepseek-ai/DeepSeek-R1',
      fallbackReason: 'Free JT7 (hf/OpenClaw agent): Agent couldn\'t generate a response. Please try again.',
    },
  );
  assert.ok(
    providerDiagnosticResult.final.summary.includes('Diagnóstico local: en este repo el provider DeepSeek sí está registrado.'),
    'el fallback local debe diagnosticar el catalogo del provider en vez de responder con auditoria basica',
  );
  assert.ok(
    providerDiagnosticResult.final.summary.includes('la causa probable ya no es el código fuente del repo sino la extensión instalada o el estado persistido del perfil'),
    'el diagnostico local debe separar repo correcto de extensión/perfil stale',
  );
  assert.ok(
    !providerDiagnosticResult.final.summary.includes('Evidencia breve:'),
    'el diagnostico de provider no debe degradar al resumen generico de auditoria local',
  );

  const autonomyDiagnosticResult = await runLocalAgentTask(
    'quiero que me digas poque el modo agente no funciona como un verdadero agenteautonomo',
    {
      workspacePath: process.cwd(),
      provider: 'ddeksee',
      model: 'deepseek-reasoner',
      fallbackReason: 'Free JT7 (ddeksee/OpenClaw agent): Bind: loopback). Start the gateway and retry.',
    },
  );
  assert.ok(
    autonomyDiagnosticResult.final.summary.includes('Diagnóstico local: Free JT7 todavía cayó a ruta local'),
    'el autodiagnóstico del modo agente debe salir como diagnóstico local del runtime',
  );
  assert.ok(
    autonomyDiagnosticResult.final.summary.includes('Causa operativa inmediata: El runtime de OpenClaw no quedo operativo a tiempo'),
    'debe explicar la causa operativa inmediata sin caer a pseudo-chat del provider',
  );
  assert.ok(
    !autonomyDiagnosticResult.final.summary.includes('Bind: loopback'),
    'el autodiagnóstico no debe volcar el error crudo del backend subordinado',
  );
  assert.ok(
    !autonomyDiagnosticResult.final.summary.includes('Evidencia breve:'),
    'el autodiagnóstico de autonomía no debe degradar a auditoría genérica',
  );

  const installResult = await runLocalAgentTask('instala git', {
    workspacePath: tmpRoot,
    provider: 'clod',
    model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
  });
  assert.ok(
    installResult.final.summary.includes('git ya estaba instalado') || installResult.final.summary.includes('Instale git y verifique que quedo disponible.'),
    'debe resolver una accion de sistema concreta para git',
  );
  assert.ok(
    installResult.local.technicalSummary.includes('Acciones de sistema: git:'),
    'debe registrar la accion de sistema en el resumen tecnico',
  );
  assert.ok(
    installResult.final.verification.some((item) => item.includes('system_install git status=')),
    'debe dejar evidencia de la accion de sistema ejecutada',
  );

  const createDirResult = await runLocalAgentTask(
    `quieo quecrees una carpeta en el directorio siguiente: ${tmpRoot} el nombre de la carperta sera prueba 3`,
    {
      workspacePath: tmpRoot,
      provider: 'openrouter',
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      fallbackReason: 'Free JT7 (openrouter): HTTP 429 para el modelo nvidia/nemotron-3-super-120b-a12b:free.',
    },
  );
  assert.ok(
    createDirResult.final.summary.includes('fue creada y verificada'),
    'debe crear directorios solicitados y responder con resultado verificado',
  );
  assert.ok(fs.existsSync(path.join(tmpRoot, 'prueba 3')), 'la carpeta solicitada debe existir realmente');
  assert.ok(
    createDirResult.final.verification.some((item) => item.includes('directorio') && item.includes('verificado')),
    'debe dejar evidencia de la creacion del directorio',
  );

  const inspectDirResult = await runLocalAgentTask(`revisa el directorio ${tmpRoot}`, {
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
  });
  assert.ok(
    inspectDirResult.final.summary.includes('Existe y contiene:') || inspectDirResult.final.summary.includes('Existe, pero no tiene entradas visibles'),
    'debe poder inspeccionar un directorio explicito',
  );

  const deleteTarget = path.join(tmpRoot, 'out', 'to-delete.txt');
  fs.writeFileSync(deleteTarget, 'borrar\n', 'utf8');
  const deleteResult = await runLocalAgentTask(`borra el archivo ${deleteTarget}`, {
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
  });
  assert.ok(
    deleteResult.final.summary.includes('Elimine') || deleteResult.final.summary.includes('ya no existe'),
    'debe poder borrar archivos solicitados de forma explicita',
  );
  assert.equal(fs.existsSync(deleteTarget), false, 'el archivo objetivo debe quedar borrado');
  assert.ok(
    deleteResult.final.verification.some((item) => item.includes('borrado') && item.includes('removed=true')),
    'debe dejar evidencia verificable del borrado',
  );

  const execResult = await runLocalAgentTask('ejecuta el comando `node --version`', {
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
  });
  assert.ok(
    execResult.final.summary.includes('Ejecute `node --version` con salida verificada'),
    'debe poder ejecutar comandos explicitos permitidos',
  );
  assert.ok(
    execResult.final.verification.some((item) => item.includes('exec node --version exit=0')),
    'debe registrar la ejecucion del comando explicito',
  );

  const blockedExecResult = await runLocalAgentTask('ejecuta el comando `rm -rf /`', {
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
  });
  assert.ok(
    blockedExecResult.final.summary.includes('No ejecute `rm -rf /` porque fue clasificado como comando bloqueado o riesgoso.'),
    'debe bloquear comandos claramente peligrosos en el runtime local',
  );
  assert.ok(
    blockedExecResult.final.verification.some((item) => item.includes('exec rm -rf / exit=1 blocked')),
    'debe dejar evidencia del bloqueo de comandos peligrosos',
  );

  const incompleteCreateDirResult = await runLocalAgentTask('crea la carpeta', {
    workspacePath: tmpRoot,
    provider: 'openrouter',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    fallbackReason: 'goal-resoluble-localmente',
  });
  assert.ok(
    incompleteCreateDirResult.final.summary.includes('Necesito la ruta completa de la carpeta'),
    'si la orden de crear carpeta esta incompleta debe pedir el dato faltante en vez de devolver auditoria generica',
  );
  assert.ok(
    !incompleteCreateDirResult.final.summary.includes('concreta el archivo, prueba o cambio esperado'),
    'no debe caer al cierre generico de auditoria basica para create-directory incompleto',
  );

  const router = new ProviderRouter({ workspacePath: process.cwd() });
  const routed = await router.execute({
    goal: 'Audita el workspace con herramientas locales.',
    provider: 'openrouter',
    model: 'openai/gpt-oss-20b:free',
    executionMode: 'agent',
  }, {
    workspacePath: process.cwd(),
  });

  assert.strictEqual(routed.executionMode, 'agent');
  assert.strictEqual(routed.raw.executionRoute, 'local-agent-tools');
  assert.ok(routed.summary.includes('ruta local') || routed.summary.includes('backend subordinado'));

  console.log('local_agent_runtime_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
