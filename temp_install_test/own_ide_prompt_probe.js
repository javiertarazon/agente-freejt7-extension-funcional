'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const { createFreeJt7AgentRuntime } = require('../src-js/core/freejt7-agent-runtime');
const { createFreeJt7AgentCoreV2 } = require('../src-js/core/freejt7-agent-core-v2');
const { callProvider } = require('../src-js/core/api-provider-adapter');

const PROMPT = 'qiuero una skill para instalar programas en linux zorin con pocos clip sin escribor codigo ni utilizar la terminal';
const OWN_IDE_PROFILE_ROOT = path.join(os.homedir(), '.freejt7-app', 'profiles', 'own-ide');
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, 'temp_install_test');
const RESULT_PATH = path.join(OUTPUT_DIR, 'own_ide_prompt_probe_result.json');
const REPORT_PATH = path.join(OUTPUT_DIR, 'own_ide_prompt_probe_report.html');

function findInstalledOwnIdeExtensionDir() {
  const extensionsRoot = path.join(OWN_IDE_PROFILE_ROOT, 'extensions');
  const entries = fs.existsSync(extensionsRoot)
    ? fs.readdirSync(extensionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('javiertarazon.agente-freejt7-extension-funcional-'))
      .map((entry) => path.join(extensionsRoot, entry.name))
      .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    : [];
  return entries[0] || '';
}

function readOwnIdeSettings() {
  const settingsPath = path.join(OWN_IDE_PROFILE_ROOT, 'user-data', 'User', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`No existe settings.json de own-ide: ${settingsPath}`);
  }
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function createMemento(initial = {}) {
  const state = { ...initial };
  return {
    async get(key) {
      return state[key];
    },
    async update(key, value) {
      state[key] = value;
      return value;
    },
  };
}

function createSecretStorage() {
  const secrets = new Map();
  return {
    async get(key) {
      return secrets.has(key) ? secrets.get(key) : undefined;
    },
    async store(key, value) {
      secrets.set(key, value);
    },
    async delete(key) {
      secrets.delete(key);
    },
  };
}

function createFakeOutput() {
  const lines = [];
  return {
    lines,
    append(value) {
      lines.push(String(value));
    },
    appendLine(value) {
      lines.push(String(value));
    },
    show() {},
    clear() {
      lines.length = 0;
    },
  };
}

function createFakeVscode(settings = {}, workspacePath = process.cwd()) {
  const commandHandlers = new Map();
  const createdPanels = [];
  const configStore = { ...settings };
  const viewProviders = new Map();

  function createConfiguration(section) {
    const prefix = String(section || '').trim();
    const normalizeKey = (key) => (prefix ? `${prefix}.${key}` : key);
    return {
      get(key, fallback) {
        const fullKey = normalizeKey(key);
        return Object.prototype.hasOwnProperty.call(configStore, fullKey) ? configStore[fullKey] : fallback;
      },
      async update(key, value) {
        configStore[normalizeKey(key)] = value;
        return value;
      },
    };
  }

  function createPanel() {
    const messageHandlers = [];
    const disposeHandlers = [];
    const panel = {
      viewType: 'freejt7.controlPanel',
      title: 'Free JT7',
      revealCount: 0,
      disposed: false,
      webview: {
        html: '',
        options: {},
        messages: [],
        postMessage(message) {
          this.messages.push(message);
          return true;
        },
        onDidReceiveMessage(handler) {
          messageHandlers.push(handler);
          return { dispose() {} };
        },
      },
      onDidDispose(handler) {
        disposeHandlers.push(handler);
        return { dispose() {} };
      },
      reveal() {
        this.revealCount += 1;
      },
      dispose() {
        this.disposed = true;
        for (const handler of disposeHandlers) {
          try {
            handler();
          } catch (_) {}
        }
      },
      async emitToExtension(message) {
        for (const handler of messageHandlers) {
          await handler(message);
        }
      },
    };
    createdPanels.push(panel);
    return panel;
  }

  return {
    ConfigurationTarget: { Global: 1 },
    ViewColumn: { One: 1 },
    StatusBarAlignment: { Left: 1 },
    Uri: {
      parse(value) {
        return { toString: () => String(value), value };
      },
    },
    env: {
      openExternal: async () => true,
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: workspacePath } }],
      getConfiguration(section) {
        return createConfiguration(section);
      },
      onDidChangeConfiguration() {
        return { dispose() {} };
      },
      async openTextDocument() {
        return {};
      },
    },
    commands: {
      registerCommand(name, handler) {
        commandHandlers.set(name, handler);
        return { dispose() { commandHandlers.delete(name); } };
      },
      async executeCommand(name, ...args) {
        const handler = commandHandlers.get(name);
        return handler ? handler(...args) : undefined;
      },
    },
    window: {
      createOutputChannel() {
        return createFakeOutput();
      },
      showErrorMessage: async () => undefined,
      showWarningMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showInputBox: async () => undefined,
      showQuickPick: async () => undefined,
      showTextDocument: async () => undefined,
      createStatusBarItem() {
        return { text: '', command: '', show() {}, hide() {}, dispose() {} };
      },
      createWebviewPanel() {
        return createPanel();
      },
      registerWebviewViewProvider(viewId, provider) {
        viewProviders.set(viewId, provider);
        return { dispose() { viewProviders.delete(viewId); } };
      },
    },
    __testing: {
      createdPanels,
      configStore,
      viewProviders,
    },
  };
}

