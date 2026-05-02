#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { patchOwnedIdeControlPlane } = require('./freejt7-owned-control-plane');

function parseArgs(argv) {
  const options = {
    repoRoot: path.resolve(__dirname, '..'),
    workspacePath: '',
    appHome: path.join(os.homedir(), '.freejt7-app'),
    profileName: 'default',
    ideBin: '',
    vsixPath: '',
    launch: true,
    skipInstall: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (!arg) continue;
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--no-launch') {
      options.launch = false;
      continue;
    }
    if (arg === '--skip-install') {
      options.skipInstall = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      options.repoRoot = path.resolve(arg.split('=').slice(1).join('='));
      continue;
    }
    if (arg.startsWith('--workspace=')) {
      options.workspacePath = path.resolve(arg.split('=').slice(1).join('='));
      continue;
    }
    if (arg.startsWith('--app-home=')) {
      options.appHome = path.resolve(arg.split('=').slice(1).join('='));
      continue;
    }
    if (arg.startsWith('--profile=')) {
      options.profileName = String(arg.split('=').slice(1).join('=') || 'default').trim() || 'default';
      continue;
    }
    if (arg.startsWith('--ide-bin=')) {
      options.ideBin = String(arg.split('=').slice(1).join('=')).trim();
      continue;
    }
    if (arg.startsWith('--vsix=')) {
      options.vsixPath = path.resolve(arg.split('=').slice(1).join('='));
      continue;
    }
    throw new Error(`Argumento no soportado: ${arg}`);
  }

  if (!options.workspacePath) {
    options.workspacePath = options.repoRoot;
  }

  return options;
}

function printHelp() {
  const lines = [
    'Free JT7 App Bootstrap',
    '',
    'Uso:',
    '  node scripts/freejt7-app-bootstrap.js [opciones]',
    '',
    'Opciones:',
    '  --repo-root=<path>      Raiz del repo (default: directorio padre de scripts/)',
    '  --workspace=<path>      Workspace a abrir (default: repo root)',
    '  --app-home=<path>       Home aislado de la app (default: ~/.freejt7-app)',
    '  --profile=<name>        Nombre de perfil aislado (default: default)',
    '  --ide-bin=<cmd|path>    Binario IDE (codium/code/cursor/kiro)',
    '  --vsix=<path>           VSIX a instalar',
    '  --skip-install          No reinstala VSIX',
    '  --no-launch             No abre la IDE',
    '  --dry-run               No ejecuta comandos externos',
    '  -h, --help              Ayuda',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function purgeExistingExtensionInstall(extensionsDir, packageId) {
  const root = path.resolve(String(extensionsDir || '').trim() || '.');
  if (!fs.existsSync(root)) return [];
  const prefix = String(packageId || '').trim().toLowerCase();
  if (!prefix) return [];
  const removed = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.toLowerCase().startsWith(prefix)) continue;
    const target = path.join(root, entry.name);
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(target);
  }
  return removed;
}

function extractVsix(vsixPath, destinationDir) {
  ensureDir(destinationDir);
  const unzipBin = resolveCommand('unzip');
  if (unzipBin) {
    runCommandOrThrow(unzipBin, ['-oq', vsixPath, '-d', destinationDir]);
    return;
  }
  const pythonBin = resolveCommand('python3') || resolveCommand('python');
  if (pythonBin) {
    runCommandOrThrow(pythonBin, ['-m', 'zipfile', '-e', vsixPath, destinationDir]);
    return;
  }
  throw new Error('No se encontro unzip ni Python para extraer la VSIX manualmente.');
}

