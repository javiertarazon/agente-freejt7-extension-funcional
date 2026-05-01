'use strict';

const fs = require('fs');
const path = require('path');

const MAX_ITERATIONS = 6;
const MAX_ACTIONS_PER_STEP = 3;
const MAX_TOOL_CONTEXT_CHARS = 12_000;
const MAX_TOOL_OUTPUT_CHARS = 3_000;

const TOOL_DEFINITIONS = Object.freeze([
  { type: 'read', required: ['path'], description: 'Lee un archivo del workspace o una ruta absoluta permitida.' },
  { type: 'write', required: ['path', 'content'], description: 'Escribe o reemplaza por completo un archivo.' },
  { type: 'mkdir', required: ['path'], description: 'Crea un directorio.' },
  { type: 'delete', required: ['path'], description: 'Borra un archivo o directorio.' },
  { type: 'inspect_path', required: ['path'], description: 'Inspecciona si una ruta existe y lista entradas si es directorio.' },
  { type: 'exec', required: ['commandLine'], description: 'Ejecuta un comando shell permitido desde el workspace.' },
  { type: 'verify', required: ['command'], description: 'Ejecuta una verificacion segura (`git`, `node`, `npm`).' },
  { type: 'system_install', required: ['package'], description: 'Instala un paquete de sistema soportado, por ahora `git`.' },
]);

function truncate(text, max = MAX_TOOL_OUTPUT_CHARS) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}\n...<truncated>` : value;
}

function stripCodeFence(text) {
  const source = String(text || '').trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? String(fenced[1] || '').trim() : source;
}

function extractFirstJsonObject(text) {
  const source = stripCodeFence(text);
  const firstBrace = source.indexOf('{');
  if (firstBrace < 0) {
    return '';
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = firstBrace; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(firstBrace, index + 1);
      }
    }
  }
  return '';
}

function normalizeActionType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (!value) return '';
  if (['read', 'readfile', 'file_read'].includes(value)) return 'read';
  if (['write', 'writefile', 'file_write'].includes(value)) return 'write';
  if (['mkdir', 'create_dir', 'create_directory'].includes(value)) return 'mkdir';
  if (['delete', 'remove', 'rm', 'delete_path'].includes(value)) return 'delete';
  if (['inspect_path', 'list_path', 'stat_path', 'inspect', 'ls'].includes(value)) return 'inspect_path';
  if (['exec', 'bash', 'shell', 'command'].includes(value)) return 'exec';
  if (['verify', 'verification'].includes(value)) return 'verify';
  if (['system_install', 'install_package'].includes(value)) return 'system_install';
  return value;
}

function normalizePlannerActions(actions) {
  const list = Array.isArray(actions) ? actions : [];
  return list
    .slice(0, MAX_ACTIONS_PER_STEP)
    .map((action) => {
      if (!action || typeof action !== 'object') return null;
      const type = normalizeActionType(action.type || action.kind);
      if (!type) return null;
      const normalized = { type };
      if (action.path !== undefined) normalized.path = String(action.path);
      if (action.filePath !== undefined && normalized.path === undefined) normalized.path = String(action.filePath);
      if (action.dirPath !== undefined && normalized.path === undefined) normalized.path = String(action.dirPath);
      if (action.content !== undefined) normalized.content = String(action.content);
      if (action.command !== undefined) normalized.command = String(action.command);
      if (action.commandLine !== undefined) normalized.commandLine = String(action.commandLine);
      if (Array.isArray(action.args)) normalized.args = action.args.map((item) => String(item));
      if (action.package !== undefined) normalized.package = String(action.package);
      if (action.allowAbsolute !== undefined) normalized.allowAbsolute = Boolean(action.allowAbsolute);
      if (action.recursive !== undefined) normalized.recursive = Boolean(action.recursive);
      if (action.timeoutMs !== undefined) normalized.timeoutMs = Number(action.timeoutMs) || 30_000;
      return normalized;
    })
    .filter(Boolean);
}

function parsePlannerResponse(text) {
  const jsonText = extractFirstJsonObject(text);
  if (!jsonText) {
    return { ok: false, error: 'No se encontro un objeto JSON en la respuesta del planner.' };
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'El planner devolvio un JSON no compatible.' };
    }
    const actions = normalizePlannerActions(parsed.actions);
    const status = String(parsed.status || '').trim().toLowerCase();
    return {
      ok: true,
      value: {
        status: status || (actions.length > 0 ? 'needs_action' : 'completed'),
        summary: String(parsed.summary || parsed.answer || parsed.final_answer || '').trim(),
        reasoning: String(parsed.reasoning || parsed.rationale || '').trim(),
        actions,
        raw: parsed,
      },
    };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
}

function listWorkspace(workspacePath, maxEntries = 40) {
  const root = path.resolve(workspacePath || process.cwd());
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => !['.git', 'node_modules', 'dist'].includes(entry.name))
      .slice(0, maxEntries)
      .map((entry) => `${entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other'}:${entry.name}`);
    return { root, entries };
  } catch (error) {
    return { root, entries: [], error: String(error && error.message ? error.message : error) };
  }
}

