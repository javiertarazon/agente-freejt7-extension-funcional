'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_LIMIT = 12;
const MAX_PATHS = 3;
const MAX_PATH_SCAN_LENGTH = 260;
const MAX_FILE_PREVIEW_CHARS = 900;
const MAX_LOCAL_CONTEXT_CHARS = 2200;

function shouldIgnoreAutoContextPath(candidate, workspacePath = '') {
  const normalized = String(candidate || '').replace(/\\/g, '/');
  const workspace = String(workspacePath || '').replace(/\\/g, '/');
  if (normalized.includes('/copilot-agent/')) {
    return true;
  }
  if (workspace && normalized.startsWith(workspace) && normalized.slice(workspace.length).startsWith('/copilot-agent/')) {
    return true;
  }
  return false;
}

function stripNullBytes(value) {
  return String(value || '').replace(/\0/g, '');
}

function truncateText(value, maxChars) {
  const text = stripNullBytes(value).trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 18)).trimEnd()}\n...[truncado]`;
}

function extractText(value) {
  if (!value) return '';
  if (typeof value === 'string') return stripNullBytes(value).trim();
  if (Array.isArray(value)) {
    return value.map((item) => extractText(item)).filter(Boolean).join('\n').trim();
  }
  if (typeof value === 'object') {
    return extractText(
      value.text
      || value.value
      || value.content
      || value.message
      || value.prompt
      || value.response
      || value.body
    );
  }
  return stripNullBytes(value).trim();
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'user' || role === 'assistant' || role === 'system') {
    return role;
  }
  if (role.includes('bot') || role.includes('model') || role.includes('agent') || role.includes('assistant')) {
    return 'assistant';
  }
  if (role.includes('user') || role.includes('human') || role.includes('request')) {
    return 'user';
  }
  return '';
}

function normalizeConversationHistory(history = []) {
  if (!Array.isArray(history)) return [];
  const normalized = [];
  for (const entry of history) {
    const role = normalizeRole(
      entry?.role
      || entry?.participant
      || entry?.kind
      || entry?.sender
      || entry?.source
    );
    const content = truncateText(extractText(entry), 2200);
    if (!role || !content) continue;
    normalized.push({ role, content });
  }
  return normalized;
}

function stripDuplicatePrompt(history, prompt) {
  if (!history.length) return history;
  const normalizedPrompt = String(prompt || '').trim();
  if (!normalizedPrompt) return history;
  const last = history[history.length - 1];
  if (last && last.role === 'user' && last.content === normalizedPrompt) {
    return history.slice(0, -1);
  }
  return history;
}

function summarizeEntries(entries = []) {
  if (!entries.length) return 'sin contenido visible';
  return entries
    .slice(0, 10)
    .map((entry) => {
      const kind = entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other';
      return `- ${kind}: ${entry.name}`;
    })
    .join('\n');
}

function readTextFile(filePath, maxChars = MAX_FILE_PREVIEW_CHARS) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return truncateText(raw, maxChars);
  } catch (_) {
    return '';
  }
}

function summarizePath(absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(absPath, { withFileTypes: true });
      const dirs = entries.filter((entry) => entry.isDirectory()).length;
      const files = entries.filter((entry) => entry.isFile()).length;
      const readmeCandidate = ['README.md', 'README.MD', 'readme.md']
        .map((name) => path.join(absPath, name))
        .find((candidate) => fs.existsSync(candidate));
      const markers = ['package.json', 'Cargo.toml', 'pyproject.toml', 'requirements.txt', '.git']
        .filter((name) => fs.existsSync(path.join(absPath, name)));
      const readmePreview = readmeCandidate
        ? readTextFile(readmeCandidate, 500).split('\n').filter(Boolean).slice(0, 6).join('\n')
        : '';
      return [
        `Ruta detectada: ${absPath}`,
        `Tipo: directorio`,
        `Resumen rapido: ${dirs} subdirectorios, ${files} archivos directos.`,
        markers.length ? `Marcadores: ${markers.join(', ')}` : '',
        'Entradas visibles:',
        summarizeEntries(entries),
        readmePreview ? `README (extracto):\n${readmePreview}` : '',
      ].filter(Boolean).join('\n');
    }

    const preview = readTextFile(absPath, MAX_FILE_PREVIEW_CHARS);
    return [
      `Ruta detectada: ${absPath}`,
      `Tipo: archivo`,
      `Tamano: ${stat.size} bytes`,
      preview ? `Preview:\n${preview}` : '',
    ].filter(Boolean).join('\n');
  } catch (_) {
    return '';
  }
}

function longestExistingPathPrefix(source) {
  let candidate = String(source || '').trim();
  if (!candidate.startsWith('/')) return '';
  while (candidate.length > 1) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    candidate = candidate.slice(0, -1).trimEnd();
  }
  return '';
}

function extractExistingPaths(text, options = {}) {
  const source = String(text || '');
  if (!source.includes('/')) return [];

  const candidates = [];
  for (let index = source.indexOf('/'); index !== -1; index = source.indexOf('/', index + 1)) {
    const end = source.indexOf('\n', index);
    const rawSegment = source.slice(index, end === -1 ? Math.min(source.length, index + MAX_PATH_SCAN_LENGTH) : end);
    const cleaned = rawSegment.replace(/^[`"'(]+|[`"'),.;:!?]+$/g, '').trim();
    const existingPath = longestExistingPathPrefix(cleaned);
    if (existingPath) {
      candidates.push(path.resolve(existingPath));
    }
  }

  const workspacePath = options.workspacePath ? path.resolve(String(options.workspacePath)) : '';
  const unique = Array.from(new Set(candidates))
    .filter((candidate) => Boolean(candidate))
    .filter((candidate) => !shouldIgnoreAutoContextPath(candidate, workspacePath))
    .sort((left, right) => {
      if (workspacePath) {
        const leftIsWorkspace = left.startsWith(workspacePath);
        const rightIsWorkspace = right.startsWith(workspacePath);
        if (leftIsWorkspace !== rightIsWorkspace) {
          return leftIsWorkspace ? -1 : 1;
        }
      }
      return right.length - left.length;
    });

  return unique.slice(0, MAX_PATHS);
}