function installVsixManually(vsixPath, extensionsDir, packageInfo) {
  const publisher = String(packageInfo.publisher || '').trim();
  const name = String(packageInfo.name || '').trim();
  const version = String(packageInfo.version || '').trim();
  if (!publisher || !name || !version) {
    throw new Error('No se pudo derivar publisher/name/version para instalar VSIX manualmente.');
  }
  const targetDir = path.join(extensionsDir, `${publisher}.${name}-${version}`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freejt7-vsix-'));
  try {
    extractVsix(vsixPath, tempDir);
    const extractedRoot = path.join(tempDir, 'extension');
    if (!fs.existsSync(extractedRoot)) {
      throw new Error('La VSIX no contiene carpeta extension/ esperada.');
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(extractedRoot, targetDir, { recursive: true });
    return targetDir;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function resolveCommand(command) {
  if (!command) return '';
  const looksLikePath = command.includes('/') || command.includes('\\');
  if (looksLikePath) {
    const abs = path.resolve(command);
    if (fs.existsSync(abs)) return abs;
    return '';
  }
  const probe = process.platform === 'win32'
    ? cp.spawnSync('where', [command], { encoding: 'utf8' })
    : cp.spawnSync('which', [command], { encoding: 'utf8' });
  if (probe.status !== 0) return '';
  const first = String(probe.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return first || '';
}

function detectIdeBinary(explicit) {
  const fromEnv = String(process.env.FREEJT7_APP_IDE_BIN || '').trim();
  const candidates = [
    explicit,
    fromEnv,
    'codium',
    'code',
    'code-insiders',
    'code-oss',
    'cursor',
    'kiro',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = resolveCommand(candidate);
    if (resolved) return resolved;
  }

  throw new Error(
    'No se encontro binario de IDE compatible. Instala VSCodium/VS Code/Cursor/Kiro o usa --ide-bin=<ruta>.'
  );
}

function findLatestVsix(repoRoot) {
  const files = fs.readdirSync(repoRoot)
    .filter((name) => /^agente-freejt7-extension-funcional-.*\.vsix$/i.test(name))
    .map((name) => path.join(repoRoot, name));
  if (files.length === 0) return '';
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

function ensureVsix(repoRoot, explicitVsixPath, dryRun) {
  if (explicitVsixPath) {
    if (!fs.existsSync(explicitVsixPath)) {
      throw new Error(`No existe el VSIX indicado: ${explicitVsixPath}`);
    }
    return explicitVsixPath;
  }

  const packageJsonPath = path.join(repoRoot, 'package.json');
  const pkg = readJsonSafe(packageJsonPath, {});
  const version = String(pkg.version || '').trim();
  if (version) {
    const expected = path.join(repoRoot, `agente-freejt7-extension-funcional-${version}.vsix`);
    if (fs.existsSync(expected)) {
      return expected;
    }
  }

  const latest = findLatestVsix(repoRoot);
  if (latest) {
    return latest;
  }

  if (dryRun) {
    throw new Error('No hay VSIX disponible (dry-run activo, no se ejecuta package:local).');
  }

  const pack = cp.spawnSync('npm', ['run', 'package:local'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (pack.status !== 0) {
    throw new Error('Fallo al ejecutar npm run package:local para generar VSIX.');
  }

  const generated = findLatestVsix(repoRoot);
  if (!generated) {
    throw new Error('Se ejecuto package:local pero no se encontro VSIX generado.');
  }
  return generated;
}

function mergeStandaloneSettings(base) {
  const settings = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};
  settings['freejt7.panel.enabled'] = true;
  settings['freejt7.panel.chatParticipant.enabled'] = false;
  settings['freejt7.panel.openOnStartup'] = true;
  settings['freejt7.panel.policy.mode'] = 'autonomous';
  settings['freejt7.panel.runtimeBackend'] = 'freejt7-v2';
  settings['freejt7.autoRepairGlobalSettings'] = false;
  settings['freejt7.autoInstallWorkspaceBridge'] = false;
  settings['freejt7.install.updateUserSettings'] = false;
  settings['freejt7.ide.ownerMode'] = 'agent';
  settings['freejt7.ide.hostVisibility'] = 'minimal';
  if (!settings['freejt7.apiProvider'] || String(settings['freejt7.apiProvider']).trim() === 'copilot') {
    settings['freejt7.apiProvider'] = 'openrouter';
  }
  settings['workbench.startupEditor'] = 'none';
  settings['github.copilot.enable'] = {
    '*': false,
  };
  settings['freejt7.app.standaloneMode'] = true;
  return settings;
}

function buildPaths(appHome, profileName) {
  const safeProfile = String(profileName || 'default').replace(/[^a-zA-Z0-9_.-]/g, '-');
  const profileRoot = path.join(appHome, 'profiles', safeProfile);
  return {
    profileRoot,
    userDataDir: path.join(profileRoot, 'user-data'),
    extensionsDir: path.join(profileRoot, 'extensions'),
    logsDir: path.join(profileRoot, 'logs'),
    profileMetaPath: path.join(profileRoot, 'freejt7-profile.json'),
    settingsPath: path.join(profileRoot, 'user-data', 'User', 'settings.json'),
    controlPlanePath: path.join(profileRoot, 'freejt7-owned-ide.json'),
  };
}

function runCommandOrThrow(bin, args, options = {}) {
  const result = cp.spawnSync(bin, args, {
    cwd: options.cwd || process.cwd(),
    stdio: 'inherit',
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Comando fallido (${result.status}): ${bin} ${args.join(' ')}`);
  }
}

function runCommandWithResult(bin, args, options = {}) {
  return cp.spawnSync(bin, args, {
    cwd: options.cwd || process.cwd(),
    stdio: options.stdio || 'pipe',
    env: options.env || process.env,
    encoding: options.encoding || 'utf8',
  });
}

function runBootstrap(inputOptions = {}) {
  const options = {
    ...inputOptions,
  };
  const ideBin = options.dryRun && options.ideBin
    ? String(options.ideBin)
    : detectIdeBinary(options.ideBin);
  const vsixPath = ensureVsix(options.repoRoot, options.vsixPath, options.dryRun);
  const paths = buildPaths(options.appHome, options.profileName);

  ensureDir(paths.userDataDir);
  ensureDir(paths.extensionsDir);
  ensureDir(paths.logsDir);

  const currentSettings = readJsonSafe(paths.settingsPath, {});
  const nextSettings = mergeStandaloneSettings(currentSettings);
  writeJson(paths.settingsPath, nextSettings);
  const activeProvider = String(nextSettings['freejt7.apiProvider'] || 'openrouter').trim() || 'openrouter';
  const activeModel = String(nextSettings['freejt7.apiProviderModel'] || '').trim();
  const providerSelections = activeModel ? { [activeProvider]: activeModel } : {};
  const controlPlane = patchOwnedIdeControlPlane({
    mode: 'freejt7-owned-ide',
    ide: {
      ownerMode: String(nextSettings['freejt7.ide.ownerMode'] || 'agent').trim().toLowerCase() || 'agent',
      hostVisibility: String(nextSettings['freejt7.ide.hostVisibility'] || 'minimal').trim().toLowerCase() || 'minimal',
      openOnStartup: nextSettings['freejt7.panel.openOnStartup'] !== false,
      panelEnabled: nextSettings['freejt7.panel.enabled'] !== false,
    },
    runtime: {
      executionMode: 'agent',
      runtimeBackend: String(nextSettings['freejt7.panel.runtimeBackend'] || 'freejt7-v2').trim().toLowerCase() || 'freejt7-v2',
      policyMode: String(nextSettings['freejt7.panel.policy.mode'] || 'autonomous').trim().toLowerCase() || 'autonomous',
      policyProfile: String(nextSettings['freejt7.panel.policyProfile'] || 'coding').trim().toLowerCase() || 'coding',
      workerPoolSize: Number(nextSettings['freejt7.panel.workerPool.size'] || 3) || 3,
    },
    provider: {
      activeProvider,
      activeModel,
      authProfile: String(nextSettings['freejt7.panel.authProfile'] || 'default').trim() || 'default',
      providerSelections,
      fallbackProviders: Array.isArray(nextSettings['freejt7.panel.fallbackProviders'])
        ? nextSettings['freejt7.panel.fallbackProviders']
        : [],
    },
  }, {
    profileRoot: paths.profileRoot,
    controlPlanePath: paths.controlPlanePath,
  });
  writeJson(paths.profileMetaPath, {
    updatedAt: new Date().toISOString(),
    mode: 'freejt7-owned-ide',
    ideBin,
    workspacePath: options.workspacePath,
    vsixPath,
    profileName: options.profileName,
    controlPlanePath: controlPlane.controlPlanePath,
  });

  const installArgs = [
    '--user-data-dir',
    paths.userDataDir,
    '--extensions-dir',
    paths.extensionsDir,
    '--install-extension',
    vsixPath,
    '--force',
  ];

  const launchArgs = [
    '--user-data-dir',
    paths.userDataDir,
    '--extensions-dir',
    paths.extensionsDir,
    '--new-window',
    '--disable-extension',
    'github.copilot',
    '--disable-extension',
    'GitHub.copilot',
    '--disable-extension',
    'github.copilot-chat',
    '--disable-extension',
    'GitHub.copilot-chat',
    '--disable-extension',
    'anthropic.claude-code',
    '--disable-extension',
    'openai.chatgpt',
    options.workspacePath,
  ];

  process.stdout.write(`[freejt7-app] ide=${ideBin}\n`);
  process.stdout.write(`[freejt7-app] profile=${paths.profileRoot}\n`);
  process.stdout.write(`[freejt7-app] workspace=${options.workspacePath}\n`);
  process.stdout.write(`[freejt7-app] vsix=${vsixPath}\n`);
  process.stdout.write(`[freejt7-app] control-plane=${controlPlane.controlPlanePath}\n`);

  if (!options.skipInstall) {
    if (options.dryRun) {
      process.stdout.write(`[freejt7-app] DRY-RUN install -> ${ideBin} ${installArgs.join(' ')}\n`);
    } else {
      const pkg = readJsonSafe(path.join(options.repoRoot, 'package.json'), {});
      const packageId = `${String(pkg.publisher || '').trim()}.${String(pkg.name || '').trim()}-`;
      const removed = purgeExistingExtensionInstall(paths.extensionsDir, packageId);
      if (removed.length > 0) {
        process.stdout.write(`[freejt7-app] purged existing install(s): ${removed.join(', ')}\n`);
      }
      const installResult = runCommandWithResult(ideBin, installArgs, { cwd: options.repoRoot });
      const installOutput = [
        String(installResult.stdout || '').trim(),
        String(installResult.stderr || '').trim(),
      ].filter(Boolean).join('\n');
      if (installOutput) {
        process.stdout.write(`${installOutput}\n`);
      }
      if (installResult.status !== 0) {
        if (/Please restart VSCodium before reinstalling|Failed Installing Extensions/i.test(installOutput)) {
          const installedDir = installVsixManually(vsixPath, paths.extensionsDir, pkg);
          process.stdout.write(`[freejt7-app] fallback manual install -> ${installedDir}\n`);
        } else {
          throw new Error(`Comando fallido (${installResult.status}): ${ideBin} ${installArgs.join(' ')}`);
        }
      }
    }
  }

  if (options.launch) {
    if (options.dryRun) {
      process.stdout.write(`[freejt7-app] DRY-RUN launch -> ${ideBin} ${launchArgs.join(' ')}\n`);
    } else {
      runCommandOrThrow(ideBin, launchArgs, {
        cwd: options.workspacePath,
        env: {
          ...process.env,
          FREEJT7_APP_MODE: '1',
          FREEJT7_APP_PROFILE_ROOT: paths.profileRoot,
          FREEJT7_PRODUCT_CONFIG_PATH: controlPlane.controlPlanePath,
        },
      });
    }
  } else {
    process.stdout.write('[freejt7-app] launch omitido (--no-launch).\n');
  }

  return {
    ideBin,
    vsixPath,
    paths,
    controlPlane,
    installArgs,
    launchArgs,
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    runBootstrap(options);
  } catch (error) {
    process.stderr.write(`[freejt7-app] ERROR: ${String(error.message || error)}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  mergeStandaloneSettings,
  buildPaths,
  runBootstrap,
};
