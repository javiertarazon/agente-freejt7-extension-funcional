'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const { createFreeJt7AgentCoreV2 } = require('../src-js/core/freejt7-agent-core-v2');

function findOwnIdeProfileRoot() {
  return path.join(os.homedir(), '.freejt7-app', 'profiles', 'own-ide');
}

function findInstalledOwnIdeExtensionDir() {
  const extensionsRoot = path.join(findOwnIdeProfileRoot(), 'extensions');
  const entries = fs.existsSync(extensionsRoot)
    ? fs.readdirSync(extensionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('javiertarazon.agente-freejt7-extension-funcional-'))
      .map((entry) => path.join(extensionsRoot, entry.name))
      .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    : [];
  return entries[0] || '';
}

function readOwnIdeSettings() {
  const settingsPath = path.join(findOwnIdeProfileRoot(), 'user-data', 'User', 'settings.json');
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
    snapshot() {
      return { ...state };
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
          return {
            dispose() {},
          };
        },
      },
      onDidDispose(handler) {
        disposeHandlers.push(handler);
        return {
          dispose() {},
        };
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

  const vscode = {
    ConfigurationTarget: {
      Global: 1,
    },
    ViewColumn: {
      One: 1,
    },
    StatusBarAlignment: {
      Left: 1,
    },
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
        return {
          dispose() {
            commandHandlers.delete(name);
          },
        };
      },
      async executeCommand(name, ...args) {
        const handler = commandHandlers.get(name);
        if (!handler) {
          return undefined;
        }
        return handler(...args);
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
        return {
          text: '',
          command: '',
          show() {},
          hide() {},
          dispose() {},
        };
      },
      createWebviewPanel() {
        return createPanel();
      },
      registerWebviewViewProvider(viewId, provider) {
        viewProviders.set(viewId, provider);
        return {
          dispose() {
            viewProviders.delete(viewId);
          },
        };
      },
    },
    __testing: {
      commandHandlers,
      createdPanels,
      configStore,
      viewProviders,
    },
  };

  return vscode;
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

