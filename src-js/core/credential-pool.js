'use strict';

/**
 * Credential Pool - Adapted from Hermes Agent
 * 
 * Source: hermes-agent/agent/credential_pool.py
 * License: MIT
 * 
 * Persistent multi-credential pool for same-provider failover.
 * Supports multiple strategies: fill_first, round_robin, random, least_used.
 * Includes cooldown for rate-limited (429) and billing (402) errors.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Status constants
const STATUS_OK = 'ok';
const STATUS_EXHAUSTED = 'exhausted';

// Auth type constants
const AUTH_TYPE_OAUTH = 'oauth';
const AUTH_TYPE_API_KEY = 'api_key';

// Source constants
const SOURCE_MANUAL = 'manual';

// Strategy constants
const STRATEGY_FILL_FIRST = 'fill_first';
const STRATEGY_ROUND_ROBIN = 'round_robin';
const STRATEGY_RANDOM = 'random';
const STRATEGY_LEAST_USED = 'least_used';

const SUPPORTED_POOL_STRATEGIES = new Set([
  STRATEGY_FILL_FIRST,
  STRATEGY_ROUND_ROBIN,
  STRATEGY_RANDOM,
  STRATEGY_LEAST_USED,
]);

// Cooldown before retrying an exhausted credential
// 429 (rate-limited) and 402 (billing/quota) both cool down after 1 hour
const EXHAUSTED_TTL_429_SECONDS = 60 * 60;
const EXHAUSTED_TTL_DEFAULT_SECONDS = 60 * 60;

/**
 * Pooled Credential
 */
class PooledCredential {
  constructor(options = {}) {
    this.provider = options.provider || '';
    this.id = options.id || generateId();
    this.label = options.label || options.provider || '';
    this.authType = options.authType || AUTH_TYPE_API_KEY;
    this.priority = options.priority || 0;
    this.source = options.source || SOURCE_MANUAL;
    this.accessToken = options.accessToken || '';
    this.refreshToken = options.refreshToken || null;
    this.baseUrl = options.baseUrl || null;
    
    // Status tracking
    this.lastStatus = null;
    this.lastStatusAt = null;
    this.lastErrorCode = null;
    this.lastErrorReason = null;
    this.lastErrorMessage = null;
    this.lastErrorResetAt = null;
    
    // Usage tracking
    this.requestCount = 0;
    
    // Extra fields
    this.extra = options.extra || {};
  }

  static fromDict(provider, payload) {
    return new PooledCredential({
      provider,
      id: payload.id || generateId(),
      label: payload.label || payload.source || provider,
      authType: payload.auth_type || AUTH_TYPE_API_KEY,
      priority: payload.priority || 0,
      source: payload.source || SOURCE_MANUAL,
      accessToken: payload.access_token || '',
      refreshToken: payload.refresh_token || null,
      baseUrl: payload.base_url || null,
      extra: payload.extra || {},
    });
  }

  toDict() {
    return {
      provider: this.provider,
      id: this.id,
      label: this.label,
      auth_type: this.authType,
      priority: this.priority,
      source: this.source,
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      base_url: this.baseUrl,
      last_status: this.lastStatus,
      last_status_at: this.lastStatusAt,
      last_error_code: this.lastErrorCode,
      last_error_reason: this.lastErrorReason,
      last_error_message: this.lastErrorMessage,
      last_error_reset_at: this.lastErrorResetAt,
      request_count: this.requestCount,
    };
  }

  /**
   * Check if credential is usable (not exhausted or cooldown expired)
   */
  isUsable() {
    if (this.lastStatus !== STATUS_EXHAUSTED) return true;
    
    if (!this.lastErrorResetAt) return true;
    
    const now = Date.now() / 1000;
    return now >= this.lastErrorResetAt;
  }

  /**
   * Mark credential as exhausted
   */
  markExhausted(errorCode, reason, ttlSeconds = null) {
    this.lastStatus = STATUS_EXHAUSTED;
    this.lastStatusAt = Date.now() / 1000;
    this.lastErrorCode = errorCode;
    this.lastErrorReason = reason;
    
    const ttl = ttlSeconds || (errorCode === 429 ? EXHAUSTED_TTL_429_SECONDS : EXHAUSTED_TTL_DEFAULT_SECONDS);
    this.lastErrorResetAt = (Date.now() / 1000) + ttl;
  }

  /**
   * Mark credential as ok
   */
  markOk() {
    this.lastStatus = STATUS_OK;
    this.lastStatusAt = Date.now() / 1000;
    this.lastErrorCode = null;
    this.lastErrorReason = null;
    this.lastErrorMessage = null;
    this.lastErrorResetAt = null;
  }

