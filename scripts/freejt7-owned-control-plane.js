'use strict';

const fs = require('fs');
const path = require('path');

const OWNED_IDE_CONTROL_PLANE_SCHEMA_VERSION = '2026-05-02-owned-ide-v2';

const DEFAULT_OWNED_IDE_CONTROL_PLANE = Object.freeze({
  schemaVersion: OWNED_IDE_CONTROL_PLANE_SCHEMA_VERSION,
  mode: 'freejt7-owned-ide',
  product: {
    productMode: 'agent-first',
    configAuthority: 'control-plane',
    runtimeAuthority: 'freejt7',
    hostIntegration: 'secondary',
  },
  shell: {
    experience: 'agent-first',
    primarySurface: 'panel',
    settingsAuthority: 'control-plane',
    chatParticipantEnabled: false,
    quickActionsEnabled: true,
  },
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

function normalizeChoice(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizePositiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return fallback;
  }
  return Math.trunc(normalized);
}

function normalizeSelectionMap(value) {
  if (!isPlainObject(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([provider, model]) => [String(provider || '').trim().toLowerCase(), String(model || '').trim()])
      .filter(([provider]) => Boolean(provider)),
  );
}

function normalizeFallbackProviders(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!isPlainObject(item)) {
        return null;
      }
      const provider = String(item.provider || '').trim().toLowerCase();
      if (!provider) {
        return null;
      }
      return {
        provider,
        model: String(item.model || '').trim(),
      };
    })
    .filter(Boolean);
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

function normalizeOwnedIdeControlPlane(nextConfig) {
  const merged = mergeControlPlane(cloneDefaultControlPlane(), nextConfig);
  const normalized = { ...merged };

  normalized.schemaVersion = OWNED_IDE_CONTROL_PLANE_SCHEMA_VERSION;
  normalized.mode = 'freejt7-owned-ide';
  normalized.product = {
    ...mergeControlPlane(DEFAULT_OWNED_IDE_CONTROL_PLANE.product, merged.product),
    productMode: normalizeChoice(merged?.product?.productMode, ['agent-first'], 'agent-first'),
    configAuthority: normalizeChoice(merged?.product?.configAuthority, ['control-plane'], 'control-plane'),
    runtimeAuthority: normalizeChoice(merged?.product?.runtimeAuthority, ['freejt7', 'host-adapter'], 'freejt7'),
    hostIntegration: normalizeChoice(merged?.product?.hostIntegration, ['secondary', 'legacy-adapter', 'hidden'], 'secondary'),
  };
  normalized.shell = {
    ...mergeControlPlane(DEFAULT_OWNED_IDE_CONTROL_PLANE.shell, merged.shell),
    experience: normalizeChoice(merged?.shell?.experience, ['agent-first'], 'agent-first'),
    primarySurface: normalizeChoice(merged?.shell?.primarySurface, ['panel', 'agent-shell', 'headless'], 'panel'),
    settingsAuthority: normalizeChoice(merged?.shell?.settingsAuthority, ['control-plane'], 'control-plane'),
    chatParticipantEnabled: normalizeBoolean(merged?.shell?.chatParticipantEnabled, false),
    quickActionsEnabled: normalizeBoolean(merged?.shell?.quickActionsEnabled, true),
  };
  normalized.ide = {
    ...mergeControlPlane(DEFAULT_OWNED_IDE_CONTROL_PLANE.ide, merged.ide),
    ownerMode: normalizeChoice(merged?.ide?.ownerMode, ['agent', 'user'], 'agent'),
    hostVisibility: normalizeChoice(merged?.ide?.hostVisibility, ['minimal', 'hidden', 'full'], 'minimal'),
    openOnStartup: normalizeBoolean(merged?.ide?.openOnStartup, true),
    panelEnabled: normalizeBoolean(merged?.ide?.panelEnabled, true),
  };
  normalized.runtime = {
    ...mergeControlPlane(DEFAULT_OWNED_IDE_CONTROL_PLANE.runtime, merged.runtime),
    executionMode: normalizeChoice(merged?.runtime?.executionMode, ['agent'], 'agent'),
    runtimeBackend: String(merged?.runtime?.runtimeBackend || DEFAULT_OWNED_IDE_CONTROL_PLANE.runtime.runtimeBackend).trim().toLowerCase() || DEFAULT_OWNED_IDE_CONTROL_PLANE.runtime.runtimeBackend,
    policyMode: String(merged?.runtime?.policyMode || DEFAULT_OWNED_IDE_CONTROL_PLANE.runtime.policyMode).trim().toLowerCase() || DEFAULT_OWNED_IDE_CONTROL_PLANE.runtime.policyMode,
    policyProfile: String(merged?.runtime?.policyProfile || DEFAULT_OWNED_IDE_CONTROL_PLANE.runtime.policyProfile).trim().toLowerCase() || DEFAULT_OWNED_IDE_CONTROL_PLANE.runtime.policyProfile,
    workerPoolSize: normalizePositiveInteger(merged?.runtime?.workerPoolSize, DEFAULT_OWNED_IDE_CONTROL_PLANE.runtime.workerPoolSize),
  };
  normalized.provider = {
    ...mergeControlPlane(DEFAULT_OWNED_IDE_CONTROL_PLANE.provider, merged.provider),
    activeProvider: String(merged?.provider?.activeProvider || DEFAULT_OWNED_IDE_CONTROL_PLANE.provider.activeProvider).trim().toLowerCase() || DEFAULT_OWNED_IDE_CONTROL_PLANE.provider.activeProvider,
    activeModel: String(merged?.provider?.activeModel || '').trim(),
    authProfile: String(merged?.provider?.authProfile || DEFAULT_OWNED_IDE_CONTROL_PLANE.provider.authProfile).trim() || DEFAULT_OWNED_IDE_CONTROL_PLANE.provider.authProfile,
    providerSelections: normalizeSelectionMap(merged?.provider?.providerSelections),
    fallbackProviders: normalizeFallbackProviders(merged?.provider?.fallbackProviders),
  };
  normalized.memory = {
    ...mergeControlPlane(DEFAULT_OWNED_IDE_CONTROL_PLANE.memory, merged.memory),
    persistence: String(merged?.memory?.persistence || DEFAULT_OWNED_IDE_CONTROL_PLANE.memory.persistence).trim().toLowerCase() || DEFAULT_OWNED_IDE_CONTROL_PLANE.memory.persistence,
    contextBudgeting: String(merged?.memory?.contextBudgeting || DEFAULT_OWNED_IDE_CONTROL_PLANE.memory.contextBudgeting).trim().toLowerCase() || DEFAULT_OWNED_IDE_CONTROL_PLANE.memory.contextBudgeting,
    subagents: String(merged?.memory?.subagents || DEFAULT_OWNED_IDE_CONTROL_PLANE.memory.subagents).trim().toLowerCase() || DEFAULT_OWNED_IDE_CONTROL_PLANE.memory.subagents,
  };

  return normalized;
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
      config: normalizeOwnedIdeControlPlane(cloneDefaultControlPlane()),
    };
  }
  return {
    profileRoot,
    controlPlanePath,
    config: normalizeOwnedIdeControlPlane(parsed),
  };
}

function writeOwnedIdeControlPlane(nextConfig, options = {}) {
  const profileRoot = resolveOwnedIdeProfileRoot(options);
  const controlPlanePath = resolveOwnedIdeControlPlanePath({ ...options, profileRoot });
  const config = normalizeOwnedIdeControlPlane(nextConfig);
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