function readPackageSummary(workspacePath) {
  const packagePath = path.join(path.resolve(workspacePath || process.cwd()), 'package.json');
  try {
    if (!fs.existsSync(packagePath)) return null;
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return {
      name: pkg.name || '',
      version: pkg.version || '',
      scripts: Object.keys(pkg.scripts || {}).sort(),
    };
  } catch (error) {
    return { error: String(error && error.message ? error.message : error) };
  }
}

function summarizeRead(read) {
  const firstLine = String(read?.content || '').split(/\r?\n/).find((line) => String(line).trim()) || '';
  return `read ${read.path} bytes=${read.bytes}${read.truncated ? ' truncated' : ''}: ${truncate(firstLine || 'sin contenido visible', 200)}`;
}

function summarizeWrite(write) {
  return `write ${write.path} bytes=${write.bytes} created=${write.created} verified=${write.verified}`;
}

function summarizeDir(dirAction) {
  return `mkdir ${dirAction.path} created=${dirAction.created} verified=${dirAction.verified}`;
}

function summarizeDelete(deleteAction) {
  return `delete ${deleteAction.path} removed=${deleteAction.removed} missing=${deleteAction.missing} kind=${deleteAction.kind}`;
}

function summarizeInspect(inspection) {
  const entries = Array.isArray(inspection.entries) ? inspection.entries.slice(0, 8).join(', ') : '';
  return `inspect ${inspection.path} exists=${inspection.exists} kind=${inspection.kind}${entries ? ` entries=${entries}` : ''}`;
}

