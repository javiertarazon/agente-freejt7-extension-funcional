'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  findOpenClawBinary,
} = require('../src-js/core/extension.runtime.js');

const BIN_NAME = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';

function createFakeBinary(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = process.platform === 'win32'
    ? '@echo off\r\necho openclaw\r\n'
    : '#!/usr/bin/env sh\necho openclaw\n';
  fs.writeFileSync(filePath, content, 'utf8');
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
}

function testResolvesLocalBinaryInOpenClawFolderWithSpaces() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'free jt7 openclaw ws-'));
  const localBin = path.join(workspace, 'open claw local', 'bin', BIN_NAME);
  createFakeBinary(localBin);

  const resolved = findOpenClawBinary(workspace);
  assert.strictEqual(
    resolved,
    localBin,
    'debe resolver binario local dentro de carpeta "open claw" con espacios y ruta no rígida',
  );
}

function testResolvesWorkspaceNodeModulesBinary() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'free jt7 openclaw root-'));
  const localBin = path.join(workspace, 'node_modules', '.bin', BIN_NAME);
  createFakeBinary(localBin);

  const resolved = findOpenClawBinary(workspace);
  assert.strictEqual(
    resolved,
    localBin,
    'debe resolver binario local en node_modules/.bin del workspace',
  );
}

function testFallsBackToPathBinary() {
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'free jt7 openclaw isolated-home-'));
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = isolatedHome;
  process.env.USERPROFILE = isolatedHome;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'free jt7 openclaw fallback-'));
  try {
    const resolved = findOpenClawBinary(workspace);
    assert.strictEqual(resolved, 'openclaw', 'sin binario local ni binario de usuario debe mantener fallback a PATH');
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
}

function testResolvesUserLocalBinaryOutsideWorkspace() {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'free jt7 openclaw home-'));
  const localBin = path.join(homeDir, '.local', 'bin', BIN_NAME);
  createFakeBinary(localBin);
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  try {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'free jt7 openclaw no-local-'));
    const resolved = findOpenClawBinary(workspace);
    assert.strictEqual(
      resolved,
      localBin,
      'debe resolver binario en ~/.local/bin cuando el PATH del host grafico no lo expone',
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
}

function main() {
  testResolvesLocalBinaryInOpenClawFolderWithSpaces();
  testResolvesWorkspaceNodeModulesBinary();
  testResolvesUserLocalBinaryOutsideWorkspace();
  testFallsBackToPathBinary();
  console.log('openclaw_binary_resolution_smoke: OK');
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}
