'use strict';

let vscode;
try {
  vscode = require('vscode');
} catch (_) {
  vscode = null;
}

const path = require('path');
const { SessionEngine } = require('./session-engine');
const { PolicyEngine } = require('./policy-engine');
const { ProviderRouter } = require('./provider-router');
const { AuditBus } = require('./audit-bus');
const { getRemoteBridge } = require('../runtime/remote-bridge');
const freeModelsCatalog = require('../free-models-catalog');

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 24; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

function getPanelCatalogSnapshot() {
  const providers = ['openrouter', 'hf', 'zai', 'copilot'];
  const modelsByProvider = {};
  const defaultModelByProvider = {};

  for (const provider of providers) {
    try {
      modelsByProvider[provider] = Array.isArray(freeModelsCatalog.getModelsForProvider(provider))
        ? freeModelsCatalog.getModelsForProvider(provider)
        : [];
      defaultModelByProvider[provider] = String(freeModelsCatalog.getDefaultModel(provider) || '');
    } catch (_) {
      modelsByProvider[provider] = [];
      defaultModelByProvider[provider] = '';
    }
  }

  return { modelsByProvider, defaultModelByProvider };
}

function createPanelHtml(webview, title, panelCatalog) {
  const nonce = getNonce();
  const catalogJson = JSON.stringify(panelCatalog || { modelsByProvider: {}, defaultModelByProvider: {} });
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0f19;
      --bg-2: #0f1827;
      --bg-3: #16253b;
      --card: rgba(16, 27, 42, 0.86);
      --line: #28405f;
      --line-soft: #213752;
      --txt: #d9e6ff;
      --muted: #91a4c4;
      --accent: #31d0aa;
      --warn: #f2bf57;
      --danger: #ff6f7a;
      --ok: #57d991;
      --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
      --radius: 14px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "SF Pro Text", "Noto Sans", sans-serif;
      background:
        radial-gradient(1200px 600px at -10% -20%, #24456f 0%, rgba(36, 69, 111, 0) 62%),
        radial-gradient(800px 500px at 110% -10%, #29575f 0%, rgba(41, 87, 95, 0) 58%),
        linear-gradient(170deg, var(--bg) 0%, #0d1420 50%, #0b111b 100%);
      color: var(--txt);
      padding: 18px;
    }

    .app {
      display: grid;
      gap: 14px;
      grid-template-rows: auto auto 1fr auto;
      min-height: calc(100vh - 36px);
    }

    .surface {
      border: 1px solid var(--line-soft);
      border-radius: var(--radius);
      background: var(--card);
      box-shadow: var(--shadow);
      backdrop-filter: blur(4px);
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: linear-gradient(135deg, rgba(20, 35, 55, 0.95), rgba(14, 24, 38, 0.95));
    }

    .brand {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }

    .subtitle {
      color: var(--muted);
      font-size: 12px;
    }

    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(6, minmax(120px, 1fr));
      gap: 10px;
    }

    .stat-card {
      padding: 10px;
      border: 1px solid var(--line-soft);
      border-radius: 12px;
      background: linear-gradient(165deg, rgba(19, 31, 50, 0.95), rgba(11, 19, 30, 0.95));
    }

    .stat-label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      margin-top: 4px;
      line-height: 1;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(270px, 0.9fr) minmax(420px, 1.4fr) minmax(280px, 0.9fr);
      gap: 12px;
      min-height: 0;
    }

    .col {
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .panel {
      border: 1px solid var(--line-soft);
      border-radius: 12px;
      padding: 12px;
      background: linear-gradient(170deg, rgba(18, 29, 46, 0.96), rgba(10, 18, 29, 0.96));
      min-height: 0;
    }

    .panel h3 {
      margin: 0 0 10px 0;
      font-size: 13px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--muted);
    }

    .row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
    }

    .list {
      overflow: auto;
      min-height: 120px;
      max-height: 100%;
      padding-right: 4px;
    }

    .session-item {
      padding: 10px;
      border: 1px solid var(--line-soft);
      border-radius: 10px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease;
      background: rgba(14, 24, 38, 0.7);
    }

    .session-item:hover {
      border-color: #3b678f;
      background: rgba(18, 31, 49, 0.88);
    }

    .session-item.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px rgba(49, 208, 170, 0.22);
    }

    .session-item .meta {
      color: var(--muted);
      font-size: 11px;
      margin-top: 4px;
    }

    .task-card {
      border: 1px solid var(--line-soft);
      border-radius: 12px;
      padding: 10px;
      margin-bottom: 10px;
      background: rgba(16, 27, 42, 0.76);
    }

    .task-header {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }

    .task-id {
      font-size: 12px;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .task-goal {
      color: #d6e5ff;
      line-height: 1.35;
      margin-bottom: 8px;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .task-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .chip {
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      border: 1px solid var(--line);
      color: var(--muted);
      background: rgba(14, 22, 34, 0.9);
    }

    .chip.ok { color: var(--ok); border-color: #2f7255; }
    .chip.warn { color: var(--warn); border-color: #7a6430; }
    .chip.err { color: var(--danger); border-color: #7d3340; }

    .event-item {
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px dashed #294562;
      font-size: 12px;
      line-height: 1.35;
      color: #c9dbf8;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .small { font-size: 12px; color: var(--muted); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

    input, select, textarea, button {
      border: 1px solid #2b4768;
      color: var(--txt);
      background: linear-gradient(170deg, #132238, #0f1c2e);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 13px;
    }

    textarea {
      resize: vertical;
      min-height: 68px;
      width: 100%;
      font-family: inherit;
    }

    button {
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }

    button:hover {
      transform: translateY(-1px);
      border-color: #4a78a8;
      background: linear-gradient(170deg, #183053, #132945);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .composer {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: linear-gradient(165deg, rgba(18, 30, 46, 0.96), rgba(11, 19, 30, 0.96));
    }

    .composer-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      justify-content: flex-end;
      min-width: 290px;
    }

    .status-line {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .active-session-badge {
      border-radius: 999px;
      padding: 3px 9px;
      border: 1px solid #3a5f8a;
      font-size: 11px;
      color: #d6e7ff;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (max-width: 1280px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .stats {
        grid-template-columns: repeat(3, minmax(120px, 1fr));
      }
      .composer {
        grid-template-columns: 1fr;
      }
      .composer-controls {
        justify-content: flex-start;
        min-width: auto;
      }
    }

    @media (max-width: 740px) {
      body { padding: 10px; }
      .app { min-height: calc(100vh - 20px); }
      .stats { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      .topbar { padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <section class="topbar">
      <div class="brand">
        <div class="title">Free JT7 Agent Console</div>
        <div class="subtitle">Control de sesiones, cola, aprobaciones y ejecucion multi-proveedor en tiempo real</div>
      </div>
      <div class="toolbar">
        <input id="sessionTitle" placeholder="Titulo de sesion" value="Sesion Free JT7" style="min-width: 210px;" />
        <button id="createSession">Nueva sesion</button>
        <button id="refreshState">Refrescar</button>
      </div>
    </section>

    <section class="stats surface">
      <article class="stat-card"><div class="stat-label">Sesiones</div><div id="statSessions" class="stat-value">0</div></article>
      <article class="stat-card"><div class="stat-label">Cola</div><div id="statQueue" class="stat-value">0</div></article>
      <article class="stat-card"><div class="stat-label">Running</div><div id="statRunning" class="stat-value">0</div></article>
      <article class="stat-card"><div class="stat-label">Aprobacion</div><div id="statApproval" class="stat-value">0</div></article>
      <article class="stat-card"><div class="stat-label">Fallidas</div><div id="statFailed" class="stat-value">0</div></article>
      <article class="stat-card"><div class="stat-label">Completadas</div><div id="statCompleted" class="stat-value">0</div></article>
    </section>

    <section class="layout">
      <div class="col">
        <div class="panel stack">
          <h3>Sesiones</h3>
          <div class="row">
            <span class="small">Orden</span>
            <select id="sessionSort">
              <option value="updated">actualizadas</option>
              <option value="created">creadas</option>
            </select>
          </div>
          <div id="sessions" class="list"></div>
        </div>
      </div>

      <div class="col">
        <div class="panel stack">
          <h3>Tareas</h3>
          <div class="status-line small">
            <span>Sesion activa:</span>
            <span id="activeSession" class="active-session-badge">sin sesion</span>
          </div>
          <div id="tasks" class="list"></div>
        </div>
      </div>

      <div class="col">
        <div class="panel stack">
          <h3>Eventos</h3>
          <div id="events" class="list"></div>
        </div>
      </div>
    </section>

    <section class="composer">
      <div class="stack">
        <textarea id="goal" placeholder="Describe la tarea para el agente. Ejemplo: auditar el runtime y proponer fix con bajo riesgo."></textarea>
        <div class="small">El motor decide politicas y workers, y esta vista te deja aprobar, cancelar o reintentar al instante.</div>
      </div>
      <div class="composer-controls">
        <span class="small">Proveedor</span>
        <select id="provider">
          <option value="openrouter">openrouter</option>
          <option value="hf">hf</option>
          <option value="zai">zai</option>
          <option value="copilot">copilot</option>
        </select>
        <span class="small">Modelo</span>
        <select id="modelSelect" style="min-width: 240px;"></select>
        <button id="toggleCustomModel" type="button">Manual</button>
        <input id="modelCustom" placeholder="modelo personalizado" style="min-width: 220px; display: none;" />
        <select id="risk">
          <option value="">risk auto</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <button id="enqueueTask">Encolar tarea</button>
      </div>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const PANEL_CATALOG = ${catalogJson};
    let currentSessionId = '';
    let currentState = null;
    const eventHistory = [];

    const $ = (id) => document.getElementById(id);

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function chipClassForStatus(status) {
      if (status === 'completed') return 'ok';
      if (status === 'failed' || status === 'rejected' || status === 'canceled') return 'err';
      if (status === 'waiting_approval' || status === 'queued' || status === 'retrying') return 'warn';
      return '';
    }

    function formatAgo(isoValue) {
      if (!isoValue) return 'n/a';
      const timestamp = Date.parse(isoValue);
      if (Number.isNaN(timestamp)) return 'n/a';
      const deltaSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      if (deltaSec < 60) return deltaSec + 's';
      if (deltaSec < 3600) return Math.floor(deltaSec / 60) + 'm';
      if (deltaSec < 86400) return Math.floor(deltaSec / 3600) + 'h';
      return Math.floor(deltaSec / 86400) + 'd';
    }

    function getStateSessionsArray() {
      if (!currentState || !currentState.sessions) return [];
      return Object.values(currentState.sessions);
    }

    function normalizeProviderModels(rawModels) {
      if (!Array.isArray(rawModels)) {
        return [];
      }
      return rawModels
        .map((model) => {
          if (typeof model === 'string') {
            return { label: model, value: model };
          }
          if (model && typeof model === 'object') {
            const value = String(model.value || model.id || model.name || '').trim();
            if (!value) {
              return null;
            }
            return {
              label: String(model.label || model.name || value),
              value,
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    function getProviderModels(provider) {
      const rawModels = (PANEL_CATALOG.modelsByProvider && PANEL_CATALOG.modelsByProvider[provider]) || [];
      return normalizeProviderModels(rawModels);
    }

    function getProviderDefaultModel(provider) {
      return (PANEL_CATALOG.defaultModelByProvider && PANEL_CATALOG.defaultModelByProvider[provider]) || '';
    }

    function setCustomModelVisibility(visible) {
      const customInput = $('modelCustom');
      const toggleButton = $('toggleCustomModel');
      customInput.style.display = visible ? 'inline-block' : 'none';
      toggleButton.textContent = visible ? 'Ocultar manual' : 'Modelo manual';
      if (!visible) {
        customInput.value = '';
      }
    }

    function syncModelOptions(provider, preferredModel = '') {
      const select = $('modelSelect');
      const customInput = $('modelCustom');
      const models = getProviderModels(provider);
      const defaultModel = getProviderDefaultModel(provider);
      const currentValue = select.value || '';
      const hasPreferredModel = Boolean(preferredModel);
      const currentValueIsValid = models.some((model) => model.value === currentValue);
      const active = hasPreferredModel
        ? preferredModel
        : (currentValueIsValid ? currentValue : (defaultModel || models[0]?.value || ''));

      select.innerHTML = '';

      if (provider === 'copilot') {
        const item = document.createElement('option');
        item.value = '';
        item.textContent = 'copilot (modelo integrado)';
        select.appendChild(item);
        select.disabled = true;
        customInput.disabled = true;
        setCustomModelVisibility(false);
        return;
      }

      select.disabled = false;
      customInput.disabled = false;
      setCustomModelVisibility(false);
      if (!hasPreferredModel) {
        customInput.value = '';
      }

      if (!models.length) {
        const item = document.createElement('option');
        item.value = active;
        item.textContent = active || '(sin modelos catalogados)';
        select.appendChild(item);
        select.value = active;
        return;
      }

      for (const model of models) {
        const item = document.createElement('option');
        item.value = model.value;
        const suffix = model.value === defaultModel ? ' (default)' : '';
        item.textContent = (model.label || model.value) + suffix;
        select.appendChild(item);
      }

      if (!models.some((model) => model.value === active) && active) {
        const custom = document.createElement('option');
        custom.value = active;
        custom.textContent = active + ' (actual)';
        select.insertBefore(custom, select.firstChild);
      }

      select.value = active || defaultModel || models[0].value || '';
    }

    function log(line, cls='') {
      eventHistory.unshift({ line: String(line || ''), cls, at: new Date().toISOString() });
      if (eventHistory.length > 200) {
        eventHistory.length = 200;
      }
      renderEvents();
    }

    function renderEvents() {
      const container = $('events');
      container.innerHTML = '';
      if (!eventHistory.length) {
        container.innerHTML = '<div class="small">sin eventos</div>';
        return;
      }

      for (const item of eventHistory.slice(0, 120)) {
        const row = document.createElement('div');
        row.className = 'event-item';
        if (item.cls) {
          row.className += ' ' + item.cls;
        }
        row.textContent = '[' + formatAgo(item.at) + '] ' + item.line;
        container.appendChild(row);
      }
    }

    function ensureActiveSession() {
      const sessions = getStateSessionsArray();
      if (!sessions.length) {
        currentSessionId = '';
        $('activeSession').textContent = 'sin sesion';
        return;
      }

      const stillExists = sessions.some((session) => session.sessionId === currentSessionId);
      if (stillExists) {
        $('activeSession').textContent = currentSessionId;
        return;
      }

      const sorted = sessions.slice().sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
      currentSessionId = sorted[0].sessionId;
      $('activeSession').textContent = currentSessionId;
    }

    function renderSessions() {
      const container = $('sessions');
      container.innerHTML = '';
      const sessions = getStateSessionsArray();
      if (!sessions.length) {
        container.innerHTML = '<div class="small">sin sesiones</div>';
        return;
      }

      const sortMode = $('sessionSort').value || 'updated';
      const sorted = sessions.slice().sort((a, b) => {
        const aValue = sortMode === 'created' ? Date.parse(a.createdAt || 0) : Date.parse(a.updatedAt || 0);
        const bValue = sortMode === 'created' ? Date.parse(b.createdAt || 0) : Date.parse(b.updatedAt || 0);
        return bValue - aValue;
      });

      for (const session of sorted) {
        const item = document.createElement('div');
        item.className = 'session-item' + (session.sessionId === currentSessionId ? ' active' : '');
        item.dataset.sessionId = session.sessionId;

        const tasks = Array.isArray(session.tasks) ? session.tasks.length : 0;
        item.innerHTML =
          '<div><strong>' + escapeHtml(session.title || 'Sesion') + '</strong></div>' +
          '<div class="meta">' +
            escapeHtml(session.sessionId) + ' | ' +
            tasks + ' tareas | upd ' + formatAgo(session.updatedAt) +
          '</div>';

        item.onclick = () => {
          currentSessionId = session.sessionId;
          $('activeSession').textContent = currentSessionId;
          renderSessions();
          renderTasks();
        };

        container.appendChild(item);
      }
    }

    function renderOverview() {
      const sessions = getStateSessionsArray();
      const taskIndex = currentState && currentState.taskIndex ? currentState.taskIndex : {};
      let running = 0;
      let waitingApproval = 0;
      let failed = 0;
      let completed = 0;

      for (const taskId of Object.keys(taskIndex)) {
        const status = String(taskIndex[taskId].status || '');
        if (status === 'running') running += 1;
        if (status === 'waiting_approval') waitingApproval += 1;
        if (status === 'failed' || status === 'rejected') failed += 1;
        if (status === 'completed') completed += 1;
      }

      $('statSessions').textContent = String(sessions.length);
      $('statQueue').textContent = String((currentState && Array.isArray(currentState.queue) ? currentState.queue.length : 0));
      $('statRunning').textContent = String(running);
      $('statApproval').textContent = String(waitingApproval);
      $('statFailed').textContent = String(failed);
      $('statCompleted').textContent = String(completed);
    }

    function renderTasks() {
      const container = $('tasks');
      container.innerHTML = '';
      if (!currentState || !currentState.sessions) {
        container.textContent = 'sin datos';
        return;
      }
      const session = currentState.sessions[currentSessionId];
      if (!session) {
        container.textContent = 'selecciona sesion';
        return;
      }
      const taskIds = session.tasks || [];
      if (!taskIds.length) {
        container.textContent = 'sin tareas';
        return;
      }
      const tasks = currentState.taskIndex || {};
      for (const taskId of taskIds) {
        const task = tasks[taskId];
        if (!task) continue;
        const card = document.createElement('article');
        card.className = 'task-card';

        const canApprove = task.status === 'waiting_approval';
        const canRetry = task.status === 'failed' || task.status === 'rejected' || task.status === 'canceled';
        const canCancel = task.status === 'queued' || task.status === 'running' || task.status === 'waiting_approval';

        card.innerHTML =
          '<div class="task-header">' +
            '<span class="task-id">' + escapeHtml(task.taskId) + '</span>' +
            '<span class="chip ' + chipClassForStatus(task.status) + '">' + escapeHtml(task.status) + '</span>' +
          '</div>' +
          '<div class="task-goal">' + escapeHtml(task.goal || '') + '</div>' +
          '<div class="task-footer">' +
            '<div class="row">' +
              '<span class="chip">risk: ' + escapeHtml(task.risk || 'na') + '</span>' +
              '<span class="chip">retries: ' + Number(task.retries || 0) + '/' + Number(task.maxRetries || 0) + '</span>' +
              '<span class="chip">upd: ' + formatAgo(task.updatedAt) + '</span>' +
            '</div>' +
            '<div class="row">' +
              '<button data-action="approve" data-task-id="' + escapeHtml(task.taskId) + '" ' + (canApprove ? '' : 'disabled') + '>Approve</button>' +
              '<button data-action="reject" data-task-id="' + escapeHtml(task.taskId) + '" ' + (canApprove ? '' : 'disabled') + '>Reject</button>' +
              '<button data-action="retry" data-task-id="' + escapeHtml(task.taskId) + '" ' + (canRetry ? '' : 'disabled') + '>Retry</button>' +
              '<button data-action="cancel" data-task-id="' + escapeHtml(task.taskId) + '" ' + (canCancel ? '' : 'disabled') + '>Cancel</button>' +
            '</div>' +
          '</div>';

        if (task.error) {
          const err = document.createElement('div');
          err.className = 'event-item err';
          err.style.marginTop = '8px';
          err.style.borderBottom = 'none';
          err.textContent = 'error: ' + String(task.error);
          card.appendChild(err);
        }

        if (task.result && task.result.summary) {
          const result = document.createElement('div');
          result.className = 'event-item ok';
          result.style.marginTop = '8px';
          result.style.borderBottom = 'none';
          result.textContent = 'result: ' + String(task.result.summary);
          card.appendChild(result);
        }

        container.appendChild(card);
      }
    }

    function rerenderAll() {
      ensureActiveSession();
      renderOverview();
      renderSessions();
      renderTasks();
    }

    $('createSession').onclick = () => {
      vscode.postMessage({ type: 'session.create', title: $('sessionTitle').value });
    };

    $('enqueueTask').onclick = () => {
      if (!currentSessionId) {
        log('Primero crea una sesion', 'warn');
        return;
      }
      vscode.postMessage({
        type: 'task.enqueue',
        sessionId: currentSessionId,
        task: {
          goal: $('goal').value,
          provider: $('provider').value,
          model: $('modelCustom').value.trim() || $('modelSelect').value,
          risk: $('risk').value,
        },
      });
    };

    $('provider').onchange = () => {
      syncModelOptions($('provider').value, '');
    };

    $('sessionSort').onchange = () => {
      renderSessions();
    };

    $('toggleCustomModel').onclick = () => {
      const customInput = $('modelCustom');
      const willShow = customInput.style.display === 'none';
      setCustomModelVisibility(willShow);
      if (willShow) {
        customInput.focus();
      }
    };

    $('refreshState').onclick = () => {
      vscode.postMessage({ type: 'state.get' });
    };

    $('tasks').onclick = (event) => {
      const target = event.target;
      if (!target || target.tagName !== 'BUTTON') {
        return;
      }
      const action = target.getAttribute('data-action');
      const taskId = target.getAttribute('data-task-id');
      if (!action || !taskId || !currentSessionId) {
        return;
      }

      if (action === 'approve') {
        vscode.postMessage({ type: 'approval.resolve', sessionId: currentSessionId, taskId, approved: true, reason: 'approved from panel' });
      }
      if (action === 'reject') {
        vscode.postMessage({ type: 'approval.resolve', sessionId: currentSessionId, taskId, approved: false, reason: 'rejected from panel' });
      }
      if (action === 'retry') {
        vscode.postMessage({ type: 'task.retry', sessionId: currentSessionId, taskId });
      }
      if (action === 'cancel') {
        vscode.postMessage({ type: 'task.cancel', sessionId: currentSessionId, taskId });
      }
    };

    window.addEventListener('message', (event) => {
      const msg = event.data || {};

      if (msg.type === 'session.created') {
        currentSessionId = msg.session.sessionId;
        $('activeSession').textContent = currentSessionId;
        log('Sesion creada: ' + currentSessionId, 'ok');
      }

      if (msg.type === 'state.snapshot') {
        currentState = msg.state;
        const provider = String(msg.provider || $('provider').value || 'openrouter');
        $('provider').value = provider;
        syncModelOptions(provider, String(msg.model || ''));
        rerenderAll();
      }

      if (msg.type === 'engine.event') {
        log(msg.event.type + ' [' + (msg.event.task ? msg.event.task.taskId : 'session') + ']');
        if (msg.state) {
          currentState = msg.state;
          rerenderAll();
        }
      }
    });

    syncModelOptions($('provider').value || 'openrouter', '');
    setCustomModelVisibility(false);
    renderEvents();
    vscode.postMessage({ type: 'state.get' });
  </script>
</body>
</html>`;
}

function createControlPanel(context, output, options = {}) {
  const workspacePath = options.workspacePath;
  const remoteBridge = options.remoteBridge || getRemoteBridge({ rootDir: workspacePath });
  const policyEngine = new PolicyEngine({ mode: options.policyMode || 'mixed' });
  const providerRouter = new ProviderRouter({
    context,
    output,
    executeCopilotTask: options.executeCopilotTask,
    workspacePath,
  });
  const auditBus = new AuditBus({
    rootDir: workspacePath,
    output,
    remoteBridge,
  });
  const engine = new SessionEngine({
    rootDir: workspacePath,
    workerCount: Number(options.workerCount || 3),
    policyEngine,
    providerRouter,
    auditBus,
    output,
  });

  engine.start();

  let panel = null;

  function postState() {
    if (!panel) return;
    const config = vscode?.workspace?.getConfiguration
      ? vscode.workspace.getConfiguration('freejt7')
      : null;
    const provider = String(config?.get('apiProvider') || 'openrouter').trim() || 'openrouter';
    const model = provider === 'copilot'
      ? ''
      : String(config?.get('apiProviderModel') || freeModelsCatalog.getDefaultModel(provider) || '').trim();
    panel.webview.postMessage({
      type: 'state.snapshot',
      provider,
      model,
      state: {
        ...engine.getState(),
        taskIndex: engine._taskIndex,
      },
    });
  }

  engine.on('task', (event) => {
    if (!panel) return;
    panel.webview.postMessage({
      type: 'engine.event',
      event,
      state: {
        ...engine.getState(),
        taskIndex: engine._taskIndex,
      },
    });
  });

  engine.on('session', (event) => {
    if (!panel) return;
    panel.webview.postMessage({ type: event.type, session: event.session });
    postState();
  });

  function openPanel() {
    if (!vscode) return;

    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      postState();
      return;
    }

    panel = vscode.window.createWebviewPanel(
      'freejt7.controlPanel',
      'Free JT7 Control Panel',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    panel.webview.html = createPanelHtml(panel.webview, 'Free JT7 Control Panel', getPanelCatalogSnapshot());

    panel.onDidDispose(() => {
      panel = null;
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      const type = String(msg?.type || '');

      try {
        if (type === 'session.create') {
          const session = engine.createSession({ title: msg.title || 'Sesion Free JT7' });
          panel.webview.postMessage({ type: 'session.created', session });
          postState();
          return;
        }

        if (type === 'task.enqueue') {
          engine.enqueueTask(msg.sessionId, msg.task || {});
          postState();
          return;
        }

        if (type === 'approval.resolve') {
          engine.resolveApproval(msg.sessionId, msg.taskId, Boolean(msg.approved), msg.reason || '');
          postState();
          return;
        }

        if (type === 'task.cancel') {
          engine.cancelTask(msg.sessionId, msg.taskId);
          postState();
          return;
        }

        if (type === 'task.retry') {
          engine.retryTask(msg.sessionId, msg.taskId);
          postState();
          return;
        }

        if (type === 'state.get') {
          postState();
          return;
        }
      } catch (error) {
        const message = String(error.message || error);
        if (output) {
          output.appendLine(`[freejt7-panel] message handler error: ${message}`);
        }
      }
    });

    postState();
  }

  function dispose() {
    engine.stop();
    if (panel) {
      panel.dispose();
    }
  }

  return {
    openPanel,
    dispose,
    engine,
  };
}

module.exports = {
  createPanelHtml,
  createControlPanel,
};