function requireWithMockedVscode(modulePath, vscodeMock) {
  const originalLoad = Module._load;
  delete require.cache[require.resolve(modulePath)];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'vscode') {
      return vscodeMock;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

function waitFor(check, timeoutMs = 180000, intervalMs = 100) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const value = check();
        if (value) {
          resolve(value);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('timeout esperando finalizacion de la prueba own-ide')); 
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function extractTaskSummary(task) {
  function isJunkSummary(value) {
    const text = String(value || '').trim();
    if (!text) return true;
    return text.length <= 3 && !/[A-Za-z0-9\u00C0-\u024F]/.test(text);
  }

  function extractPayloadText(payload) {
    if (!payload || typeof payload !== 'object') return '';
    if (typeof payload.finalAssistantVisibleText === 'string' && payload.finalAssistantVisibleText.trim()) {
      return payload.finalAssistantVisibleText.trim();
    }
    if (typeof payload.finalAssistantRawText === 'string' && payload.finalAssistantRawText.trim()) {
      return payload.finalAssistantRawText.trim();
    }
    const payloadTexts = Array.isArray(payload.payloads)
      ? payload.payloads.map((item) => String(item && item.text || '').trim()).filter(Boolean)
      : [];
    if (payloadTexts.length) {
      return payloadTexts.join('\n\n');
    }
    if (payload.payload && typeof payload.payload === 'object') {
      return extractPayloadText(payload.payload);
    }
    return '';
  }

  if (!task) return '';
  const candidates = [];
  if (typeof task.result === 'string') candidates.push(task.result);
  if (task.result && typeof task.result.summary === 'string') candidates.push(task.result.summary);
  candidates.push(extractPayloadText(task.result));
  candidates.push(extractPayloadText(task.result && task.result.raw));
  for (const candidate of candidates) {
    if (!isJunkSummary(candidate)) return String(candidate).trim();
  }
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text) return text;
  }
  return '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildReportHtml(data) {
  const transcriptHtml = data.transcript.map((entry) => {
    const roleClass = entry.role === 'assistant' ? 'assistant' : 'user';
    const title = entry.role === 'assistant' ? 'Respuesta visible del panel' : 'Prompt del usuario';
    return [
      `<section class="bubble ${roleClass}">`,
      `<div class="meta">${escapeHtml(title)}</div>`,
      `<pre>${escapeHtml(entry.text)}</pre>`,
      '</section>',
    ].join('');
  }).join('\n');

  return [
    '<!doctype html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Free JT7 Prompt Probe</title>',
    '<style>',
    ':root { color-scheme: light; --bg: #f2efe7; --card: #fffdf8; --ink: #1f2328; --muted: #5d6470; --accent: #0f766e; --danger: #b42318; --border: rgba(31,35,40,0.12); }',
    'body { margin: 0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; background: radial-gradient(circle at top left, #fff4d6, transparent 38%), linear-gradient(180deg, #f3efe5 0%, #e9edf3 100%); color: var(--ink); }',
    '.page { max-width: 1100px; margin: 0 auto; padding: 32px 24px 48px; }',
    '.hero { background: rgba(255,255,255,0.86); border: 1px solid var(--border); border-radius: 24px; padding: 24px; box-shadow: 0 18px 45px rgba(31,35,40,0.08); backdrop-filter: blur(8px); }',
    '.eyebrow { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }',
    'h1 { margin: 0 0 12px; font-size: 32px; line-height: 1.08; }',
    '.summary { margin: 0; font-size: 16px; line-height: 1.55; color: var(--muted); }',
    '.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }',
    '.stat { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 14px 16px; }',
    '.stat .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }',
    '.stat .value { margin-top: 8px; font-size: 17px; font-weight: 700; word-break: break-word; }',
    '.value.ok { color: var(--accent); }',
    '.value.bad { color: var(--danger); }',
    '.layout { display: grid; grid-template-columns: 1.35fr 0.9fr; gap: 18px; margin-top: 20px; }',
    '.panel { background: rgba(255,255,255,0.92); border: 1px solid var(--border); border-radius: 22px; padding: 20px; box-shadow: 0 16px 38px rgba(15,23,42,0.07); }',
    '.panel h2 { margin: 0 0 14px; font-size: 20px; }',
    '.bubble { border-radius: 18px; padding: 16px; border: 1px solid var(--border); margin-bottom: 12px; }',
    '.bubble.user { background: #fff7e8; }',
    '.bubble.assistant { background: #effbf7; }',
    '.meta { font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); margin-bottom: 10px; }',
    'pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: "IBM Plex Mono", "Cascadia Code", monospace; font-size: 14px; line-height: 1.5; }',
    'ul { margin: 0; padding-left: 18px; }',
    'li { margin: 0 0 8px; line-height: 1.45; }',
    '@media (max-width: 900px) { .grid, .layout { grid-template-columns: 1fr; } }',
    '</style>',
    '</head>',
    '<body>',
    '<main class="page">',
    '<section class="hero">',
    '<div class="eyebrow">Prueba dirigida del flujo real del IDE</div>',
    '<h1>Confirmacion de que el fallback tecnico ya no se filtra al usuario</h1>',
    `<p class="summary">La sonda ejecuta el prompt exacto dentro del panel instalado de own-ide con runtime agent-first real. El veredicto se calcula solo sobre el texto visible de la respuesta final del asistente.</p>`,
    '<div class="grid">',
    `<article class="stat"><div class="label">Proveedor</div><div class="value">${escapeHtml(data.provider)}</div></article>`,
    `<article class="stat"><div class="label">Modelo</div><div class="value">${escapeHtml(data.model)}</div></article>`,
    `<article class="stat"><div class="label">Ruta efectiva</div><div class="value">${escapeHtml(data.executionRoute)}</div></article>`,
    `<article class="stat"><div class="label">Leak tecnico visible</div><div class="value ${data.visibleTechnicalFallback ? 'bad' : 'ok'}">${data.visibleTechnicalFallback ? 'SI' : 'NO'}</div></article>`,
    '</div>',
    '</section>',
    '<section class="layout">',
    '<article class="panel">',
    '<h2>Transcript visible</h2>',
    transcriptHtml,
    '</article>',
    '<aside class="panel">',
    '<h2>Evidencia runtime</h2>',
    '<ul>',
    `<li>Estado final de tarea: ${escapeHtml(data.taskStatus)}</li>`,
    `<li>Run ID: ${escapeHtml(data.runId)}</li>`,
    `<li>Trace path: ${escapeHtml(data.tracePath)}</li>`,
    `<li>Resumen final persistido: ${escapeHtml(data.resultSummary)}</li>`,
    `<li>Task ID: ${escapeHtml(data.taskId)}</li>`,
    '</ul>',
    '</aside>',
    '</section>',
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

async function main() {
  process.chdir(WORKSPACE_ROOT);

  const extensionDir = findInstalledOwnIdeExtensionDir();
  if (!extensionDir) {
    throw new Error('No se encontro la extension instalada en own-ide.');
  }
  const distEntry = path.join(extensionDir, 'dist', 'extension.cjs');
  if (!fs.existsSync(distEntry)) {
    throw new Error(`No existe el bundle instalado: ${distEntry}`);
  }

  const settings = readOwnIdeSettings();
  settings['freejt7.panel.runtimeBackend'] = 'freejt7-v2';
  settings['freejt7.panel.openOnStartup'] = true;
  settings['freejt7.panel.enabled'] = true;
  settings['freejt7.panel.policy.mode'] = 'autonomous';
  settings['freejt7.ide.ownerMode'] = 'agent';
  settings['freejt7.app.standaloneMode'] = true;

  const vscodeMock = createFakeVscode(settings, WORKSPACE_ROOT);
  const previousStandalone = process.env.FREEJT7_APP_MODE;
  process.env.FREEJT7_APP_MODE = '1';

  const extensionModule = requireWithMockedVscode(distEntry, vscodeMock);
  if (!extensionModule.__testing || typeof extensionModule.__testing.createControlPanel !== 'function') {
    throw new Error('El bundle instalado no expone __testing.createControlPanel.');
  }

  const output = createFakeOutput();
  const context = {
    extensionPath: extensionDir,
    globalState: createMemento(),
    secrets: createSecretStorage(),
    subscriptions: [],
  };

  const intake = extensionModule.__testing.deriveImplicitPanelIntake(PROMPT);
  const selectedSkills = extensionModule.__testing.prioritizeResolvedSkillsForGoal(PROMPT, []);
  const provider = String(settings['freejt7.apiProvider'] || 'ddeksee');
  const model = String(settings['freejt7.apiProviderModel'] || 'deepseek-reasoner');

  const agentRuntime = createFreeJt7AgentRuntime({
    context,
    output,
    getWorkspacePath: () => WORKSPACE_ROOT,
    getProviderConfig: () => ({ provider, model }),
    getMcpServers: () => [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
    canResolveLocalGoal: () => false,
    shouldPreferLocalExecution: () => false,
    buildLocalActions: () => [],
    shouldUseProviderDirectFallback: () => false,
    shouldUseLocalAgentFallback: () => false,
    runLocalAgentTask: async () => {
      throw new Error('local-agent-unavailable-in-probe');
    },
    runOpenClawAgentTask: async () => {
      throw new Error('openclaw-unavailable-in-probe');
    },
    runCoreV2Task: async (runtimeContext, runtimeOutput, input = {}) => {
      const core = createFreeJt7AgentCoreV2({ callProvider, maxIterations: 3 });
      return core.executeTask(runtimeContext, runtimeOutput, {
        ...input,
        goal: String(input.goal || input.prompt || '').trim(),
        workspacePath: String(input.workspacePath || WORKSPACE_ROOT),
        provider: String(input.provider || provider),
        model: String(input.model || model),
        runtimeBackend: String(input.runtimeBackend || 'freejt7-v2'),
        authProfile: String(input.authProfile || 'default'),
        intake: input.intake || intake,
        selectedSkills: Array.isArray(input.selectedSkills) && input.selectedSkills.length ? input.selectedSkills : selectedSkills,
      });
    },
  });

  const controlPanel = extensionModule.__testing.createControlPanel(context, output, {
    workspacePath: WORKSPACE_ROOT,
    workerCount: 1,
    policyMode: 'autonomous',
    agentRuntime,
    prepareTask: async (taskInput) => ({
      ...taskInput,
      intake,
      selectedSkills,
      fallbackProviders: [],
      sessionTitle: 'Prueba dirigida own-ide',
    }),
    finalizeTaskTrace: async () => {},
  });

  try {
    controlPanel.openPanel();
    const panel = vscodeMock.__testing.createdPanels[0];
    if (!panel) {
      throw new Error('No se creo el panel headless.');
    }

    await panel.emitToExtension({ type: 'panel.ready' });
    await panel.emitToExtension({ type: 'state.get' });
    await waitFor(() => {
      const snapshots = panel.webview.messages.filter((message) => message && message.type === 'state.snapshot');
      return snapshots[snapshots.length - 1] || null;
    }, 30000);

    await panel.emitToExtension({ type: 'session.create', title: 'Prueba dirigida own-ide' });
    const createdMessage = await waitFor(() => panel.webview.messages.find((message) => message && message.type === 'session.created'), 30000);
    const sessionId = String(createdMessage.session?.sessionId || '').trim();
    if (!sessionId) {
      throw new Error('No se obtuvo sessionId del panel.');
    }

    await panel.emitToExtension({
      type: 'task.enqueue',
      sessionId,
      task: {
        goal: PROMPT,
        provider,
        model,
        executionMode: 'agent',
        runtimeBackend: 'freejt7-v2',
        policyProfile: 'coding',
        authProfile: 'default',
      },
    });

    const task = await waitFor(() => {
      return Object.values(controlPanel.engine._taskIndex).find((candidate) => {
        if (!candidate || candidate.sessionId !== sessionId) return false;
        return ['completed', 'failed', 'cancelled', 'blocked'].includes(String(candidate.status || '').toLowerCase());
      }) || null;
    });

    const session = controlPanel.engine._sessions[sessionId] || null;
    const transcript = Array.isArray(session && session.chatHistory)
      ? session.chatHistory.map((entry) => ({
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        text: (() => {
          const text = String(entry.text || '').trim();
          if (entry.role !== 'assistant') return text;
          return text.length > 3 ? text : extractTaskSummary(task);
        })(),
      })).filter((entry) => entry.text)
      : [];

    const assistantText = transcript.filter((entry) => entry.role === 'assistant').map((entry) => entry.text).join('\n\n').trim() || extractTaskSummary(task);
    const visibleTechnicalFallback = /(planner no devolvio json valido|core-v2 ejecutara acciones deterministas|fallback tecnico|fallback t[eé]cnico|provider-direct|openclaw|json valido)/i.test(assistantText);
    const tracePath = String(task?.result?.coreV2?.tracePath || task?.result?.raw?.coreV2?.tracePath || '');
    const executionRoute = String(task?.result?.executionRoute || task?.result?.raw?.executionRoute || '');
    const resultSummary = extractTaskSummary(task);

    const report = {
      prompt: PROMPT,
      provider,
      model,
      sessionId,
      taskId: String(task?.taskId || ''),
      taskStatus: String(task?.status || ''),
      runId: String(task?.runId || ''),
      executionRoute,
      tracePath,
      resultSummary,
      visibleTechnicalFallback,
      prioritizedSkills: selectedSkills.map((item) => String(item && item.id || item).trim()).filter(Boolean),
      transcript,
      panelMessagesCount: panel.webview.messages.length,
      outputLines: output.lines,
    };

    fs.writeFileSync(RESULT_PATH, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(REPORT_PATH, buildReportHtml(report), 'utf8');
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    try {
      controlPanel.dispose();
    } catch (_) {}
    if (previousStandalone === undefined) {
      delete process.env.FREEJT7_APP_MODE;
    } else {
      process.env.FREEJT7_APP_MODE = previousStandalone;
    }
  }
}

main().catch((error) => {
  const message = String(error && error.stack || error);
  try {
    fs.writeFileSync(RESULT_PATH, JSON.stringify({ error: message }, null, 2), 'utf8');
  } catch (_) {}
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});