function waitFor(check, timeoutMs = 10_000, intervalMs = 40) {
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
        reject(new Error('timeout esperando condicion headless own-ide'));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function createMockAgentRuntime(output) {
  return {
    planTaskExecution(goal, task = {}) {
      return {
        primaryRoute: 'freejt7-agent-core-v2',
        runtimeBackend: String(task.runtimeBackend || 'freejt7-v2'),
        provider: String(task.provider || 'openrouter'),
        model: String(task.model || 'openai/gpt-oss-20b:free'),
        localCapable: true,
        deterministicLocal: true,
        fallbackOrder: [],
        reason: 'headless-own-ide-panel-smoke',
        capabilityPlan: {
          toolMode: 'agent-owned',
          selectedSkills: [],
          mcpServers: [{ id: 'free-jt7-local', transport: 'stdio', enabled: true }],
          nativeMcpTools: [{ family: 'documents', reason: 'read/write/verify headless smoke' }],
          dispatch: {
            dispatchTarget: 'freejt7-agent-core-v2',
            trace: ['panel->provider-router->freejt7-agent-core-v2'],
          },
        },
      };
    },
    async executeTask(task, runtime = {}) {
      let plannerCalls = 0;
      const core = createFreeJt7AgentCoreV2({
        callProvider: async () => {
          plannerCalls += 1;
          if (plannerCalls === 1) {
            return {
              final: {
                summary: JSON.stringify({
                  status: 'needs_action',
                  summary: 'Creo archivo desde el panel y verifico node.',
                  actions: [
                    { type: 'write', path: 'own-ide-headless/output.txt', content: 'headless own-ide ok\n' },
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
                summary: 'Round-trip del panel ejecutado con core-v2.',
                actions: [],
              }),
            },
          };
        },
        maxIterations: 3,
      });
      return core.executeTask({ secrets: {} }, output, {
        goal: String(task.goal || task.prompt || '').trim(),
        workspacePath: String(runtime.workspacePath || task.workspacePath || process.cwd()),
        provider: String(task.provider || 'openrouter'),
        model: String(task.model || 'openai/gpt-oss-20b:free'),
        runtimeBackend: String(task.runtimeBackend || 'freejt7-v2'),
        capabilityPlan: this.planTaskExecution(task.goal, task).capabilityPlan,
      });
    },
  };
}

async function main() {
  const extensionDir = findInstalledOwnIdeExtensionDir();
  assert.ok(extensionDir, 'Debe existir la extension instalada en own-ide');
  const distEntry = path.join(extensionDir, 'dist', 'extension.cjs');
  assert.ok(fs.existsSync(distEntry), 'La extension instalada debe contener dist/extension.cjs');

  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-own-ide-panel-headless-'));
  fs.writeFileSync(path.join(workspacePath, 'README.md'), '# own-ide headless\n', 'utf8');
  fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
    name: 'freejt7-own-ide-panel-headless',
    version: '1.0.0',
    scripts: { check: 'node --version' },
  }, null, 2), 'utf8');

  const settings = readOwnIdeSettings();
  settings['freejt7.panel.runtimeBackend'] = 'freejt7-v2';
  settings['freejt7.panel.openOnStartup'] = true;
  settings['freejt7.panel.enabled'] = true;
  settings['freejt7.panel.policy.mode'] = 'autonomous';
  settings['freejt7.ide.ownerMode'] = 'agent';
  settings['freejt7.app.standaloneMode'] = true;
  settings['freejt7.apiProvider'] = String(settings['freejt7.apiProvider'] || 'openrouter');
  settings['freejt7.apiProviderModel'] = String(settings['freejt7.apiProviderModel'] || 'openai/gpt-oss-20b:free');

  const vscodeMock = createFakeVscode(settings, workspacePath);
  const previousStandalone = process.env.FREEJT7_APP_MODE;
  process.env.FREEJT7_APP_MODE = '1';

  try {
    const extensionModule = requireWithMockedVscode(distEntry, vscodeMock);
    assert.ok(extensionModule.__testing && typeof extensionModule.__testing.createControlPanel === 'function', 'El bundle instalado debe exponer __testing.createControlPanel');

    const output = createFakeOutput();
    const context = {
      extensionPath: extensionDir,
      globalState: createMemento(),
      secrets: createSecretStorage(),
      subscriptions: [],
    };
    const agentRuntime = createMockAgentRuntime(output);
    const controlPanel = extensionModule.__testing.createControlPanel(context, output, {
      workspacePath,
      workerCount: 1,
      policyMode: 'autonomous',
      agentRuntime,
      prepareTask: async (taskInput) => taskInput,
      finalizeTaskTrace: async () => {},
    });

    controlPanel.openPanel();
    assert.equal(vscodeMock.__testing.createdPanels.length, 1, 'Debe abrir un WebviewPanel real del agente');
    const panel = vscodeMock.__testing.createdPanels[0];
    assert.ok(panel.webview.html.includes('Free JT7'), 'El HTML del panel debe haberse renderizado');

    await panel.emitToExtension({ type: 'panel.ready' });
    await panel.emitToExtension({ type: 'state.get' });
    const initialSnapshot = await waitFor(() => {
      const snapshots = panel.webview.messages.filter((message) => message && message.type === 'state.snapshot');
      const latest = snapshots[snapshots.length - 1];
      return latest && latest.runtimeBackend ? latest : null;
    });
    assert.equal(initialSnapshot.runtimeBackend, 'freejt7-v2');
    assert.equal(String(initialSnapshot.ownerMode || 'agent'), 'agent');

    await panel.emitToExtension({ type: 'session.create', title: 'Sesion headless own-ide' });
    const createdMessage = await waitFor(() => panel.webview.messages.find((message) => message && message.type === 'session.created'));
    const sessionId = String(createdMessage.session?.sessionId || '').trim();
    assert.ok(sessionId, 'Debe crear una sesion desde el panel');

    await panel.emitToExtension({
      type: 'task.enqueue',
      sessionId,
      task: {
        goal: 'crea own-ide-headless/output.txt y verifica node',
        provider: settings['freejt7.apiProvider'],
        model: settings['freejt7.apiProviderModel'],
        executionMode: 'agent',
        runtimeBackend: 'freejt7-v2',
        policyProfile: 'coding',
        authProfile: 'default',
      },
    });

    const completedTask = await waitFor(() => {
      return Object.values(controlPanel.engine._taskIndex).find((task) => task && task.sessionId === sessionId && task.status === 'completed');
    });
    const outputPath = path.join(workspacePath, 'own-ide-headless', 'output.txt');
    const statePath = path.join(workspacePath, 'copilot-agent', 'panel-state.json');
    const runsPath = path.join(workspacePath, 'copilot-agent', 'core-v2-runs.jsonl');

    assert.ok(fs.existsSync(outputPath), 'La tarea del panel debe crear un artefacto real en el workspace');
    assert.equal(fs.readFileSync(outputPath, 'utf8'), 'headless own-ide ok\n');
    assert.ok(fs.existsSync(statePath), 'Debe persistir panel-state.json');
    assert.ok(fs.existsSync(runsPath), 'Debe persistir core-v2-runs.jsonl');

    const persistedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const persistedTask = persistedState.taskIndex[completedTask.taskId];
    assert.ok(persistedTask, 'La tarea completada debe quedar persistida');
    assert.equal(persistedTask.status, 'completed');
    assert.equal(persistedTask.verification.status, 'verified');
    assert.equal(String(persistedTask.result?.executionRoute || persistedTask.result?.raw?.executionRoute || ''), 'freejt7-agent-core-v2');
    assert.ok(Array.isArray(persistedTask.routeMeta?.attempts), 'La ruta efectiva debe persistir attempts');
    assert.ok(Array.isArray(persistedTask.verification?.evidence) && persistedTask.verification.evidence.length > 0, 'La verificacion debe persistir evidencia');
    const tracePath = String(
      persistedTask.result?.coreV2?.tracePath
      || persistedTask.result?.raw?.coreV2?.tracePath
      || '',
    );
    assert.ok(fs.existsSync(tracePath), 'La tarea debe exponer tracePath real de core-v2');

    const runsText = fs.readFileSync(runsPath, 'utf8');
    assert.ok(runsText.includes('"event":"run.start"'));
    assert.ok(runsText.includes('"event":"step"'));
    assert.ok(runsText.includes('"event":"run.end"'));

    const eventMessages = panel.webview.messages.filter((message) => message && message.type === 'engine.event');
    assert.ok(eventMessages.some((message) => message.event?.type === 'task.started'), 'El panel debe recibir engine.event task.started');
    assert.ok(eventMessages.some((message) => message.event?.type === 'task.completed'), 'El panel debe recibir engine.event task.completed');

    controlPanel.dispose();
  } finally {
    if (previousStandalone === undefined) {
      delete process.env.FREEJT7_APP_MODE;
    } else {
      process.env.FREEJT7_APP_MODE = previousStandalone;
    }
  }

  console.log('own_ide_panel_headless_e2e_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