function buildLocalContextBlock(text, options = {}) {
  const paths = extractExistingPaths(text, options);
  if (!paths.length) return '';

  const summaries = paths.map((candidate) => summarizePath(candidate)).filter(Boolean);
  if (!summaries.length) return '';

  return truncateText(
    [
      'Contexto local inspeccionado automaticamente por Free JT7:',
      ...summaries,
    ].join('\n\n'),
    MAX_LOCAL_CONTEXT_CHARS,
  );
}

function shouldReuseRecentLocalContext(prompt) {
  return /\b(continua|continue|retoma|retomar|seguir|sigue|desde ahi|esa carpeta|ese archivo|misma ruta)\b/i.test(String(prompt || ''));
}

function buildLocalContextSource(prompt, history, options = {}) {
  const currentPrompt = String(prompt || '').trim();
  if (!currentPrompt) return '';
  if (extractExistingPaths(currentPrompt, options).length) {
    return currentPrompt;
  }
  if (!shouldReuseRecentLocalContext(currentPrompt)) {
    return currentPrompt;
  }

  const entries = Array.isArray(history) ? history : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const content = String(entries[index]?.content || '').trim();
    if (!content) continue;
    if (extractExistingPaths(content, options).length) {
      return `${currentPrompt}\n${content}`;
    }
  }
  return currentPrompt;
}

