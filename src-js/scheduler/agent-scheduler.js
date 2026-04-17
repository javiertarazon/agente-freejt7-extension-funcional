/**
 * agent-scheduler.js — Free JT7 Agent Scheduler (P3, Fase 1)
 *
 * Inspirado en `cron_scheduler.rs` de Claurst.
 * Resuelve Brecha 3: no hay scheduler integrado en el runtime loop.
 *
 * Características:
 *   - Jobs registrables con intervalos en milisegundos (sin dependencia de cron OS)
 *   - Estado persistido en copilot-agent/scheduler-state.json
 *   - Integración automática con MemoryOrchestrator
 *   - Cross-platform (solo setInterval, sin cron)
 *   - unref() en todos los timers para no bloquear el proceso
 *
 * Uso básico:
 *   const { AgentScheduler } = require('./agent-scheduler');
 *   const scheduler = new AgentScheduler();
 *   scheduler.addJob('mi-job', 60_000, async () => { ... });
 *   scheduler.start();
 *
 * @module agent-scheduler
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULTS = {
  rootDir:     path.resolve(__dirname, '..', '..'),
  stateFile:   'copilot-agent/scheduler-state.json',
  // Intervalos predeterminados (ms)
  intervals: {
    memoriaConsolidar:   60 * 60 * 1000,   // 1 h
    datasetExtraer:      30 * 60 * 1000,   // 30 min
    doctorNocturno:    8 * 60 * 60 * 1000, // 8 h
    gatewayStatus:      15 * 60 * 1000,    // 15 min
    revisarPendientes:  20 * 60 * 1000,    // 20 min
  },
};

// ---------------------------------------------------------------------------
// Clase AgentScheduler
// ---------------------------------------------------------------------------
class AgentScheduler {
  /**
   * @param {object} opts — overrides sobre DEFAULTS
   */
  constructor(opts = {}) {
    this.cfg = {
      ...DEFAULTS,
      ...opts,
      intervals: { ...DEFAULTS.intervals, ...(opts.intervals || {}) },
    };

    /** @type {Map<string, {intervalMs: number, fn: Function, timer: NodeJS.Timeout|null, lastRun: string|null, runCount: number, errors: number}>} */
    this._jobs = new Map();

    this._running  = false;
    this._log      = [];
    this._stateAbs = path.join(this.cfg.rootDir, this.cfg.stateFile);

    this._loadState();
  }

  // ── Persistencia ────────────────────────────────────────────────────────

  _loadState() {
    try {
      if (fs.existsSync(this._stateAbs)) {
        const raw = fs.readFileSync(this._stateAbs, 'utf8');
        const saved = JSON.parse(raw);
        this._savedState = saved; // para restaurar runCount/lastRun por job
      }
    } catch { /* primer arranque */ }
    this._savedState = this._savedState || {};
  }

  _saveState() {
    const state = {};
    for (const [name, job] of this._jobs) {
      state[name] = { lastRun: job.lastRun, runCount: job.runCount, errors: job.errors };
    }
    state._savedAt = new Date().toISOString();
    try {
      const dir = path.dirname(this._stateAbs);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._stateAbs, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      this._warn(`_saveState: ${err.message}`);
    }
  }

  // ── Logging ──────────────────────────────────────────────────────────────

  _info(msg) {
    const entry = { ts: new Date().toISOString(), level: 'info', msg };
    this._log.push(entry);
    if (process.env.NODE_ENV !== 'test') {
      process.stdout.write(`[agent-scheduler] ${entry.ts} ${msg}\n`);
    }
  }

  _warn(msg) {
    const entry = { ts: new Date().toISOString(), level: 'warn', msg };
    this._log.push(entry);
    if (process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[agent-scheduler] WARN ${entry.ts} ${msg}\n`);
    }
  }

  // ── Gestión de jobs ──────────────────────────────────────────────────────

  /**
   * Agrega un job al scheduler.
   * Si el scheduler ya está en marcha, el job se inicia de inmediato.
   *
   * @param {string}   name
   * @param {number}   intervalMs
   * @param {Function} fn  - async () => void
   * @returns {boolean} true si se agregó, false si ya existía
   */
  addJob(name, intervalMs, fn) {
    if (this._jobs.has(name)) {
      this._warn(`addJob: '${name}' ya existe — se omite`);
      return false;
    }

    // Restaurar estadísticas persistidas si existen
    const saved = (this._savedState || {})[name] || {};

    this._jobs.set(name, {
      intervalMs,
      fn,
      timer:    null,
      lastRun:  saved.lastRun  || null,
      runCount: saved.runCount || 0,
      errors:   saved.errors   || 0,
    });
    this._info(`addJob: '${name}' cada ${Math.round(intervalMs / 1000)}s`);

    if (this._running) this._startJobTimer(name);
    return true;
  }

  /**
   * Elimina un job y detiene su timer.
   * @param {string} name
   */
  removeJob(name) {
    const job = this._jobs.get(name);
    if (!job) return false;
    if (job.timer) clearInterval(job.timer);
    this._jobs.delete(name);
    this._info(`removeJob: '${name}' eliminado`);
    return true;
  }

  _startJobTimer(name) {
    const job = this._jobs.get(name);
    if (!job || job.timer) return;

    job.timer = setInterval(async () => {
      await this._runJob(name);
    }, job.intervalMs);

    // No bloquear el proceso si solo quedan timers
    if (job.timer.unref) job.timer.unref();
  }

  async _runJob(name) {
    const job = this._jobs.get(name);
    if (!job) return;
    this._info(`runJob: '${name}' iniciando`);
    try {
      await job.fn();
      job.lastRun = new Date().toISOString();
      job.runCount++;
      this._info(`runJob: '${name}' completado (#${job.runCount})`);
    } catch (err) {
      job.errors++;
      this._warn(`runJob: '${name}' error — ${err.message}`);
    }
    this._saveState();
  }

  // ── Ciclo de vida ────────────────────────────────────────────────────────

  /**
   * Inicia todos los jobs registrados.
   */
  start() {
    if (this._running) {
      this._warn('start(): ya en ejecución');
      return;
    }
    this._running = true;
    for (const name of this._jobs.keys()) {
      this._startJobTimer(name);
    }
    this._info(`start(): ${this._jobs.size} jobs activos`);
  }

  /**
   * Detiene todos los timers (sin eliminar los jobs).
   */
  stop() {
    for (const [, job] of this._jobs) {
      if (job.timer) { clearInterval(job.timer); job.timer = null; }
    }
    this._running = false;
    this._saveState();
    this._info('stop(): scheduler detenido');
  }

  /**
   * Ejecuta un job de inmediato (fuera de su ciclo regular).
   * @param {string} name
   */
  async runNow(name) {
    if (!this._jobs.has(name)) {
      this._warn(`runNow: '${name}' no existe`);
      return;
    }
    await this._runJob(name);
  }

  // ── Diagnóstico ──────────────────────────────────────────────────────────

  getStatus() {
    const jobs = [];
    for (const [name, job] of this._jobs) {
      jobs.push({
        name,
        intervalMs: job.intervalMs,
        lastRun:    job.lastRun,
        runCount:   job.runCount,
        errors:     job.errors,
        active:     !!job.timer,
      });
    }
    return {
      running:    this._running,
      totalJobs:  this._jobs.size,
      jobs,
      recentLog:  this._log.slice(-30),
    };
  }

  summary() {
    const s = this.getStatus();
    const active = s.jobs.filter(j => j.active).length;
    return [
      `AgentScheduler:`,
      `  estado:    ${s.running ? 'corriendo' : 'detenido'}`,
      `  jobs:      ${s.totalJobs} (${active} activos)`,
      s.jobs.map(j =>
        `  • ${j.name.padEnd(22)} cada ${Math.round(j.intervalMs / 60000)}min  ` +
        `runs=${j.runCount}  err=${j.errors}  último=${j.lastRun || 'nunca'}`
      ).join('\n'),
    ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Factory: scheduler con jobs predeterminados enlazados a MemoryOrchestrator
// ---------------------------------------------------------------------------

/**
 * Crea un AgentScheduler con jobs predefinidos.
 * Acepta un `MemoryOrchestrator` opcional para wiring automático.
 *
 * @param {object} [opts]
 * @param {object} [orchestrator] - instancia de MemoryOrchestrator (opcional)
 * @returns {AgentScheduler}
 */
function createDefaultScheduler(opts = {}, orchestrator = null) {
  const scheduler = new AgentScheduler(opts);

  // Job: consolidar memoria (enlaza al orquestador si se provee)
  scheduler.addJob(
    'memoriaConsolidar',
    (opts.intervals || DEFAULTS.intervals).memoriaConsolidar,
    async () => {
      if (orchestrator && typeof orchestrator.run === 'function') {
        await orchestrator.run();
      }
    }
  );

  // Job: extraer dataset (enlaza al orquestador si se provee)
  scheduler.addJob(
    'datasetExtraer',
    (opts.intervals || DEFAULTS.intervals).datasetExtraer,
    async () => {
      if (orchestrator && typeof orchestrator.extractExamples === 'function') {
        await orchestrator.extractExamples();
      }
    }
  );

  // Job: doctor nocturno — placeholder para health-checks futuros
  scheduler.addJob(
    'doctorNocturno',
    (opts.intervals || DEFAULTS.intervals).doctorNocturno,
    async () => {
      // Futuro: skills_manager.py doctor --strict via child_process
    }
  );

  // Job: gateway status — placeholder para verificación del servidor MCP
  scheduler.addJob(
    'gatewayStatus',
    (opts.intervals || DEFAULTS.intervals).gatewayStatus,
    async () => {
      // Futuro: ping al servidor MCP local o gateway
    }
  );

  // Job: revisar pendientes — placeholder para procesar tasks.yaml pendientes
  scheduler.addJob(
    'revisarPendientes',
    (opts.intervals || DEFAULTS.intervals).revisarPendientes,
    async () => {
      // Futuro: leer copilot-agent/tasks.yaml y procesar tareas pending
    }
  );

  return scheduler;
}

module.exports = { AgentScheduler, DEFAULTS, createDefaultScheduler };
