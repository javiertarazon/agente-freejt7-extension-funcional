'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const {
  executeLocalActions,
  deriveLocalActions,
  listWorkspace,
  readPackageSummary,
} = require('./local-agent-runtime');

const CORE_VERSION = 'freejt7-agent-core-v2';
const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_MAX_ACTIONS = 5;
const DEFAULT_TRACE_FILE = path.join('copilot-agent', 'core-v2-runs.jsonl');
const TOOL_OUTPUT_LIMIT = 5000;
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOCAL_MCP_SERVER_ID = 'free-jt7-local';
let localMcpRuntimePromise = null;

const TOOL_REGISTRY = Object.freeze({
  read: {
    risk: 'low',
    required: ['path'],
    description: 'Lee un archivo del workspace para obtener evidencia.',
  },
  write: {
    risk: 'medium',
    required: ['path', 'content'],
    description: 'Escribe un archivo y verifica readback.',
  },
  mkdir: {
    risk: 'medium',
    required: ['path'],
    description: 'Crea un directorio y verifica existencia.',
  },
  delete: {
    risk: 'high',
    required: ['path'],
    description: 'Elimina un archivo o directorio dentro del workspace.',
  },
  inspect_path: {
    risk: 'low',
    required: ['path'],
    description: 'Inspecciona existencia/tipo/listado de una ruta.',
  },
  exec: {
    risk: 'high',
    required: ['commandLine'],
    description: 'Ejecuta un comando shell permitido desde el workspace.',
  },
  verify: {
    risk: 'medium',
    required: ['command'],
    description: 'Ejecuta verificacion segura con git/node/npm.',
  },
  system_install: {
    risk: 'high',
    required: ['package'],
    description: 'Instala paquetes de sistema soportados por el runtime local.',
  },
  config_patch: {
    risk: 'high',
    required: ['settings'],
    description: 'Aplica cambios de configuracion del IDE propio en settings.json.',
  },
  skill_resolve: {
    risk: 'low',
    required: ['query'],
    description: 'Resuelve skills aplicables usando skills_manager.py.',
  },
  skill_inspect: {
    risk: 'low',
    required: ['skillId'],
    description: 'Lee el SKILL.md resuelto para incorporarlo como contexto operativo verificable.',
  },
  mcp_list_tools: {
    risk: 'low',
    required: ['serverId'],
    description: 'Lista las tools MCP soportadas nativamente por core-v2 para el servidor indicado.',
  },
  mcp_call: {
    risk: 'medium',
    required: ['serverId', 'toolName'],
    description: 'Invoca una tool MCP real del servidor local free-jt7-local dentro del mismo loop.',
  },
  subagent_run: {
    risk: 'medium',
    required: ['goal'],
    description: 'Delega una subtarea a un subagente nativo del mismo core-v2 y recoge su evidencia.',
  },
});