function buildFreeJt7SystemPrompt(options = {}) {
  const channel = String(options.channel || 'chat').trim();
  const sessionTitle = String(options.sessionTitle || '').trim();
  const intake = options.intake && typeof options.intake === 'object' ? options.intake : null;
  const capabilities = options.capabilities && typeof options.capabilities === 'object' ? options.capabilities : null;
  const selectedSkills = Array.isArray(options.selectedSkills)
    ? options.selectedSkills
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item.trim();
        return String(item.id || item.name || '').trim();
      })
      .filter(Boolean)
    : [];
  const capabilityLines = capabilities
    ? [
      Array.isArray(capabilities.selectedSkills) && capabilities.selectedSkills.length
        ? `- Skills resueltos: ${capabilities.selectedSkills.join(', ')}`
        : '',
      Array.isArray(capabilities.mcpServers) && capabilities.mcpServers.length
        ? `- MCP disponibles: ${capabilities.mcpServers.join(', ')}`
        : '',
      Array.isArray(capabilities.localOperations) && capabilities.localOperations.length
        ? `- Tools/operaciones locales: ${capabilities.localOperations.join(', ')}`
        : '',
      Array.isArray(capabilities.plannedActions) && capabilities.plannedActions.length
        ? `- Acciones candidatas del runtime: ${capabilities.plannedActions.join(', ')}`
        : '',
      capabilities.dispatchTarget ? `- Destino operativo preferido: ${String(capabilities.dispatchTarget).trim()}` : '',
      capabilities.runtimeBackend ? `- Backend preferido: ${String(capabilities.runtimeBackend).trim()}` : '',
    ].filter(Boolean)
    : [];
  return [
    'Eres free jt7, un agente tecnico pragmatico dentro del runtime local de una extension.',
    'No te presentes como MiniMax, OpenRouter, OpenAI, Hugging Face, ZAI, CLod ni como un modelo base del proveedor, aunque ese proveedor procese la respuesta.',
    'Si el usuario pregunta por tu identidad, capacidades, autonomia, herramientas o skills, responde desde la identidad y el runtime de free jt7, no desde la marca del modelo subyacente.',
    'Responde en espanol salvo que el usuario pida otro idioma.',
    'Mantienes continuidad conversacional real: usa el historial disponible y no trates cada turno como una solicitud aislada.',
    'Si el usuario ya dio una ruta, objetivo, restriccion o validacion, continua desde ahi sin pedir que repita el contexto.',
    'No declares capacidades, skills, MCP o herramientas como disponibles si no aparecen de forma explicita en esta solicitud o en evidencia operativa visible.',
    'Debes priorizar el uso de tools, Skills y MCP antes que una respuesta puramente conversacional cuando el objetivo sea ejecutable o verificable.',
    'Si una accion parece de alto impacto, primero formula un plan operativo claro usando las capacidades visibles y deja explicita la aprobacion requerida.',
    'Prioriza acciones directas, respuestas utiles y cambios compatibles hacia atras.',
    'Si aparece contexto local inspeccionado automaticamente, usalo como evidencia del entorno antes de pedir mas datos.',
    'Si el usuario dice "continua", "debes continuar" o algo similar, retoma la ultima tarea activa con el contexto previo.',
    intake?.deliverable ? `Entregable esperado: ${String(intake.deliverable).trim()}` : '',
    intake?.constraints ? `Restricciones / no-goals: ${String(intake.constraints).trim()}` : '',
    intake?.verification ? `Validacion esperada: ${String(intake.verification).trim()}` : '',
    selectedSkills.length ? `Skills prioritarios resueltos para esta solicitud: ${selectedSkills.join(', ')}.` : '',
    capabilityLines.length ? ['Capacidades operativas visibles en esta sesion:', ...capabilityLines].join('\n') : '',
    sessionTitle ? `Sesion actual: ${sessionTitle}.` : '',
    `Canal actual: ${channel}.`,
  ].filter(Boolean).join('\n');
}

function buildConversationRequest(options = {}) {
  const prompt = String(options.prompt || options.text || '').trim();
  const sessionTitle = String(options.sessionTitle || '').trim();
  const history = stripDuplicatePrompt(normalizeConversationHistory(options.history), prompt);
  const trimmedHistory = history.slice(-HISTORY_LIMIT);
  const textForLocalContext = buildLocalContextSource(prompt, trimmedHistory, { workspacePath: options.workspacePath });
  const localContext = buildLocalContextBlock(textForLocalContext, { workspacePath: options.workspacePath });
  const systemPrompt = [
    buildFreeJt7SystemPrompt({
      channel: options.channel,
      sessionTitle,
      intake: options.intake,
      selectedSkills: options.selectedSkills,
      capabilities: options.capabilities,
    }),
    localContext,
  ].filter(Boolean).join('\n\n');
  const messages = [
    ...trimmedHistory,
    ...(prompt ? [{ role: 'user', content: prompt }] : []),
  ];

  return {
    text: prompt,
    systemPrompt,
    messages,
    localContext,
    historyCount: trimmedHistory.length,
  };
}

function serializeConversationRequest(request = {}) {
  const sections = [];
  const systemPrompt = stripNullBytes(request.systemPrompt || '').trim();
  const messages = normalizeConversationHistory(request.messages);

  if (systemPrompt) {
    sections.push(`Instrucciones base del agente:\n${systemPrompt}`);
  }

  if (messages.length > 1) {
    sections.push([
      'Historial conversacional previo:',
      ...messages.slice(0, -1).map((entry) => `[${entry.role}] ${entry.content}`),
    ].join('\n'));
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage) {
    sections.push(`Solicitud actual:\n${stripNullBytes(lastMessage.content)}`);
  } else if (request.text) {
    sections.push(`Solicitud actual:\n${stripNullBytes(request.text).trim()}`);
  }

  return stripNullBytes(sections.filter(Boolean).join('\n\n'));
}

function extractChatContextMessages(chatContext) {
  const arrays = [
    chatContext?.history,
    chatContext?.messages,
    chatContext?.turns,
  ].filter(Array.isArray);

  for (const candidate of arrays) {
    const normalized = normalizeConversationHistory(candidate);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

module.exports = {
  buildConversationRequest,
  buildFreeJt7SystemPrompt,
  buildLocalContextBlock,
  buildLocalContextSource,
  extractChatContextMessages,
  extractExistingPaths,
  normalizeConversationHistory,
  serializeConversationRequest,
};
