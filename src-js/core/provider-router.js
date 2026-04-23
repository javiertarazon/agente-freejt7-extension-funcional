'use strict';

const { callProvider } = require('../providers/api-provider-adapter');

class ProviderRouter {
  constructor(opts = {}) {
    this.context = opts.context;
    this.output = opts.output || null;
    this.executeCopilotTask = opts.executeCopilotTask;
    this.workspacePath = opts.workspacePath || "";
  }

  async execute(task = {}, runtime = {}) {
    const provider = String(task.provider || runtime.defaultProvider || 'openrouter').trim();
    const model = String(task.model || runtime.defaultModel || '').trim();
    const goal = String(task.goal || task.prompt || '').trim();

    if (!goal) {
      throw new Error('Task sin goal/prompt');
    }

    if (provider === 'copilot') {
      if (typeof this.executeCopilotTask !== 'function') {
        throw new Error('Copilot provider habilitado pero executeCopilotTask no configurado');
      }
      const result = await this.executeCopilotTask(goal, task);
      return {
        provider,
        model: model || 'default',
        summary: String(result?.final?.summary || result?.run?.summary || 'ok'),
        raw: result,
      };
    }

    const result = await callProvider(
      goal,
      { provider, model },
      this.context?.secrets,
      { workspacePath: runtime.workspacePath || this.workspacePath },
    );

    return {
      provider,
      model: model || 'default',
      summary: String(result?.final?.summary || result?.run?.summary || 'ok'),
      raw: result,
    };
  }
}

module.exports = {
  ProviderRouter,
};
