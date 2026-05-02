#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const cp = require('child_process');
const crypto = require('crypto');

const { runBootstrap } = require('./freejt7-app-bootstrap');

const DEFAULT_RUNTIME_PIN_PATH = path.join(__dirname, 'freejt7-vscodium-linux-x64.json');

function ensureSupportedOwnIdePlatform() {
  if (process.platform !== 'linux') {
    throw new Error(`Free JT7 own-ide solo soporta Linux por ahora. Plataforma actual: ${process.platform}`);
  }
  if (process.arch !== 'x64') {
    throw new Error(`Free JT7 own-ide solo soporta Linux x64 por ahora. Arquitectura actual: ${process.arch}`);
  }
}

function parseArgs(argv) {
  const options = {
    repoRoot: path.resolve(__dirname, '..'),
    workspacePath: '',
    appHome: path.join(os.homedir(), '.freejt7-app'),
    profileName: 'own-ide',
    launch: true,
    dryRun: false,
    forceDownload: false,
    skipInstall: false,
    ideBin: '',
    vsixPath: '',
    runtimePinPath: '',
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
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--force-download') {
      options.forceDownload = true;
      continue;
    }
    if (arg === '--skip-install') {
      options.skipInstall = true;
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
      options.profileName = String(arg.split('=').slice(1).join('=') || 'own-ide').trim() || 'own-ide';
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
    if (arg.startsWith('--runtime-pin=')) {
      options.runtimePinPath = path.resolve(arg.split('=').slice(1).join('='));
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
    'Free JT7 Own IDE Bootstrap',
    '',
    'Uso:',
    '  node scripts/freejt7-own-ide-bootstrap.js [opciones]',
    '',
    'Opciones:',
    '  --repo-root=<path>      Raiz del repo',
    '  --workspace=<path>      Workspace a abrir',
    '  --app-home=<path>       Home aislado de Free JT7 App',
    '  --profile=<name>        Perfil aislado (default: own-ide)',
    '  --ide-bin=<path>        Fuerza binario de IDE y omite descarga de VSCodium',
    '  --vsix=<path>           VSIX a instalar',
    '  --runtime-pin=<path>    JSON pinneado del runtime VSCodium Linux x64',
    '  --force-download        Fuerza recarga de runtime VSCodium',
    '  --skip-install          No reinstalar VSIX',
    '  --no-launch             No abrir IDE',
    '  --dry-run               Simulacion sin descargar ni ejecutar binarios',
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

function resolveCommand(command) {
  if (!command) return '';
  const looksLikePath = command.includes('/') || command.includes('\\');
  if (looksLikePath) {
    const abs = path.resolve(command);
    return fs.existsSync(abs) ? abs : '';
  }
  const probe = process.platform === 'win32'
    ? cp.spawnSync('where', [command], { encoding: 'utf8' })
    : cp.spawnSync('which', [command], { encoding: 'utf8' });
  if (probe.status !== 0) return '';
  const first = String(probe.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return first || '';
}

function readPinnedOwnIdeRuntime(pinPath = DEFAULT_RUNTIME_PIN_PATH) {
  const resolvedPath = path.resolve(pinPath);
  const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const releaseTag = String(raw.releaseTag || '').trim();
  const assetName = String(raw.assetName || '').trim();
  const assetUrl = String(raw.assetUrl || '').trim();
  const sha256 = String(raw.sha256 || '').trim().toLowerCase();
  if (!releaseTag || !assetName || !assetUrl || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`Pin de runtime invalido en ${resolvedPath}`);
  }
  return {
    path: resolvedPath,
    releaseTag,
    assetName,
    assetUrl,
    sha256,
    size: Number(raw.size || 0) || 0,
  };
}

function computeFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function verifyFileSha256(filePath, expectedSha256) {
  return computeFileSha256(filePath) === String(expectedSha256 || '').trim().toLowerCase();
}

function pickLinuxX64Asset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const tgz = assets.find((asset) => /VSCodium-linux-x64-.*\.tar\.gz$/i.test(String(asset?.name || '')));
  if (tgz) return tgz;
  const appImage = assets.find((asset) => /VSCodium-linux-x64-.*\.AppImage$/i.test(String(asset?.name || '')));
  if (appImage) return appImage;
  return null;
}

function inferVersionFromAsset(assetName, fallback) {
  const match = String(assetName || '').match(/VSCodium-linux-x64-([0-9A-Za-z.\-]+)\.(?:tar\.gz|AppImage)$/i);
  if (match && match[1]) return match[1];
  return String(fallback || 'latest').replace(/^v/i, '');
}

function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(destinationPath));
    const file = fs.createWriteStream(destinationPath);
    const req = https.get(url, {
      headers: { 'User-Agent': 'freejt7-own-ide-bootstrap' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.rmSync(destinationPath, { force: true });
        res.resume();
        downloadFile(res.headers.location, destinationPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.rmSync(destinationPath, { force: true });
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          reject(new Error(`HTTP ${res.statusCode} al descargar asset: ${Buffer.concat(chunks).toString('utf8').slice(0, 300)}`));
        });
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destinationPath));
      });
    });
    req.on('error', (error) => {
      file.close();
      fs.rmSync(destinationPath, { force: true });
      reject(error);
    });
  });
}

function execOrThrow(command, args, options = {}) {
  const res = cp.spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
  });
  if (res.status !== 0) {
    throw new Error(`Comando fallido (${res.status}): ${command} ${args.join(' ')}`);
  }
}

