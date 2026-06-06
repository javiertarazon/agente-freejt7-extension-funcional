'use strict';

const fs = require('fs');
const path = require('path');

const OWNED_IDE_CONTROL_PLANE_SCHEMA_VERSION = '2026-05-01-owned-ide-v1';

const DEFAULT_OWNED_IDE_CONTROL_PLANE = Object.freeze({
  schemaVersion: OWNED_IDE_CONTROL_PLANE_SCHEMA_VERSION,
  mode: 'freejt7-owned-ide',
  ide: {
    ownerMode: 'agent',
    hostVisibility: 'minimal',
    openOnStartup: true,
    panelEnabled: true,
  },
  runtime: {
    executionMode: 'agent',
    runtimeBackend: 'freejt7-v2',
    policyMode: 'autonomous',
    policyProfile: 'coding',
    workerPoolSize: 3,
  },
  provider: {
    activeProvider: 'openrouter',
    activeModel: '',
    authProfile: 'default',
    providerSelections: {},
    fallbackProviders: [],
  },
  memory: {
    persistence: 'profile',
    contextBudgeting: 'adaptive',
    subagents: 'enabled',
  },
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneDefaultControlPlane() {
  return JSON.parse(JSON.stringify(DEFAULT_OWNED_IDE_CONTROL_PLANE));
}

function mergeControlPlane(base, patch) {
  const source = isPlainObject(base) ? base : {};
  const extra = isPlainObject(patch) ? patch : {};
  const result = { ...source };
  for (const [key, value] of Object.entries(extra)) {
    if (Array.isArray(value)) {
      result[key] = value.map((item) => (isPlainObject(item) ? mergeControlPlane({}, item) : item));
      continue;
    }
    if (isPlainObject(value)) {
      result[key] = mergeControlPlane(isPlainObject(source[key]) ? source[key] : {}, value);
      continue;
    }
    result[key] = value;
  }
  return result;
}

function resolveOwnedIdeProfileRoot(options = {}) {
  const explicit = String(
    options.profileRoot || process.env.FREEJT7_APP_PROFILE_ROOT || ''
  ).trim();
  return explicit ? path.resolve(explicit) : '';
}

function resolveOwnedIdeControlPlanePath(options = {}) {
  const explicit = String(
    options.controlPlanePath || options.configPath || process.env.FREEJT7_PRODUCT_CONFIG_PATH || ''
  ).trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  const profileRoot = resolveOwnedIdeProfileRoot(options);
  if (!profileRoot) {
    return '';
  }
  return path.join(profileRoot, 'freejt7-owned-ide.json');
}

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readOwnedIdeControlPlane(options = {}) {
  const profileRoot = resolveOwnedIdeProfileRoot(options);
  const controlPlanePath = resolveOwnedIdeControlPlanePath({ ...options, profileRoot });
  const parsed = readJsonSafe(controlPlanePath);
  if (!parsed) {
    if (options.allowMissing) {
      return null;
    }
    return {
      profileRoot,
      controlPlanePath,
      config: cloneDefaultControlPlane(),
    };
  }
  return {
    profileRoot,
    controlPlanePath,
    config: mergeControlPlane(cloneDefaultControlPlane(), parsed),
  };
}

function writeOwnedIdeControlPlane(nextConfig, options = {}) {
  const profileRoot = resolveOwnedIdeProfileRoot(options);
  const controlPlanePath = resolveOwnedIdeControlPlanePath({ ...options, profileRoot });
  const config = mergeControlPlane(cloneDefaultControlPlane(), nextConfig);
  if (!controlPlanePath) {
    return {
      profileRoot,
      controlPlanePath,
      config,
    };
  }
  fs.mkdirSync(path.dirname(controlPlanePath), { recursive: true });
  fs.writeFileSync(controlPlanePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return {
    profileRoot,
    controlPlanePath,
    config,
  };
}

function patchOwnedIdeControlPlane(partialConfig, options = {}) {
  const current = readOwnedIdeControlPlane(options);
  const base = current?.config || cloneDefaultControlPlane();
  return writeOwnedIdeControlPlane(mergeControlPlane(base, partialConfig), options);
}

module.exports = {
  DEFAULT_OWNED_IDE_CONTROL_PLANE,
  OWNED_IDE_CONTROL_PLANE_SCHEMA_VERSION,
  resolveOwnedIdeProfileRoot,
  resolveOwnedIdeControlPlanePath,
  readOwnedIdeControlPlane,
  writeOwnedIdeControlPlane,
  patchOwnedIdeControlPlane,
};