function summarizeCommand(result, label) {
  const headline = String(result.output || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || 'sin salida';
  return `${label} ${result.command}${result.blocked ? ' blocked' : ''} exit=${result.exitCode}: ${truncate(headline, 220)}`;
}

function summarizeSystem(result) {
  const headline = String(result.output || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || 'sin salida';
  return `system_install ${result.package} status=${result.status}${result.exitCode !== undefined ? ` exit=${result.exitCode}` : ''}: ${truncate(headline, 220)}`;
}

function summarizeFailures(failures) {
  return (Array.isArray(failures) ? failures : [])
    .map((failure) => `${failure.type || 'unknown'} ${failure.path || ''}: ${failure.error || 'error'}`.trim());
}

function summarizeToolResults(results = {}) {
  const lines = [];
  for (const item of Array.isArray(results.reads) ? results.reads : []) lines.push(summarizeRead(item));
  for (const item of Array.isArray(results.writes) ? results.writes : []) lines.push(summarizeWrite(item));
  for (const item of Array.isArray(results.dirActions) ? results.dirActions : []) lines.push(summarizeDir(item));
  for (const item of Array.isArray(results.deleteActions) ? results.deleteActions : []) lines.push(summarizeDelete(item));
  for (const item of Array.isArray(results.inspections) ? results.inspections : []) lines.push(summarizeInspect(item));
  for (const item of Array.isArray(results.verificationResults) ? results.verificationResults : []) lines.push(summarizeCommand(item, 'verify'));
  for (const item of Array.isArray(results.execResults) ? results.execResults : []) lines.push(summarizeCommand(item, 'exec'));
  for (const item of Array.isArray(results.systemActions) ? results.systemActions : []) lines.push(summarizeSystem(item));
  for (const item of summarizeFailures(results.failures)) lines.push(`failure ${item}`);
  return lines;
}

function collectChangedFiles(results = {}) {
  return [
    ...(Array.isArray(results.writes) ? results.writes.map((item) => item.path) : []),
    ...(Array.isArray(results.dirActions) ? results.dirActions.map((item) => item.path) : []),
    ...(Array.isArray(results.deleteActions) ? results.deleteActions.map((item) => item.path) : []),
  ].filter(Boolean);
}

function buildVerificationLines(results = {}) {
  const lines = [];
  for (const item of Array.isArray(results.reads) ? results.reads : []) lines.push(`OwnedRuntime: lectura ${item.path}${item.truncated ? ' truncada' : ''}.`);
  for (const item of Array.isArray(results.writes) ? results.writes : []) lines.push(`OwnedRuntime: escritura ${item.path} verificada por readback.`);
  for (const item of Array.isArray(results.dirActions) ? results.dirActions : []) lines.push(`OwnedRuntime: directorio ${item.path} creado=${item.created}.`);
  for (const item of Array.isArray(results.deleteActions) ? results.deleteActions : []) lines.push(`OwnedRuntime: borrado ${item.path} removed=${item.removed} missing=${item.missing}.`);
  for (const item of Array.isArray(results.inspections) ? results.inspections : []) lines.push(`OwnedRuntime: inspeccion ${item.path} exists=${item.exists} kind=${item.kind}.`);
  for (const item of Array.isArray(results.verificationResults) ? results.verificationResults : []) lines.push(`OwnedRuntime: verify ${item.command} exit=${item.exitCode}${item.blocked ? ' blocked' : ''}.`);
  for (const item of Array.isArray(results.execResults) ? results.execResults : []) lines.push(`OwnedRuntime: exec ${item.command} exit=${item.exitCode}${item.blocked ? ' blocked' : ''}.`);
  for (const item of Array.isArray(results.systemActions) ? results.systemActions : []) lines.push(`OwnedRuntime: system_install ${item.package} status=${item.status}${item.exitCode !== undefined ? ` exit=${item.exitCode}` : ''}.`);
  for (const item of summarizeFailures(results.failures)) lines.push(`OwnedRuntime: failure ${item}.`);
  return lines;
}

function sanitizeStepSummaries(stepSummaries = []) {
  return stepSummaries
    .slice(-4)
    .map((step) => ({
      iteration: step.iteration,
      planner: {
        status: step.planner.status,
        summary: truncate(step.planner.summary || '', 500),
        reasoning: truncate(step.planner.reasoning || '', 500),
      },
      actions: step.actions,
      toolResults: step.toolResults.slice(0, 12).map((entry) => truncate(entry, 400)),
    }));
}

function buildPlannerPrompt(state = {}) {
  const toolCatalog = TOOL_DEFINITIONS.map((tool) => ({
    type: tool.type,
    required: tool.required,
    description: tool.description,
  }));
  return [
    'Eres el backend propio agentico de Free JT7.',
    'Debes responder SOLO con un objeto JSON valido. Sin markdown, sin comentarios y sin texto adicional.',
    'Tu trabajo es decidir acciones reales del agente, no escribir una respuesta de chat si aun falta evidencia o ejecucion.',
    'Si necesitas mas informacion o debes operar el workspace, devuelve status="needs_action" y usa actions.',
    'Si la tarea ya quedo resuelta con evidencia suficiente, devuelve status="completed" y un summary final breve.',
    'Nunca afirmes que editaste, ejecutaste o verificaste algo si no aparece en toolResults previos o en actions de esta iteracion.',
    `Maximo ${MAX_ACTIONS_PER_STEP} actions por iteracion.`,
    '',
    'Schema JSON obligatorio:',
    '{"status":"needs_action|completed|failed","summary":"texto corto en espanol","reasoning":"opcional","actions":[{"type":"read|write|mkdir|delete|inspect_path|exec|verify|system_install", "...":"..."}]}',
    '',
    `Goal: ${state.goal}`,
    `Workspace root: ${state.workspacePath}`,
    `Iteracion: ${state.iteration}/${state.maxIterations}`,
    '',
    'Workspace snapshot:',
    JSON.stringify({
      root: state.workspace.root,
      entries: state.workspace.entries,
      packageSummary: state.packageSummary,
      suggestedDeterministicActions: state.heuristicActions,
      availableTools: toolCatalog,
      previousSteps: sanitizeStepSummaries(state.stepSummaries),
    }, null, 2),
    '',
    'Responde SOLO JSON valido.',
  ].join('\n');
}

function buildRepairPrompt(state = {}, invalidResponse = '') {
  return [
    'Corrige la respuesta anterior y devuelve SOLO JSON valido.',
    'No expliques nada. No uses markdown.',
    '',
    `Goal: ${state.goal}`,
    '',
    'Respuesta invalida anterior:',
    truncate(invalidResponse, 6000),
    '',
    'Schema JSON obligatorio:',
    '{"status":"needs_action|completed|failed","summary":"texto corto en espanol","reasoning":"opcional","actions":[{"type":"read|write|mkdir|delete|inspect_path|exec|verify|system_install", "...":"..."}]}',
  ].join('\n');
}

function extractProviderSummary(response) {
  return String(
    response?.final?.summary
    || response?.run?.summary
    || response?.summary
    || ''
  ).trim();
}

function normalizePlannerOutcome(parsed = {}) {
  const actions = normalizePlannerActions(parsed.actions);
  const status = String(parsed.status || '').trim().toLowerCase();
  return {
    status: status || (actions.length > 0 ? 'needs_action' : 'completed'),
    summary: String(parsed.summary || '').trim(),
    reasoning: String(parsed.reasoning || '').trim(),
    actions,
  };
}

function createFreeJt7OwnedRuntime(options = {}) {
  const callProvider = options.callProvider;
  const executeLocalActions = options.executeLocalActions;
  const getWorkspaceSnapshot = typeof options.listWorkspace === 'function' ? options.listWorkspace : listWorkspace;
  const getPackageSummary = typeof options.readPackageSummary === 'function' ? options.readPackageSummary : readPackageSummary;
  const deriveLocalActions = typeof options.deriveLocalActions === 'function' ? options.deriveLocalActions : (() => []);
  const maxIterations = Math.max(1, Number(options.maxIterations || MAX_ITERATIONS));

  if (typeof callProvider !== 'function') {
    throw new Error('createFreeJt7OwnedRuntime requiere callProvider().');
  }
  if (typeof executeLocalActions !== 'function') {
    throw new Error('createFreeJt7OwnedRuntime requiere executeLocalActions().');
  }

  async function callPlanner(context, output, state, invalidResponse = '') {
    const prompt = invalidResponse
      ? buildRepairPrompt(state, invalidResponse)
      : buildPlannerPrompt(state);
    const response = await callProvider(
      prompt,
      {
        provider: state.provider,
        model: state.model,
        authProfile: state.authProfile,
      },
      context.secrets,
      {
        workspacePath: state.workspacePath,
        model: state.model,
        authProfile: state.authProfile,
      },
    );
    const rawText = extractProviderSummary(response);
    const parsed = parsePlannerResponse(rawText);
    if (!parsed.ok && !invalidResponse) {
      output.appendLine(`[freejt7-owned-runtime] planner devolvio salida no JSON; se solicita reparacion: ${parsed.error}`);
      return callPlanner(context, output, state, rawText);
    }
    if (!parsed.ok) {
      const error = new Error(`Backend propio Free JT7 no recibio JSON valido del planner: ${parsed.error}`);
      error.isRetryable = true;
      throw error;
    }
    return {
      planner: normalizePlannerOutcome(parsed.value),
      rawText,
      response,
    };
  }

  async function executeTask(context, output, input = {}) {
    const workspacePath = path.resolve(String(input.workspacePath || process.cwd()).trim() || process.cwd());
    const provider = String(input.provider || '').trim();
    const model = String(input.model || '').trim();
    const authProfile = String(input.authProfile || 'default').trim() || 'default';
    const goal = String(input.goal || input.prompt || '').trim();
    if (!goal) {
      throw new Error('Backend propio Free JT7 requiere un objetivo no vacio.');
    }
    if (!provider || provider === 'copilot') {
      throw new Error('Backend propio Free JT7 requiere un proveedor externo valido.');
    }

    const workspace = getWorkspaceSnapshot(workspacePath);
    const packageSummary = getPackageSummary(workspacePath);
    const heuristicActions = deriveLocalActions(goal, {
      workspacePath,
      provider,
      model,
      runtimeBackend: 'freejt7',
    }).slice(0, MAX_ACTIONS_PER_STEP);
    const stepSummaries = [];
    const verification = ['OwnedRuntime: loop agentico propio activado.'];
    const changedFiles = new Set();
    const rawPlannerResponses = [];
    let completionSummary = '';
    let lastPlanner = null;

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const plannerState = {
        goal,
        workspacePath,
        provider,
        model,
        authProfile,
        workspace,
        packageSummary,
        heuristicActions,
        stepSummaries,
        iteration,
        maxIterations,
      };
      const planned = await callPlanner(context, output, plannerState);
      rawPlannerResponses.push(planned.rawText);
      lastPlanner = planned.planner;
      output.appendLine(`[freejt7-owned-runtime] iteracion ${iteration}/${maxIterations} status=${planned.planner.status} actions=${planned.planner.actions.length}`);

      if (planned.planner.status === 'completed' && planned.planner.actions.length === 0) {
        completionSummary = planned.planner.summary || completionSummary;
        break;
      }

      const actions = planned.planner.actions.length > 0
        ? planned.planner.actions
        : (iteration === 1 ? heuristicActions : []);

      if (!actions.length) {
        completionSummary = planned.planner.summary || 'El planner no emitio acciones ni una conclusion verificable.';
        break;
      }

      const results = executeLocalActions(workspacePath, { actions });
      const toolResults = summarizeToolResults(results);
      stepSummaries.push({
        iteration,
        planner: planned.planner,
        actions,
        toolResults,
      });
      for (const filePath of collectChangedFiles(results)) {
        changedFiles.add(filePath);
      }
      verification.push(...buildVerificationLines(results));

      const totalFailures = Array.isArray(results.failures) ? results.failures.length : 0;
      if (planned.planner.status === 'completed' && totalFailures === 0) {
        completionSummary = planned.planner.summary || completionSummary;
        break;
      }

      if (iteration === maxIterations) {
        completionSummary = planned.planner.summary || completionSummary;
      }
    }

    if (!completionSummary) {
      completionSummary = lastPlanner?.summary
        || 'Free JT7 completo la iteracion agentica, pero no obtuvo una conclusion final mas fuerte dentro del limite configurado.';
    }

    const visibleSummaryParts = [
      completionSummary,
      changedFiles.size ? `Cambios verificados: ${Array.from(changedFiles).join(', ')}.` : '',
      stepSummaries.length ? `Iteraciones ejecutadas: ${stepSummaries.length}.` : '',
    ].filter(Boolean);

    const technicalSummary = [
      'Free JT7 ejecuto su backend propio agentic con loop de planificacion, tools, verificacion y reintento.',
      `Provider de razonamiento: ${provider}/${model || 'default'}.`,
      `Workspace: ${workspacePath}.`,
      packageSummary && !packageSummary.error
        ? `Proyecto npm: ${packageSummary.name || 'sin nombre'} ${packageSummary.version || ''}`.trim()
        : '',
      stepSummaries.map((step) => [
        `Iteracion ${step.iteration}: ${step.planner.status}.`,
        step.planner.reasoning ? `Razonamiento: ${truncate(step.planner.reasoning, 600)}` : '',
        step.actions.length ? `Acciones: ${step.actions.map((item) => item.type).join(', ')}` : '',
        step.toolResults.length ? `Resultados: ${truncate(step.toolResults.join(' | '), MAX_TOOL_CONTEXT_CHARS)}` : '',
      ].filter(Boolean).join('\n')).join('\n\n'),
    ].filter(Boolean).join('\n');

    return {
      provider,
      model,
      executionMode: 'agent',
      executionRoute: 'freejt7-owned-agent',
      ownedRuntime: {
        iterations: stepSummaries.length,
        plannerResponses: rawPlannerResponses.map((item) => truncate(item, 4000)),
        steps: stepSummaries,
        technicalSummary,
      },
      run: {
        status: 'completed',
        summary: visibleSummaryParts.join('\n\n'),
        provider,
        model,
      },
      final: {
        status: 'completed',
        summary: visibleSummaryParts.join('\n\n'),
        changedFiles: Array.from(changedFiles),
        verification,
        residualRisks: [
          'El backend propio ya ejecuta un loop agentic real, pero sigue usando el proveedor remoto como motor de razonamiento; para autonomia total todavia falta ampliar tools/MCP y reintentos semanticos mas profundos.',
        ],
      },
    };
  }

  return {
    executeTask,
  };
}

module.exports = {
  createFreeJt7OwnedRuntime,
  parsePlannerResponse,
  normalizePlannerActions,
};