function uniqueStrings(items) {
  const values = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function nowIso() {
  return new Date().toISOString();
}

function truncate(value, max = TOOL_OUTPUT_LIMIT) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}\n...<truncated>` : text;
}

function normalizeToolName(value) {
  const tool = String(value || '').trim().toLowerCase();
  if (['readfile', 'file_read'].includes(tool)) return 'read';
  if (['writefile', 'file_write'].includes(tool)) return 'write';
  if (['create_dir', 'create_directory'].includes(tool)) return 'mkdir';
  if (['remove', 'rm', 'delete_path'].includes(tool)) return 'delete';
  if (['inspect', 'list_path', 'stat_path', 'ls'].includes(tool)) return 'inspect_path';
  if (['bash', 'shell', 'command'].includes(tool)) return 'exec';
  if (['verification'].includes(tool)) return 'verify';
  if (['install_package'].includes(tool)) return 'system_install';
  if (['settings_patch', 'patch_config'].includes(tool)) return 'config_patch';
  if (['skill_read', 'skill_load', 'skill_open'].includes(tool)) return 'skill_inspect';
  if (['skill_lookup'].includes(tool)) return 'skill_resolve';
  if (['mcp_tools', 'mcp_describe'].includes(tool)) return 'mcp_list_tools';
  if (['mcp_tool_call', 'mcp_execute'].includes(tool)) return 'mcp_call';
  if (['delegate_task', 'spawn_subagent', 'subtask_run'].includes(tool)) return 'subagent_run';
  return tool;
}

function stripCodeFence(text) {
  const source = String(text || '').trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? String(fenced[1] || '').trim() : source;
}

function extractJsonObject(text) {
  const source = stripCodeFence(text);
  const first = source.indexOf('{');
  if (first < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = first; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(first, index + 1);
    }
  }
  return '';
}

function parsePlannerJson(text) {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return { ok: false, error: 'planner-no-json' };
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'planner-json-not-object' };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

function normalizeAction(action) {
  if (!action || typeof action !== 'object') return null;
  const type = normalizeToolName(action.type || action.tool || action.kind);
  if (!TOOL_REGISTRY[type]) return type ? { type, unsupported: true } : null;
  const out = { type };
  for (const key of [
    'path',
    'filePath',
    'dirPath',
    'targetPath',
    'rootPath',
    'content',
    'command',
    'commandLine',
    'package',
    'name',
    'query',
    'mode',
    'toolName',
    'mcpTool',
    'skillId',
    'serverId',
    'goal',
    'prompt',
    'provider',
    'model',
    'authProfile',
    'subagentName',
    'allowAbsolute',
    'recursive',
    'timeoutMs',
    'settingsPath',
    'maxChars',
    'maxBytes',
    'maxResults',
    'top',
    'maxIterations',
    'maxActions',
  ]) {
    if (action[key] !== undefined) out[key] = action[key];
  }
  if (action.settings && typeof action.settings === 'object' && !Array.isArray(action.settings)) {
    out.settings = { ...action.settings };
  }
  if (action.capabilityPlan && typeof action.capabilityPlan === 'object' && !Array.isArray(action.capabilityPlan)) {
    out.capabilityPlan = { ...action.capabilityPlan };
  }
  if (action.arguments && typeof action.arguments === 'object' && !Array.isArray(action.arguments)) {
    out.arguments = { ...action.arguments };
  }
  if (Array.isArray(action.selectedSkills)) {
    out.selectedSkills = action.selectedSkills.map((item) => (item && typeof item === 'object' ? { ...item } : item)).filter(Boolean);
  }
  if (Array.isArray(action.args)) {
    out.args = action.args.map((item) => String(item));
  }
  return out;
}

function normalizeActions(actions, maxActions = DEFAULT_MAX_ACTIONS) {
  return (Array.isArray(actions) ? actions : [])
    .map(normalizeAction)
    .filter(Boolean)
    .slice(0, maxActions);
}

function operationalGoal(goal) {
  return /\b(crea|crear|modifica|modificar|edita|editar|escribe|write|borra|elimina|delete|ejecuta|exec|instala|install|verifica|test|build|configura|settings|ajustes|arregla|corrige|fix)\b/i.test(String(goal || ''));
}

function buildToolCatalog() {
  return Object.entries(TOOL_REGISTRY).map(([name, spec]) => ({
    name,
    risk: spec.risk,
    required: spec.required,
    description: spec.description,
  }));
}

function normalizeSkillIds(items) {
  return uniqueStrings((Array.isArray(items) ? items : []).map((item) => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return String(item.id || item.name || '').trim();
  }));
}

function normalizeSkillDetails(items) {
  const result = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const id = typeof item === 'string'
      ? String(item).trim()
      : String(item.id || item.name || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      category: typeof item === 'object' ? String(item.category || 'general').trim() || 'general' : 'general',
      score: typeof item === 'object' ? Number(item.score || 0) : 0,
      gh_path: typeof item === 'object'
        ? String(item.gh_path || item.path || `.github/skills/${id}/SKILL.md`).trim()
        : `.github/skills/${id}/SKILL.md`,
    });
  }
  return result;
}

function normalizeCapabilityContext(input = {}) {
  const plan = input.capabilityPlan && typeof input.capabilityPlan === 'object' ? input.capabilityPlan : {};
  const dispatch = plan.dispatch && typeof plan.dispatch === 'object' ? plan.dispatch : {};
  const selectedSkillDetails = normalizeSkillDetails(input.selectedSkills || []);
  return {
    selectedSkills: normalizeSkillIds(plan.selectedSkills || input.selectedSkills || []),
    selectedSkillDetails,
    mcpServers: (Array.isArray(plan.mcpServers) ? plan.mcpServers : [])
      .map((item) => item && typeof item === 'object' ? {
        id: String(item.id || '').trim(),
        transport: String(item.transport || '').trim(),
        enabled: item.enabled !== false,
      } : null)
      .filter((item) => item && item.id),
    nativeMcpTools: (Array.isArray(plan.nativeMcpTools) ? plan.nativeMcpTools : [])
      .map((item) => item && typeof item === 'object' ? {
        family: String(item.family || '').trim(),
        reason: String(item.reason || '').trim(),
      } : null)
      .filter((item) => item && item.family),
    plannedActions: uniqueStrings(plan.plannedActions || []),
    localOperations: uniqueStrings(plan.localOperations || []),
    toolMode: String(plan.toolMode || '').trim(),
    dispatchTarget: String(dispatch.dispatchTarget || '').trim(),
    dispatchTrace: uniqueStrings(dispatch.trace || []),
    backendProvider: String(plan.backendProvider || '').trim(),
    backendModel: String(plan.backendModel || '').trim(),
  };
}

function buildPlannerPrompt(state) {
  return [
    'Eres Free JT7 Agent Core V2, el backend propietario del IDE Free JT7.',
    'No eres un chat. Eres un runtime de ejecucion: planificas, usas tools, verificas y solo cierras con evidencia.',
    'Responde exclusivamente JSON valido. No uses markdown ni texto fuera del JSON.',
    'Si el usuario pide crear, modificar, borrar, ejecutar, instalar, configurar o verificar, debes emitir actions antes de completed.',
    'Nunca digas que hiciste algo si no aparece en toolResults o si no lo pides como action en esta iteracion.',
    '',
    'Schema:',
    '{"status":"needs_action|completed|failed","summary":"breve en espanol","reasoning":"breve","actions":[{"type":"read|write|mkdir|delete|inspect_path|exec|verify|system_install|config_patch|skill_resolve|skill_inspect|mcp_list_tools|mcp_call|subagent_run"}]}',
    '',
    `Goal: ${state.goal}`,
    `Workspace: ${state.workspacePath}`,
    `Run: ${state.runId}`,
    `Iteracion: ${state.iteration}/${state.maxIterations}`,
    '',
    'Contexto operativo:',
    JSON.stringify({
      workspace: state.workspace,
      packageSummary: state.packageSummary,
      tools: buildToolCatalog(),
      capabilityContext: state.capabilityContext,
      deterministicActions: state.deterministicActions,
      previousSteps: state.steps.map((step) => ({
        iteration: step.iteration,
        status: step.status,
        actions: step.actions.map((item) => item.type),
        failures: step.failures,
        evidence: step.evidence.slice(0, 8),
      })),
    }, null, 2),
  ].join('\n');
}

function extractProviderText(response) {
  return String(
    response?.final?.summary
    || response?.run?.summary
    || response?.summary
    || response?.text
    || ''
  ).trim();
}

function ensureTraceDir(tracePath) {
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
}

function appendJsonl(filePath, payload) {
  ensureTraceDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function defaultRunId() {
  return `core-v2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveSettingsPath(workspacePath, action, options) {
  const explicit = String(action.settingsPath || options.settingsPath || '').trim();
  if (explicit) return path.resolve(explicit);
  return path.join(path.resolve(workspacePath), '.vscode', 'settings.json');
}

