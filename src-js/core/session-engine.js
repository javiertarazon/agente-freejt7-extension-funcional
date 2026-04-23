'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');

class SessionEngine extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.rootDir = opts.rootDir || process.cwd();
    this.statePath = opts.statePath || path.join(this.rootDir, 'copilot-agent', 'panel-state.json');
    this.workerCount = Number(opts.workerCount || 3);
    this.policyEngine = opts.policyEngine;
    this.providerRouter = opts.providerRouter;
    this.auditBus = opts.auditBus;
    this.output = opts.output || null;

    this._running = false;
    this._workers = [];
    this._sessions = {};
    this._queue = [];
    this._taskIndex = {};

    this._loadState();
  }

  _emitAudit(sessionId, type, payload = {}) {
    if (this.auditBus) {
      this.auditBus.emit(sessionId, type, payload);
    }
  }

  _saveState() {
    const state = {
      savedAt: new Date().toISOString(),
      sessions: this._sessions,
      queue: this._queue,
      taskIndex: this._taskIndex,
      workerCount: this.workerCount,
    };

    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  _loadState() {
    try {
      if (!fs.existsSync(this.statePath)) {
        return;
      }
      const data = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      this._sessions = data.sessions || {};
      this._queue = Array.isArray(data.queue) ? data.queue : [];
      this._taskIndex = data.taskIndex || {};
    } catch (_) {
      this._sessions = {};
      this._queue = [];
      this._taskIndex = {};
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    for (let i = 0; i < this.workerCount; i += 1) {
      this._runWorker(i + 1);
    }
  }

  stop() {
    this._running = false;
    this._workers = [];
    this._saveState();
  }

  getState() {
    return {
      sessions: this._sessions,
      queue: this._queue,
      workerCount: this.workerCount,
      running: this._running,
    };
  }

  createSession(input = {}) {
    const sessionId = input.sessionId || `panel-${randomUUID().slice(0, 8)}`;
    const session = {
      sessionId,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      title: String(input.title || 'Sesion Free JT7'),
      tasks: [],
    };
    this._sessions[sessionId] = session;
    this._saveState();
    this._emitAudit(sessionId, 'session.created', { title: session.title });
    this.emit('session', { type: 'session.created', session });
    return session;
  }

  enqueueTask(sessionId, taskInput = {}) {
    const session = this._sessions[sessionId] || this.createSession({ sessionId, title: taskInput.title || 'Sesion automatica' });
    const taskId = taskInput.taskId || `task-${randomUUID().slice(0, 10)}`;
    const task = {
      taskId,
      sessionId,
      goal: String(taskInput.goal || taskInput.prompt || '').trim(),
      provider: String(taskInput.provider || '').trim(),
      model: String(taskInput.model || '').trim(),
      retries: Number(taskInput.retries || 0),
      maxRetries: Number(taskInput.maxRetries || 2),
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approval: null,
      result: null,
      error: null,
      risk: null,
    };

    const policy = this.policyEngine.evaluate(task);
    task.risk = policy.risk;

    session.tasks.push(taskId);
    session.updatedAt = new Date().toISOString();
    this._taskIndex[taskId] = task;
    this._queue.push(taskId);

    this._saveState();
    this._emitAudit(sessionId, 'task.enqueued', { taskId, risk: task.risk });
    this.emit('task', { type: 'task.enqueued', task });
    return task;
  }

  resolveApproval(sessionId, taskId, approved, reason = '') {
    const task = this._taskIndex[taskId];
    if (!task || task.sessionId !== sessionId) return null;
    task.approval = {
      approved: Boolean(approved),
      reason: String(reason || ''),
      resolvedAt: new Date().toISOString(),
    };
    task.updatedAt = new Date().toISOString();
    if (approved && task.status === 'waiting_approval') {
      task.status = 'queued';
      this._queue.push(taskId);
    }
    if (!approved) {
      task.status = 'rejected';
    }
    this._saveState();
    this._emitAudit(sessionId, 'approval.resolved', { taskId, approved: Boolean(approved), reason: task.approval.reason });
    this.emit('task', { type: 'approval.resolved', task });
    return task;
  }

  cancelTask(sessionId, taskId) {
    const task = this._taskIndex[taskId];
    if (!task || task.sessionId !== sessionId) return null;
    task.status = 'canceled';
    task.updatedAt = new Date().toISOString();
    this._queue = this._queue.filter((id) => id !== taskId);
    this._saveState();
    this._emitAudit(sessionId, 'task.canceled', { taskId });
    this.emit('task', { type: 'task.canceled', task });
    return task;
  }

  retryTask(sessionId, taskId) {
    const task = this._taskIndex[taskId];
    if (!task || task.sessionId !== sessionId) return null;
    if (task.status !== 'failed' && task.status !== 'rejected' && task.status !== 'canceled') return null;
    task.status = 'queued';
    task.error = null;
    task.updatedAt = new Date().toISOString();
    this._queue.push(taskId);
    this._saveState();
    this._emitAudit(sessionId, 'task.retry.enqueued', { taskId, retries: task.retries });
    this.emit('task', { type: 'task.retry.enqueued', task });
    return task;
  }

  _takeNextTaskId() {
    while (this._queue.length > 0) {
      const taskId = this._queue.shift();
      const task = this._taskIndex[taskId];
      if (!task) continue;
      if (task.status !== 'queued') continue;
      return taskId;
    }
    return null;
  }

  async _runWorker(workerId) {
    const loop = async () => {
      while (this._running) {
        const nextTaskId = this._takeNextTaskId();
        if (!nextTaskId) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }

        const task = this._taskIndex[nextTaskId];
        if (!task) continue;
        await this._processTask(workerId, task);
      }
    };

    const promise = loop().catch((error) => {
      if (this.output) {
        this.output.appendLine(`[freejt7-panel] worker-${workerId} fatal: ${String(error.message || error)}`);
      }
    });
    this._workers.push(promise);
  }

  async _processTask(workerId, task) {
    const policy = this.policyEngine.evaluate(task);
    if (policy.requiresApproval && !(task.approval && task.approval.approved)) {
      task.status = 'waiting_approval';
      task.updatedAt = new Date().toISOString();
      this._saveState();
      this._emitAudit(task.sessionId, 'approval.requested', { taskId: task.taskId, risk: policy.risk });
      this.emit('task', { type: 'approval.requested', task });
      return;
    }

    task.status = 'running';
    task.updatedAt = new Date().toISOString();
    this._saveState();
    this._emitAudit(task.sessionId, 'task.started', { taskId: task.taskId, workerId });
    this.emit('task', { type: 'task.started', task, workerId });

    try {
      const result = await this.providerRouter.execute(task, {
        defaultProvider: task.provider || 'openrouter',
        defaultModel: task.model || '',
        workspacePath: this.rootDir,
      });
      task.status = 'completed';
      task.result = result;
      task.error = null;
      task.updatedAt = new Date().toISOString();
      this._saveState();
      this._emitAudit(task.sessionId, 'task.completed', {
        taskId: task.taskId,
        provider: result.provider,
        model: result.model,
      });
      this.emit('task', { type: 'task.completed', task, workerId });
    } catch (error) {
      task.retries += 1;
      task.error = String(error.message || error);
      task.updatedAt = new Date().toISOString();

      if (task.retries <= task.maxRetries) {
        task.status = 'queued';
        this._queue.push(task.taskId);
        this._emitAudit(task.sessionId, 'task.retry.scheduled', {
          taskId: task.taskId,
          retries: task.retries,
          maxRetries: task.maxRetries,
          error: task.error,
        });
        this.emit('task', { type: 'task.retry.scheduled', task, workerId });
      } else {
        task.status = 'failed';
        this._emitAudit(task.sessionId, 'task.failed', {
          taskId: task.taskId,
          retries: task.retries,
          error: task.error,
        });
        this.emit('task', { type: 'task.failed', task, workerId });
      }

      this._saveState();
    }
  }
}

module.exports = {
  SessionEngine,
};
