'use strict';

class PolicyEngine {
  constructor(opts = {}) {
    this.mode = String(opts.mode || 'mixed').toLowerCase();
    this.highRiskKeywords = [
      'rm -rf',
      'git reset --hard',
      'format disk',
      'delete all',
      'drop database',
      'shutdown',
      'revoke',
      'wipe',
    ];
  }

  classifyRisk(task = {}) {
    const explicit = String(task.risk || '').toLowerCase();
    if (explicit === 'low' || explicit === 'medium' || explicit === 'high') {
      return explicit;
    }

    const goal = String(task.goal || task.prompt || '').toLowerCase();
    if (this.highRiskKeywords.some((keyword) => goal.includes(keyword))) {
      return 'high';
    }

    if (goal.includes('deploy') || goal.includes('migration') || goal.includes('production')) {
      return 'medium';
    }

    return 'low';
  }

  evaluate(task = {}) {
    const risk = this.classifyRisk(task);

    if (this.mode === 'autonomous') {
      return { risk, requiresApproval: false };
    }

    if (this.mode === 'assisted') {
      return { risk, requiresApproval: true };
    }

    return {
      risk,
      requiresApproval: risk === 'high',
    };
  }
}

module.exports = {
  PolicyEngine,
};