function executeConfigPatch(workspacePath, action, options = {}) {
  const settings = action.settings && typeof action.settings === 'object' && !Array.isArray(action.settings)
    ? action.settings
    : null;
  if (!settings) {
    throw new Error('config_patch requiere settings como objeto.');
  }
  const settingsPath = resolveSettingsPath(workspacePath, action, options);
  const allowedRoot = path.resolve(options.allowedSettingsRoot || workspacePath);
  const settingsResolved = path.resolve(settingsPath);
  const rootWithSep = allowedRoot.endsWith(path.sep) ? allowedRoot : `${allowedRoot}${path.sep}`;
  const allowOwnIde = String(options.ownIdeSettingsPath || '').trim()
    && settingsResolved === path.resolve(options.ownIdeSettingsPath);
  if (settingsResolved !== allowedRoot && !settingsResolved.startsWith(rootWithSep) && !allowOwnIde) {
    throw new Error(`config_patch bloqueado fuera del workspace/own-ide: ${settingsPath}`);
  }
  let current = {};
  if (fs.existsSync(settingsResolved)) {
    current = JSON.parse(fs.readFileSync(settingsResolved, 'utf8') || '{}');
    if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
  }
  const next = { ...current, ...settings };
  fs.mkdirSync(path.dirname(settingsResolved), { recursive: true });
  fs.writeFileSync(settingsResolved, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const readback = JSON.parse(fs.readFileSync(settingsResolved, 'utf8'));
  for (const [key, value] of Object.entries(settings)) {
    if (JSON.stringify(readback[key]) !== JSON.stringify(value)) {
      throw new Error(`config_patch readback fallo para ${key}`);
    }
  }
  return {
    path: settingsResolved,
    keys: Object.keys(settings).sort(),
    verified: true,
  };
}

function fileExistsSafe(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_) {
    return false;
  }
}

function resolvePythonBin() {
  const candidates = process.platform === 'win32'
    ? [
      ['py', ['-3', '--version']],
      ['python', ['--version']],
      ['python3', ['--version']],
    ]
    : [
      ['python3', ['--version']],
      ['python', ['--version']],
    ];
  for (const [bin, args] of candidates) {
    const probe = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true });
    if (!probe.error && probe.status === 0) return bin;
  }
  throw new Error('No se encontro Python para ejecutar skills_manager.py.');
}

function runJsonCommand(bin, args, cwd) {
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(detail || `${bin} ${args[0] || ''} fallo con codigo ${result.status}`);
  }
  try {
    return JSON.parse(String(result.stdout || 'null'));
  } catch (error) {
    throw new Error(`Salida JSON invalida (${error.message}).`);
  }
}

function resolveSkillRecord(capabilityContext, action = {}) {
  const skillId = String(action.skillId || action.name || '').trim();
  const details = Array.isArray(capabilityContext.selectedSkillDetails) ? capabilityContext.selectedSkillDetails : [];
  const record = details.find((item) => item.id === skillId);
  if (record) return record;
  if (!skillId) {
    if (details.length === 1) return details[0];
    throw new Error('skill_inspect requiere skillId cuando hay mas de una skill disponible.');
  }
  return {
    id: skillId,
    category: 'general',
    score: 0,
    gh_path: `.github/skills/${skillId}/SKILL.md`,
  };
}