  /**
   * Increment request count
   */
  incrementUse() {
    this.requestCount++;
  }
}

/**
 * Credential Pool
 */
class CredentialPool {
  constructor(options = {}) {
    this.poolPath = options.poolPath || getDefaultPoolPath();
    this.strategy = options.strategy || STRATEGY_FILL_FIRST;
    this.credentials = new Map(); // provider -> [PooledCredential]
    this._roundRobinIndex = new Map(); // provider -> index
    
    this._load();
  }

  /**
   * Add credential to pool
   */
  addCredential(credential) {
    if (!(credential instanceof PooledCredential)) {
      credential = PooledCredential.fromDict(credential.provider, credential);
    }
    
    if (!this.credentials.has(credential.provider)) {
      this.credentials.set(credential.provider, []);
    }
    
    const creds = this.credentials.get(credential.provider);
    
    // Check for duplicate
    const existing = creds.find(c => c.id === credential.id || c.accessToken === credential.accessToken);
    if (existing) {
      // Update existing
      Object.assign(existing, credential);
      return existing;
    }
    
    creds.push(credential);
    
    // Sort by priority
    creds.sort((a, b) => b.priority - a.priority);
    
    this._save();
    return credential;
  }

  /**
   * Get next usable credential for provider
   */
  getCredential(provider) {
    const creds = this.credentials.get(provider) || [];
    const usable = creds.filter(c => c.isUsable());
    
    if (usable.length === 0) return null;
    
    switch (this.strategy) {
      case STRATEGY_FILL_FIRST:
        return usable[0];
      
      case STRATEGY_ROUND_ROBIN: {
        const idx = this._roundRobinIndex.get(provider) || 0;
        const selected = usable[idx % usable.length];
        this._roundRobinIndex.set(provider, idx + 1);
        return selected;
      }
      
      case STRATEGY_RANDOM:
        return usable[Math.floor(Math.random() * usable.length)];
      
      case STRATEGY_LEAST_USED:
        return usable.reduce((min, c) => 
          c.requestCount < min.requestCount ? c : min, usable[0]);
      
      default:
        return usable[0];
    }
  }

  /**
   * Report credential usage result
   */
  reportResult(credential, success, errorCode = null, errorMessage = null) {
    if (success) {
      credential.markOk();
    } else if (errorCode === 429 || errorCode === 402) {
      credential.markExhausted(errorCode, errorMessage);
    }
    
    this._save();
  }

  /**
   * Get all credentials for provider
   */
  getCredentials(provider) {
    return this.credentials.get(provider) || [];
  }

  /**
   * Remove credential
   */
  removeCredential(provider, credentialId) {
    const creds = this.credentials.get(provider) || [];
    const idx = creds.findIndex(c => c.id === credentialId);
    if (idx !== -1) {
      creds.splice(idx, 1);
      this._save();
      return true;
    }
    return false;
  }

  /**
   * List all providers with credentials
   */
  listProviders() {
    return Array.from(this.credentials.keys());
  }

  /**
   * Load pool from disk
   */
  _load() {
    try {
      if (!fs.existsSync(this.poolPath)) return;
      
      const data = JSON.parse(fs.readFileSync(this.poolPath, 'utf-8'));
      
      for (const [provider, creds] of Object.entries(data)) {
        if (!Array.isArray(creds)) continue;
        
        this.credentials.set(provider, creds.map(c => PooledCredential.fromDict(provider, c)));
      }
    } catch (error) {
      console.error('[CredentialPool] Load error:', error.message);
    }
  }

  /**
   * Save pool to disk
   */
  _save() {
    try {
      const dir = path.dirname(this.poolPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = {};
      for (const [provider, creds] of this.credentials) {
        data[provider] = creds.map(c => c.toDict());
      }
      
      fs.writeFileSync(this.poolPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[CredentialPool] Save error:', error.message);
    }
  }
}

/**
 * Generate random ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Get default pool path
 */
function getDefaultPoolPath() {
  return path.join(os.homedir(), '.freejt7', 'credential-pool.json');
}

module.exports = {
  CredentialPool,
  PooledCredential,
  STATUS_OK,
  STATUS_EXHAUSTED,
  AUTH_TYPE_OAUTH,
  AUTH_TYPE_API_KEY,
  SOURCE_MANUAL,
  STRATEGY_FILL_FIRST,
  STRATEGY_ROUND_ROBIN,
  STRATEGY_RANDOM,
  STRATEGY_LEAST_USED,
  EXHAUSTED_TTL_429_SECONDS,
  EXHAUSTED_TTL_DEFAULT_SECONDS,
};