function findCodiumBinary(runtimeDir) {
  const candidates = [
    path.join(runtimeDir, 'current', 'bin', 'codium'),
    path.join(runtimeDir, 'current', 'codium'),
    path.join(runtimeDir, 'current', 'VSCodium-linux-x64', 'bin', 'codium'),
    path.join(runtimeDir, 'current', 'VSCodium-linux-x64', 'codium'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

async function ensureOwnIdeBinary(options) {
  ensureSupportedOwnIdePlatform();
  if (options.ideBin) {
    const forced = resolveCommand(options.ideBin);
    if (!forced) {
      throw new Error(`No existe --ide-bin=${options.ideBin}`);
    }
    return { ideBin: forced, source: 'forced' };
  }

  const fromEnv = resolveCommand(String(process.env.FREEJT7_OWN_IDE_BIN || '').trim());
  if (fromEnv) {
    return { ideBin: fromEnv, source: 'env' };
  }

  const runtimeDir = path.join(options.appHome, 'runtime', 'vscodium');
  const metadataPath = path.join(runtimeDir, 'metadata.json');
  const archiveDir = path.join(runtimeDir, 'archives');
  const extractDir = path.join(runtimeDir, 'versions');
  const currentLink = path.join(runtimeDir, 'current');

  ensureDir(runtimeDir);
  ensureDir(archiveDir);
  ensureDir(extractDir);

  if (!options.forceDownload) {
    const existing = findCodiumBinary(runtimeDir);
    if (existing) {
      return { ideBin: existing, source: 'cached' };
    }
  }

  if (options.dryRun) {
    return { ideBin: '/tmp/freejt7-vscodium-dry-run/codium', source: 'dry-run' };
  }

  const runtimePin = readPinnedOwnIdeRuntime(
    options.runtimePinPath
      || String(process.env.FREEJT7_VSCODIUM_RUNTIME_PIN || '').trim()
      || DEFAULT_RUNTIME_PIN_PATH,
  );
  const assetName = runtimePin.assetName;
  const version = inferVersionFromAsset(assetName, runtimePin.releaseTag);
  const archivePath = path.join(archiveDir, assetName);
  const versionDir = path.join(extractDir, version);

  if (fs.existsSync(archivePath) && !verifyFileSha256(archivePath, runtimePin.sha256)) {
    fs.rmSync(archivePath, { force: true });
  }

  if (!fs.existsSync(archivePath)) {
    process.stdout.write(`[freejt7-own-ide] Descargando VSCodium ${version}...\n`);
    await downloadFile(runtimePin.assetUrl, archivePath);
  }

  if (!verifyFileSha256(archivePath, runtimePin.sha256)) {
    fs.rmSync(archivePath, { force: true });
    throw new Error(`Checksum invalido para ${assetName}. Se esperaba ${runtimePin.sha256}`);
  }

  if (!fs.existsSync(versionDir) || options.forceDownload) {
    fs.rmSync(versionDir, { recursive: true, force: true });
    ensureDir(versionDir);
    if (/\.tar\.gz$/i.test(assetName)) {
      execOrThrow('tar', ['-xzf', archivePath, '-C', versionDir], { stdio: 'inherit' });
    } else if (/\.AppImage$/i.test(assetName)) {
      const dest = path.join(versionDir, 'VSCodium.AppImage');
      fs.copyFileSync(archivePath, dest);
      fs.chmodSync(dest, 0o755);
    } else {
      throw new Error(`Formato de asset no soportado: ${assetName}`);
    }
  }

  fs.rmSync(currentLink, { recursive: true, force: true });
  fs.mkdirSync(currentLink, { recursive: true });
  for (const entry of fs.readdirSync(versionDir)) {
    const src = path.join(versionDir, entry);
    const dst = path.join(currentLink, entry);
    fs.cpSync(src, dst, { recursive: true, force: true });
  }

  let ideBin = findCodiumBinary(runtimeDir);
  if (!ideBin && fs.existsSync(path.join(currentLink, 'VSCodium.AppImage'))) {
    ideBin = path.join(currentLink, 'VSCodium.AppImage');
  }
  if (!ideBin) {
    throw new Error('No se encontro binario ejecutable de VSCodium tras la instalacion.');
  }

  writeJson(metadataPath, {
    updatedAt: new Date().toISOString(),
    source: 'vscodium-pinned',
    releaseTag: runtimePin.releaseTag,
    assetName,
    archivePath,
    version,
    sha256: runtimePin.sha256,
    pinPath: runtimePin.path,
    ideBin,
  });

  return { ideBin, source: 'downloaded', version, assetName };
}

async function runOwnIdeBootstrap(rawOptions) {
  const options = { ...rawOptions };
  const ide = await ensureOwnIdeBinary(options);
  process.stdout.write(`[freejt7-own-ide] ide=${ide.ideBin} source=${ide.source}\n`);
  if (ide.version) {
    process.stdout.write(`[freejt7-own-ide] version=${ide.version} asset=${ide.assetName}\n`);
  }

  return runBootstrap({
    repoRoot: options.repoRoot,
    workspacePath: options.workspacePath,
    appHome: options.appHome,
    profileName: options.profileName,
    ideBin: ide.ideBin,
    vsixPath: options.vsixPath,
    launch: options.launch,
    skipInstall: options.skipInstall,
    dryRun: options.dryRun,
  });
}

if (require.main === module) {
  (async () => {
    try {
      const options = parseArgs(process.argv.slice(2));
      if (options.help) {
        printHelp();
        process.exit(0);
      }
      await runOwnIdeBootstrap(options);
    } catch (error) {
      process.stderr.write(`[freejt7-own-ide] ERROR: ${String(error.message || error)}\n`);
      process.exit(1);
    }
  })();
}

module.exports = {
  parseArgs,
  pickLinuxX64Asset,
  inferVersionFromAsset,
  ensureSupportedOwnIdePlatform,
  readPinnedOwnIdeRuntime,
  verifyFileSha256,
  ensureOwnIdeBinary,
  runOwnIdeBootstrap,
};