function resolveRepoRelativePath(relativePath) {
  const resolved = path.resolve(REPO_ROOT, String(relativePath || '').trim());
  const rootWithSep = REPO_ROOT.endsWith(path.sep) ? REPO_ROOT : `${REPO_ROOT}${path.sep}`;
  if (resolved !== REPO_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Ruta fuera del repo bloqueada: ${relativePath}`);
  }
  return resolved;
}

function executeSkillResolve(action = {}) {
  const query = String(action.query || '').trim();
  if (!query) throw new Error('skill_resolve requiere query.');
  const managerPath = path.join(REPO_ROOT, 'skills_manager.py');
  if (!fileExistsSafe(managerPath)) {
    throw new Error(`No se encontro ${managerPath}.`);
  }
  const pythonBin = resolvePythonBin();
  const top = Math.max(1, Number(action.top || 3));
  const items = runJsonCommand(pythonBin, [managerPath, 'skill-resolve', '--query', query, '--top', String(top), '--json'], REPO_ROOT);
  return {
    query,
    total: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items) ? normalizeSkillDetails(items) : [],
  };
}

function executeSkillInspect(capabilityContext, action = {}) {
  const record = resolveSkillRecord(capabilityContext, action);
  const filePath = resolveRepoRelativePath(record.gh_path || `.github/skills/${record.id}/SKILL.md`);
  if (!fileExistsSafe(filePath)) {
    throw new Error(`SKILL.md no existe para ${record.id}: ${record.gh_path}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const maxChars = Math.max(200, Number(action.maxChars || 4000));
  return {
    skillId: record.id,
    category: record.category,
    score: record.score,
    path: path.relative(REPO_ROOT, filePath).replace(/\\/g, '/'),
    content: raw.slice(0, maxChars),
    truncated: raw.length > maxChars,
  };
}

function resolveAllowedRoots(basePolicy, workspacePath) {
  return uniqueStrings([
    path.resolve(workspacePath),
    REPO_ROOT,
    ...((Array.isArray(basePolicy.allowedFileRoots) ? basePolicy.allowedFileRoots : []).map((item) => {
      const value = String(item || '').trim();
      if (!value) return '';
      return path.resolve(path.join(path.join(REPO_ROOT, 'servidor mpc free jt7'), value));
    })),
  ]);
}

function loadLocalMcpPolicy(workspacePath) {
  const policyPath = path.join(REPO_ROOT, 'servidor mpc free jt7', 'config', 'policy.json');
  const base = JSON.parse(fs.readFileSync(policyPath, 'utf8') || '{}');
  return {
    ...base,
    allowedFileRoots: resolveAllowedRoots(base, workspacePath),
  };
}

async function getLocalMcpRuntime() {
  if (!localMcpRuntimePromise) {
    localMcpRuntimePromise = (async () => {
      const serverRoot = path.join(REPO_ROOT, 'servidor mpc free jt7');
      const documents = await import(pathToFileURL(path.join(serverRoot, 'src', 'tools', 'documents.js')).href);
      const system = await import(pathToFileURL(path.join(serverRoot, 'src', 'tools', 'system.js')).href);
      const browser = await import(pathToFileURL(path.join(serverRoot, 'src', 'tools', 'browser.js')).href);
      const desktop = await import(pathToFileURL(path.join(serverRoot, 'src', 'tools', 'desktop.js')).href);
      return {
        tools: {
          jt7_ping: {
            family: 'core',
            description: 'Verifica estado del servidor MCP local.',
            run: async () => ({ ok: true, ts: nowIso(), mode: 'core-v2-native' }),
          },
          jt7_path_stat: {
            family: 'documents',
            description: 'Inspecciona una ruta local y devuelve metadatos basicos.',
            run: async (args, policy) => documents.pathStat(args, policy),
          },
          jt7_dir_list: {
            family: 'documents',
            description: 'Lista el contenido de un directorio local.',
            run: async (args, policy) => documents.dirList(args, policy),
          },
          jt7_document_read: {
            family: 'documents',
            description: 'Lee un documento local.',
            run: async (args, policy) => documents.documentRead(args, policy),
          },
          jt7_path_search: {
            family: 'documents',
            description: 'Busca por nombre o contenido dentro de una raiz local.',
            run: async (args, policy) => documents.pathSearch(args, policy),
          },
          jt7_file_read: {
            family: 'system',
            description: 'Lee un archivo local.',
            run: async (args, policy) => system.fileRead(args, policy),
          },
          jt7_file_write: {
            family: 'system',
            description: 'Escribe un archivo local.',
            run: async (args, policy) => system.fileWrite(args, policy),
          },
          jt7_system_exec: {
            family: 'system',
            description: 'Ejecuta un comando local permitido por la politica.',
            run: async (args, policy) => system.systemExec(args, policy),
          },
          jt7_browser_open: {
            family: 'browser',
            description: 'Abre una URL permitida en navegador.',
            run: async (args, policy) => browser.browserOpen(args, policy),
          },
          jt7_browser_search: {
            family: 'browser',
            description: 'Abre una busqueda web en navegador permitido.',
            run: async (args, policy) => browser.browserSearch(args, policy),
          },
          jt7_browser_open_file: {
            family: 'browser',
            description: 'Abre un archivo local en navegador permitido.',
            run: async (args, policy) => browser.browserOpenFile(args, policy),
          },
          jt7_desktop_open: {
            family: 'desktop',
            description: 'Abre un programa de escritorio permitido.',
            run: async (args, policy) => desktop.desktopOpen(args, policy),
          },
          jt7_desktop_open_path: {
            family: 'desktop',
            description: 'Abre un archivo o carpeta local con la aplicacion del sistema.',
            run: async (args, policy) => desktop.desktopOpenPath(args, policy),
          },
          jt7_desktop_reveal_path: {
            family: 'desktop',
            description: 'Revela un archivo o carpeta local en el explorador del sistema.',
            run: async (args, policy) => desktop.desktopRevealPath(args, policy),
          },
        },
      };
    })();
  }
  return localMcpRuntimePromise;
}

async function executeSubagentRun(context, output, workspacePath, action = {}, options = {}) {
  const parentDepth = Math.max(0, Number(options.subagentDepth || 0));
  const maxDepth = Math.max(1, Number(options.maxSubagentDepth || 2));
  if (parentDepth >= maxDepth) {
    throw new Error(`subagent_run excede profundidad maxima (${maxDepth}).`);
  }
  const goal = String(action.goal || action.prompt || '').trim();
  if (!goal) throw new Error('subagent_run requiere goal.');
  const subagentIndex = Math.max(1, Number(options.subagentCounter || 1));
  const subagentId = String(action.subagentName || action.name || `subagent-${subagentIndex}`).trim() || `subagent-${subagentIndex}`;
  const runId = `${String(options.runId || defaultRunId())}-sub-${subagentIndex}`;
  const childCore = createFreeJt7AgentCoreV2({
    callProvider: options.callProvider,
    maxIterations: action.maxIterations || options.maxIterations,
    maxActions: action.maxActions || options.maxActions,
    maxSubagentDepth: maxDepth,
  });
  const childResult = await childCore.executeTask(context, output, {
    ...options.baseInput,
    goal,
    workspacePath,
    provider: String(action.provider || options.provider || '').trim(),
    model: String(action.model || options.model || '').trim(),
    authProfile: String(action.authProfile || options.authProfile || 'default').trim() || 'default',
    runId,
    runtimeBackend: 'freejt7-v2',
    selectedSkills: Array.isArray(action.selectedSkills) && action.selectedSkills.length
      ? action.selectedSkills
      : options.selectedSkills,
    capabilityPlan: action.capabilityPlan && typeof action.capabilityPlan === 'object'
      ? action.capabilityPlan
      : options.capabilityPlan,
    ownIdeSettingsPath: options.ownIdeSettingsPath,
    allowedSettingsRoot: options.allowedSettingsRoot || workspacePath,
    subagentDepth: parentDepth + 1,
    parentRunId: options.runId,
    parentGoal: options.goal,
  });
  return {
    subagentId,
    goal,
    runId: childResult?.coreV2?.runId || runId,
    tracePath: childResult?.coreV2?.tracePath || '',
    status: childResult?.final?.status || childResult?.run?.status || 'completed',
    summary: String(childResult?.final?.summary || childResult?.run?.summary || '').trim(),
    iterations: Number(childResult?.coreV2?.iterations || 0),
    changedFiles: Array.isArray(childResult?.final?.changedFiles) ? childResult.final.changedFiles.slice() : [],
    verification: Array.isArray(childResult?.final?.verification) ? childResult.final.verification.slice(0, 8) : [],
  };
}

function resolveActionPath(workspacePath, rawPath, fallback = '') {
  const candidate = String(rawPath || fallback || '').trim();
  if (!candidate) return '';
  if (path.isAbsolute(candidate)) return path.resolve(candidate);
  return path.resolve(workspacePath, candidate);
}

function deriveMcpArguments(workspacePath, toolName, action = {}) {
  if (action.arguments && typeof action.arguments === 'object' && !Array.isArray(action.arguments)) {
    return { ...action.arguments };
  }
  if (toolName === 'jt7_path_stat') {
    return { targetPath: resolveActionPath(workspacePath, action.targetPath || action.path, '.') };
  }
  if (toolName === 'jt7_dir_list') {
    return {
      dirPath: resolveActionPath(workspacePath, action.dirPath || action.path, '.'),
      recursive: Boolean(action.recursive),
    };
  }
  if (toolName === 'jt7_document_read') {
    return {
      filePath: resolveActionPath(workspacePath, action.filePath || action.path),
      maxChars: action.maxChars !== undefined ? Number(action.maxChars) : undefined,
    };
  }
  if (toolName === 'jt7_path_search') {
    return {
      rootPath: resolveActionPath(workspacePath, action.rootPath || action.path, '.'),
      query: String(action.query || '').trim(),
      mode: String(action.mode || 'content').trim() || 'content',
      maxResults: action.maxResults !== undefined ? Number(action.maxResults) : undefined,
    };
  }
  if (toolName === 'jt7_file_read') {
    return {
      filePath: resolveActionPath(workspacePath, action.filePath || action.path),
      maxBytes: action.maxBytes !== undefined ? Number(action.maxBytes) : undefined,
    };
  }
  if (toolName === 'jt7_file_write') {
    return {
      filePath: resolveActionPath(workspacePath, action.filePath || action.path),
      content: String(action.content ?? ''),
      overwrite: true,
    };
  }
  if (toolName === 'jt7_system_exec') {
    return {
      command: String(action.command || '').trim(),
      args: Array.isArray(action.args) ? action.args.map((item) => String(item)) : [],
      cwd: resolveActionPath(workspacePath, action.dirPath || action.path, workspacePath),
      timeoutMs: action.timeoutMs !== undefined ? Number(action.timeoutMs) : undefined,
    };
  }
  return {};
}

function resolveMcpServer(capabilityContext, action = {}) {
  const preferred = String(action.serverId || '').trim()
    || capabilityContext.mcpServers.find((item) => item.enabled !== false)?.id
    || LOCAL_MCP_SERVER_ID;
  if (preferred !== LOCAL_MCP_SERVER_ID) {
    throw new Error(`Servidor MCP no soportado nativamente por core-v2: ${preferred}`);
  }
  return preferred;
}

async function executeMcpListTools(workspacePath, capabilityContext, action = {}) {
  const serverId = resolveMcpServer(capabilityContext, action);
  const runtime = await getLocalMcpRuntime();
  const tools = Object.entries(runtime.tools).map(([name, spec]) => ({
    name,
    family: spec.family,
    description: spec.description,
  }));
  return {
    serverId,
    total: tools.length,
    tools,
    allowedRoots: resolveAllowedRoots(loadLocalMcpPolicy(workspacePath), workspacePath),
  };
}

async function executeMcpCall(workspacePath, capabilityContext, action = {}) {
  const serverId = resolveMcpServer(capabilityContext, action);
  const toolName = String(action.toolName || action.mcpTool || action.name || '').trim();
  if (!toolName) throw new Error('mcp_call requiere toolName.');
  const runtime = await getLocalMcpRuntime();
  const spec = runtime.tools[toolName];
  if (!spec) {
    throw new Error(`Tool MCP no soportada nativamente: ${toolName}`);
  }
  const policy = loadLocalMcpPolicy(workspacePath);
  const args = deriveMcpArguments(workspacePath, toolName, action);
  const result = await spec.run(args, policy);
  return {
    serverId,
    toolName,
    family: spec.family,
    arguments: args,
    result,
  };
}

async function executeActions(workspacePath, actions, options = {}) {
  const localActions = [];
  const configPatches = [];
  const skillActions = [];
  const mcpActions = [];
  const subagentActions = [];
  const unsupported = [];
  for (const action of actions) {
    if (action.unsupported) {
      unsupported.push({ type: action.type, error: `Tool no soportada por core-v2: ${action.type}` });
    } else if (action.type === 'config_patch') {
      configPatches.push(action);
    } else if (action.type === 'skill_resolve' || action.type === 'skill_inspect') {
      skillActions.push(action);
    } else if (action.type === 'mcp_list_tools' || action.type === 'mcp_call') {
      mcpActions.push(action);
    } else if (action.type === 'subagent_run') {
      subagentActions.push(action);
    } else {
      localActions.push(action);
    }
  }
  const local = executeLocalActions(workspacePath, { actions: localActions });
  const skillResults = [];
  const mcpResults = [];
  const subagentResults = [];
  const configResults = [];
  const failures = [...(Array.isArray(local.failures) ? local.failures : []), ...unsupported];
  for (const action of skillActions) {
    try {
      skillResults.push(action.type === 'skill_resolve'
        ? executeSkillResolve(action)
        : executeSkillInspect(options.capabilityContext || {}, action));
    } catch (error) {
      failures.push({
        type: action.type,
        skillId: String(action.skillId || action.name || ''),
        error: String(error?.message || error),
      });
    }
  }
  for (const action of mcpActions) {
    try {
      mcpResults.push(action.type === 'mcp_list_tools'
        ? await executeMcpListTools(workspacePath, options.capabilityContext || {}, action)
        : await executeMcpCall(workspacePath, options.capabilityContext || {}, action));
    } catch (error) {
      failures.push({
        type: action.type,
        toolName: String(action.toolName || action.mcpTool || action.name || ''),
        error: String(error?.message || error),
      });
    }
  }
  for (const [index, action] of subagentActions.entries()) {
    try {
      subagentResults.push(await executeSubagentRun(
        options.context,
        options.output,
        workspacePath,
        action,
        {
          baseInput: options.baseInput || {},
          runId: options.runId,
          goal: options.goal,
          provider: options.provider,
          model: options.model,
          authProfile: options.authProfile,
          selectedSkills: options.selectedSkills,
          capabilityPlan: options.capabilityPlan,
          ownIdeSettingsPath: options.ownIdeSettingsPath,
          allowedSettingsRoot: options.allowedSettingsRoot || workspacePath,
          callProvider: options.callProvider,
          subagentDepth: options.subagentDepth || 0,
          maxSubagentDepth: options.maxSubagentDepth || 2,
          subagentCounter: (options.subagentCounterBase || 0) + index + 1,
          maxIterations: options.maxIterations,
          maxActions: options.maxActions,
        },
      ));
    } catch (error) {
      failures.push({
        type: action.type,
        goal: String(action.goal || action.prompt || ''),
        error: String(error?.message || error),
      });
    }
  }
  for (const action of configPatches) {
    try {
      configResults.push(executeConfigPatch(workspacePath, action, options));
    } catch (error) {
      failures.push({ type: 'config_patch', path: String(action.settingsPath || ''), error: String(error?.message || error) });
    }
  }
  return {
    ...local,
    skillResults,
    mcpResults,
    subagentResults,
    configPatches: configResults,
    failures,
  };
}

function summarizeResultSet(results) {
  const evidence = [];
  for (const item of results.reads || []) evidence.push(`read ${item.path} bytes=${item.bytes}${item.truncated ? ' truncated' : ''}`);
  for (const item of results.writes || []) evidence.push(`write ${item.path} bytes=${item.bytes} verified=${item.verified}`);
  for (const item of results.dirActions || []) evidence.push(`mkdir ${item.path} created=${item.created} verified=${item.verified}`);
  for (const item of results.deleteActions || []) evidence.push(`delete ${item.path} removed=${item.removed} missing=${item.missing}`);
  for (const item of results.inspections || []) evidence.push(`inspect ${item.path} exists=${item.exists} kind=${item.kind}`);
  for (const item of results.execResults || []) evidence.push(`exec ${item.command} exit=${item.exitCode}${item.blocked ? ' blocked' : ''}: ${truncate(item.output, 300)}`);
  for (const item of results.verificationResults || []) evidence.push(`verify ${item.command} exit=${item.exitCode}${item.blocked ? ' blocked' : ''}: ${truncate(item.output, 300)}`);
  for (const item of results.systemActions || []) evidence.push(`system_install ${item.package} status=${item.status}${item.exitCode !== undefined ? ` exit=${item.exitCode}` : ''}`);
  for (const item of results.configPatches || []) evidence.push(`config_patch ${item.path} keys=${item.keys.join(',')} verified=${item.verified}`);
  for (const item of results.skillResults || []) {
    if (item.query) evidence.push(`skill_resolve query=${item.query} total=${item.total} ids=${(item.items || []).slice(0, 3).map((entry) => entry.id).join(',')}`);
    else evidence.push(`skill_inspect ${item.skillId} path=${item.path} truncated=${item.truncated}`);
  }
  for (const item of results.mcpResults || []) {
    if (item.tools) evidence.push(`mcp_list_tools ${item.serverId} total=${item.total} names=${item.tools.slice(0, 5).map((tool) => tool.name).join(',')}`);
    else evidence.push(`mcp_call ${item.serverId}/${item.toolName} ok=${item.result && item.result.ok !== false}`);
  }
  for (const item of results.subagentResults || []) {
    evidence.push(`subagent_run ${item.subagentId} status=${item.status} iterations=${item.iterations} trace=${item.tracePath}`);
  }
  for (const item of results.failures || []) evidence.push(`failure ${item.type || 'unknown'} ${item.path || ''}: ${item.error || 'error'}`.trim());
  return evidence;
}

function changedFilesFromResults(results) {
  return [
    ...(results.writes || []).map((item) => item.path),
    ...(results.dirActions || []).map((item) => item.path),
    ...(results.deleteActions || []).map((item) => item.path),
    ...(results.configPatches || []).map((item) => item.path),
    ...(results.mcpResults || [])
      .filter((item) => item && item.toolName === 'jt7_file_write' && item.result && item.result.filePath)
      .map((item) => item.result.filePath),
    ...(results.subagentResults || []).flatMap((item) => Array.isArray(item.changedFiles) ? item.changedFiles : []),
  ].filter(Boolean);
}

function buildDeterministicActions(goal, workspacePath, options) {
  const actions = deriveLocalActions(goal, {
    workspacePath,
    provider: options.provider,
    model: options.model,
    runtimeBackend: 'freejt7-v2',
  });
  return normalizeActions(actions, DEFAULT_MAX_ACTIONS);
}

function summarizeCapabilityContext(capabilityContext = {}) {
  const pieces = [];
  if (capabilityContext.toolMode) pieces.push(`toolMode=${capabilityContext.toolMode}`);
  if (capabilityContext.selectedSkills.length) pieces.push(`skills=${capabilityContext.selectedSkills.join(',')}`);
  if (capabilityContext.mcpServers.length) pieces.push(`mcp=${capabilityContext.mcpServers.map((item) => item.id).join(',')}`);
  if (capabilityContext.nativeMcpTools.length) pieces.push(`mcpTools=${capabilityContext.nativeMcpTools.map((item) => item.family).join(',')}`);
  if (capabilityContext.dispatchTarget) pieces.push(`dispatch=${capabilityContext.dispatchTarget}`);
  return pieces.join(' | ');
}

function collectSubagentRuns(steps = []) {
  const runs = [];
  for (const step of Array.isArray(steps) ? steps : []) {
    for (const item of Array.isArray(step.subagentResults) ? step.subagentResults : []) {
      if (item && typeof item === 'object') runs.push({ ...item });
    }
  }
  return runs;
}

function hasActionableStepEvidence(steps = []) {
  return (Array.isArray(steps) ? steps : []).some((step) => Array.isArray(step?.evidence) && step.evidence.length > 0);
}

function hasCompletionEvidence({ steps = [], changedFiles = new Set(), requiresTools = false } = {}) {
  if (changedFiles instanceof Set && changedFiles.size > 0) {
    return true;
  }
  if (hasActionableStepEvidence(steps)) {
    return true;
  }
  return !requiresTools;
}

function createFreeJt7AgentCoreV2(options = {}) {
  const callProvider = options.callProvider;
  if (typeof callProvider !== 'function') {
    throw new Error('createFreeJt7AgentCoreV2 requiere callProvider().');
  }
  const maxIterations = Math.max(1, Number(options.maxIterations || DEFAULT_MAX_ITERATIONS));
  const maxActions = Math.max(1, Number(options.maxActions || DEFAULT_MAX_ACTIONS));
  const maxSubagentDepth = Math.max(1, Number(options.maxSubagentDepth || 2));

  async function callPlanner(context, state) {
    const prompt = buildPlannerPrompt(state);
    const response = await callProvider(
      prompt,
      { provider: state.provider, model: state.model, authProfile: state.authProfile },
      context?.secrets,
      { workspacePath: state.workspacePath, model: state.model, authProfile: state.authProfile },
    );
    const text = extractProviderText(response);
    const parsed = parsePlannerJson(text);
    if (!parsed.ok) {
      return {
        status: 'needs_action',
        summary: 'El planner no devolvio JSON valido; core-v2 ejecutara acciones deterministas y reintentara.',
        reasoning: parsed.error,
        actions: state.iteration === 1 ? state.deterministicActions : [],
        rawText: text,
        parseError: parsed.error,
      };
    }
    const value = parsed.value;
    return {
      status: String(value.status || '').trim().toLowerCase() || 'needs_action',
      summary: String(value.summary || value.answer || '').trim(),
      reasoning: String(value.reasoning || '').trim(),
      actions: normalizeActions(value.actions, maxActions),
      rawText: text,
      parseError: '',
    };
  }

  async function executeTask(context, output, input = {}) {
    const workspacePath = path.resolve(String(input.workspacePath || process.cwd()).trim() || process.cwd());
    const goal = String(input.goal || input.prompt || '').trim();
    const provider = String(input.provider || '').trim();
    const model = String(input.model || '').trim();
    const authProfile = String(input.authProfile || 'default').trim() || 'default';
    if (!goal) throw new Error('freejt7-agent-core-v2 requiere goal no vacio.');
    if (!provider || provider === 'copilot') throw new Error('freejt7-agent-core-v2 requiere proveedor externo valido.');

    const runId = String(input.runId || input.taskId || defaultRunId()).replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 120);
    const tracePath = path.resolve(input.tracePath || path.join(workspacePath, DEFAULT_TRACE_FILE));
    const workspace = listWorkspace(workspacePath);
    const packageSummary = readPackageSummary(workspacePath);
    const deterministicActions = buildDeterministicActions(goal, workspacePath, { provider, model });
    const capabilityContext = normalizeCapabilityContext(input);
    const steps = [];
    const changedFiles = new Set();
    const verification = [`CoreV2: ${CORE_VERSION} activado run=${runId}.`];
    const capabilitySummary = summarizeCapabilityContext(capabilityContext);
    if (capabilitySummary) {
      verification.push(`CoreV2: capability-context ${capabilitySummary}.`);
    }
    const requiresTools = operationalGoal(goal);
    let finalSummary = '';
    let finalStatus = 'completed';

    appendJsonl(tracePath, {
      ts: nowIso(),
      event: 'run.start',
      runId,
      core: CORE_VERSION,
      goal,
      workspacePath,
      provider,
      model,
      capabilityContext,
    });

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const planner = await callPlanner(context, {
        runId,
        goal,
        workspacePath,
        provider,
        model,
        authProfile,
        workspace,
        packageSummary,
        capabilityContext,
        deterministicActions,
        steps,
        iteration,
        maxIterations,
      });

      let actions = planner.actions;
      if (requiresTools && steps.length === 0 && actions.length === 0) {
        actions = deterministicActions.length ? deterministicActions : [{ type: 'inspect_path', path: '.' }];
      }
      const cannotCompleteYet = requiresTools && steps.length === 0 && planner.status === 'completed';
      if (planner.status === 'completed' && !cannotCompleteYet && actions.length === 0) {
        finalSummary = planner.summary || 'Tarea completada con evidencia previa.';
        appendJsonl(tracePath, { ts: nowIso(), event: 'planner.completed', runId, iteration, summary: finalSummary });
        break;
      }
      if (!actions.length) {
        const completedWithoutEvidence = requiresTools && !hasCompletionEvidence({ steps, changedFiles, requiresTools });
        finalSummary = completedWithoutEvidence
          ? (planner.summary || 'Core-v2 no pudo demostrar trabajo ejecutable ni evidencia verificable para cerrar la tarea.')
          : (planner.summary || 'Core-v2 no encontro acciones adicionales ejecutables.');
        finalStatus = (planner.status === 'failed' || completedWithoutEvidence) ? 'failed' : 'completed';
        appendJsonl(tracePath, { ts: nowIso(), event: 'planner.no_actions', runId, iteration, status: planner.status, summary: finalSummary });
        break;
      }

      output?.appendLine?.(`[freejt7-core-v2] iteracion ${iteration}/${maxIterations} actions=${actions.map((item) => item.type).join(',')}`);
      const results = await executeActions(workspacePath, actions, {
        context,
        output,
        baseInput: { ...input },
        runId,
        goal,
        provider,
        model,
        authProfile,
        selectedSkills: input.selectedSkills,
        capabilityPlan: input.capabilityPlan,
        callProvider,
        subagentDepth: Number(input.subagentDepth || 0),
        maxSubagentDepth,
        subagentCounterBase: steps.reduce((count, step) => count + (Array.isArray(step.subagentResults) ? step.subagentResults.length : 0), 0),
        maxIterations,
        maxActions,
        settingsPath: input.settingsPath,
        ownIdeSettingsPath: input.ownIdeSettingsPath,
        allowedSettingsRoot: input.allowedSettingsRoot || workspacePath,
        capabilityContext,
      });
      const evidence = summarizeResultSet(results);
      const failures = (results.failures || []).map((item) => `${item.type || 'unknown'}:${item.error || 'error'}`);
      for (const filePath of changedFilesFromResults(results)) changedFiles.add(filePath);
      verification.push(...evidence.map((item) => `CoreV2: ${item}.`));
      steps.push({
        iteration,
        status: planner.status || 'needs_action',
        summary: planner.summary,
        reasoning: planner.reasoning,
        actions,
        evidence,
        subagentResults: Array.isArray(results.subagentResults) ? results.subagentResults.map((item) => ({ ...item })) : [],
        failures,
      });
      appendJsonl(tracePath, {
        ts: nowIso(),
        event: 'step',
        runId,
        iteration,
        planner: {
          status: planner.status,
          summary: planner.summary,
          reasoning: planner.reasoning,
          parseError: planner.parseError,
        },
        actions,
        evidence,
        failures,
      });
      if (planner.status === 'failed' && failures.length > 0) {
        finalStatus = 'failed';
      }
      if (iteration === maxIterations) {
        finalSummary = planner.summary || 'Core-v2 alcanzo el limite de iteraciones con acciones ejecutadas.';
      }
    }

    if (!finalSummary) {
      const last = steps[steps.length - 1];
      finalSummary = last?.summary || 'Core-v2 ejecuto el loop agentico con tools reales.';
    }
    if (finalStatus === 'completed' && !hasCompletionEvidence({ steps, changedFiles, requiresTools })) {
      finalStatus = 'failed';
      finalSummary = 'Core-v2 rechazo el cierre porque no encontro evidencia accionable suficiente para sostener la respuesta.';
    }
    const summary = [
      finalSummary,
      steps.length ? `Iteraciones core-v2: ${steps.length}.` : '',
      collectSubagentRuns(steps).length ? `Subagentes: ${collectSubagentRuns(steps).length}.` : '',
      changedFiles.size ? `Cambios: ${Array.from(changedFiles).join(', ')}.` : '',
      `Traza: ${tracePath}.`,
    ].filter(Boolean).join('\n\n');
    appendJsonl(tracePath, {
      ts: nowIso(),
      event: 'run.end',
      runId,
      status: finalStatus,
      changedFiles: Array.from(changedFiles),
      summary,
    });

    return {
      provider,
      model,
      executionMode: 'agent',
      executionRoute: 'freejt7-agent-core-v2',
      coreV2: {
        version: CORE_VERSION,
        runId,
        tracePath,
        iterations: steps.length,
        steps,
        subagents: collectSubagentRuns(steps),
        toolRegistry: buildToolCatalog(),
        capabilities: capabilityContext,
      },
      run: {
        status: finalStatus,
        summary,
        provider,
        model,
      },
      final: {
        status: finalStatus,
        summary,
        changedFiles: Array.from(changedFiles),
        verification,
        residualRisks: [],
      },
    };
  }

  return { executeTask };
}

module.exports = {
  CORE_VERSION,
  TOOL_REGISTRY,
  createFreeJt7AgentCoreV2,
  parsePlannerJson,
  normalizeActions,
  operationalGoal,
  __testing: {
    summarizeResultSet,
    changedFilesFromResults,
    hasCompletionEvidence,
  },
};
