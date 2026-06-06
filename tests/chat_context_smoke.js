// Smoke test: contexto conversacional + contexto local automatico
// Ejecutar: node tests/chat_context_smoke.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildConversationRequest,
  buildLocalContextSource,
  extractExistingPaths,
  serializeConversationRequest,
} = require('../src-js/core/chat-context');

function createTempProject() {
  const baseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7 chat '));
  const projectRoot = path.join(baseRoot, 'repo con espacios');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src-rust'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'README.md'), '# CLAURST\n\nProyecto de prueba para smoke.\n', 'utf8');
  fs.writeFileSync(path.join(projectRoot, 'Cargo.toml'), '[workspace]\n', 'utf8');
  return projectRoot;
}

function main() {
  const projectRoot = createTempProject();
  const prompt = `Analiza esta carpeta y continua desde el contexto previo: ${projectRoot}`;

  const detected = extractExistingPaths(prompt, { workspacePath: projectRoot });
  assert.deepStrictEqual(detected, [projectRoot], 'debe detectar la ruta local aunque tenga espacios');

  const request = buildConversationRequest({
    prompt,
    history: [
      { role: 'user', content: 'Quiero un informe general del contenido' },
      { role: 'assistant', content: 'Voy a revisar la carpeta y seguire desde ahi.' },
    ],
    intake: {
      deliverable: 'Informe con identidad Free JT7',
      constraints: 'No perder continuidad conversacional',
      verification: 'Smoke local',
    },
    selectedSkills: [{ id: 'free-jt7-global-runtime-audit' }, { id: 'systematic-debugging' }],
    capabilities: {
      selectedSkills: ['free-jt7-global-runtime-audit', 'systematic-debugging'],
      mcpServers: ['free-jt7-local', 'browser'],
      localOperations: ['filesystem.read', 'shell.verify'],
      plannedActions: ['read:README.md', 'verify:npm run build'],
      dispatchTarget: 'openclaw-agent-runtime',
      runtimeBackend: 'auto',
      provider: 'openrouter',
      model: 'openai/gpt-oss-20b:free',
    },
    sessionTitle: 'Sesion demo',
    workspacePath: projectRoot,
    channel: 'control-panel',
  });

  assert.strictEqual(request.messages.length, 3, 'debe conservar historial + turno actual');
  assert.ok(request.systemPrompt.includes('Eres free jt7'), 'debe incluir identidad base del agente');
  assert.ok(request.systemPrompt.includes('No te presentes como MiniMax'), 'debe blindar la identidad frente al proveedor');
  assert.ok(request.systemPrompt.includes('free-jt7-global-runtime-audit'), 'debe incluir skills resueltos');
  assert.ok(request.systemPrompt.includes('Entregable esperado'), 'debe incluir intake operativo');
  assert.ok(request.systemPrompt.includes('Contexto local inspeccionado automaticamente'), 'debe incluir contexto local');
  assert.ok(request.systemPrompt.includes(projectRoot), 'debe mencionar la ruta detectada');
  assert.ok(request.systemPrompt.includes('README.md'), 'debe resumir archivos visibles');
  assert.ok(request.systemPrompt.includes('Capacidades operativas visibles en esta sesion'), 'debe incluir inventario operativo visible');
  assert.ok(request.systemPrompt.includes('MCP disponibles: free-jt7-local, browser'), 'debe incluir snapshot MCP');
  assert.ok(request.systemPrompt.includes('Tools/operaciones locales: filesystem.read, shell.verify'), 'debe incluir operaciones locales');
  assert.ok(request.systemPrompt.includes('Acciones candidatas del runtime: read:README.md, verify:npm run build'), 'debe incluir acciones planeadas');
  assert.ok(request.systemPrompt.includes('Destino operativo preferido: openclaw-agent-runtime'), 'debe incluir destino operativo');

  const unrelatedSource = buildLocalContextSource(
    'qiero una skill para instalar programas en linux zorin sin terminal',
    [
      { role: 'user', content: `Analiza esta carpeta anterior: ${projectRoot}` },
      { role: 'assistant', content: 'Revisare esa carpeta.' },
    ],
    { workspacePath: projectRoot },
  );
  assert.equal(unrelatedSource.includes(projectRoot), false, 'no debe reinyectar rutas heredadas si la solicitud actual no es una continuacion explicita');

  const continuationSource = buildLocalContextSource(
    'continua con esa carpeta',
    [
      { role: 'user', content: `Analiza esta carpeta anterior: ${projectRoot}` },
      { role: 'assistant', content: 'Revisare esa carpeta.' },
    ],
    { workspacePath: projectRoot },
  );
  assert.ok(continuationSource.includes(projectRoot), 'debe reutilizar la ruta reciente cuando el usuario pide continuar');

  const serialized = serializeConversationRequest(request);
  assert.ok(serialized.includes('Historial conversacional previo'), 'debe serializar el historial');
  assert.ok(serialized.includes('Solicitud actual'), 'debe serializar la solicitud actual');
  assert.equal(serialized.includes('\0'), false, 'la serializacion no debe conservar bytes nulos');

  const sanitized = serializeConversationRequest({
    systemPrompt: 'Base\0Prompt',
    messages: [
      { role: 'user', content: 'instala\0 git' },
      { role: 'assistant', content: 'ok\0' },
      { role: 'user', content: 'continua\0' },
    ],
  });
  assert.equal(sanitized.includes('\0'), false, 'debe eliminar bytes nulos del historial y solicitud actual');

  console.log('chat_context_smoke: OK');
}

main();
