#!/usr/bin/env node
'use strict';

/**
 * Hermes Integration Smoke Test
 * 
 * Verifica que los modulos adaptados de Hermes funcionan correctamente:
 * - context-compressor.js
 * - memory-manager.js
 * - credential-pool.js
 * - skill-resolver.js
 * - runtime-host-adapter.js
 */

const assert = require('assert');
const path = require('path');

// Colores para output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    passed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${error.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    passed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${error.message}`);
    failed++;
  }
}

console.log('\n=== Hermes Integration Smoke Test ===\n');

// Test 1: Context Compressor
console.log('--- Context Compressor ---');

test('ContextCompressor exports correctly', () => {
  const { ContextCompressor, SUMMARY_PREFIX, contentLengthForBudget } = require('../src-js/core/context-compressor');
  assert(ContextCompressor, 'ContextCompressor should be exported');
  assert(SUMMARY_PREFIX, 'SUMMARY_PREFIX should be exported');
  assert(typeof contentLengthForBudget === 'function', 'contentLengthForBudget should be a function');
});

test('ContextCompressor estimates message tokens', () => {
  const { ContextCompressor } = require('../src-js/core/context-compressor');
  const compressor = new ContextCompressor();
  const tokens = compressor.estimateMessageTokens({ role: 'user', content: 'Hello world' });
  assert(tokens > 0, 'Should estimate positive tokens');
  assert(tokens < 100, 'Should estimate reasonable tokens for short message');
});

test('contentLengthForBudget handles strings', () => {
  const { contentLengthForBudget } = require('../src-js/core/context-compressor');
  const len = contentLengthForBudget('Hello world');
  assert.strictEqual(len, 11, 'Should return string length');
});

// Test 2: Memory Manager
console.log('\n--- Memory Manager ---');

test('MemoryManager exports correctly', () => {
  const { MemoryManager, BuiltinMemoryProvider, StreamingContextScrubber } = require('../src-js/core/memory-manager');
  assert(MemoryManager, 'MemoryManager should be exported');
  assert(BuiltinMemoryProvider, 'BuiltinMemoryProvider should be exported');
  assert(StreamingContextScrubber, 'StreamingContextScrubber should be exported');
});

test('MemoryManager initializes with builtin provider', () => {
  const { MemoryManager } = require('../src-js/core/memory-manager');
  const manager = new MemoryManager();
  assert(manager.providers.length === 1, 'Should have one provider');
  assert(manager.builtinProvider, 'Should have builtin provider');
});

test('MemoryManager adds memories', () => {
  const { MemoryManager } = require('../src-js/core/memory-manager');
  const manager = new MemoryManager();
  manager.addMemory('Test memory');
  assert(manager.builtinProvider.memories.length === 1, 'Should have one memory');
});

test('StreamingContextScrubber scrubs memory-context tags', () => {
  const { StreamingContextScrubber } = require('../src-js/core/memory-manager');
  const scrubber = new StreamingContextScrubber();
  const input = 'Hello <memory-context>secret</memory-context> world';
  const output = scrubber.feed(input);
  assert(!output.includes('secret'), 'Should remove memory-context content');
  assert(output.includes('Hello'), 'Should keep text before');
  assert(output.includes('world'), 'Should keep text after');
});

// Test 3: Credential Pool
console.log('\n--- Credential Pool ---');

test('CredentialPool exports correctly', () => {
  const { CredentialPool, PooledCredential, STRATEGY_ROUND_ROBIN } = require('../src-js/core/credential-pool');
  assert(CredentialPool, 'CredentialPool should be exported');
  assert(PooledCredential, 'PooledCredential should be exported');
  assert(STRATEGY_ROUND_ROBIN, 'STRATEGY_ROUND_ROBIN should be exported');
});

test('PooledCredential creates correctly', () => {
  const { PooledCredential } = require('../src-js/core/credential-pool');
  const cred = new PooledCredential({ provider: 'test', accessToken: 'abc123' });
  assert(cred.provider === 'test', 'Provider should be set');
  assert(cred.accessToken === 'abc123', 'AccessToken should be set');
  assert(cred.isUsable(), 'Should be usable initially');
});

test('PooledCredential marks exhausted correctly', () => {
  const { PooledCredential, STATUS_EXHAUSTED } = require('../src-js/core/credential-pool');
  const cred = new PooledCredential({ provider: 'test' });
  cred.markExhausted(429, 'Rate limited');
  assert(cred.lastStatus === STATUS_EXHAUSTED, 'Status should be exhausted');
  assert(!cred.isUsable(), 'Should not be usable immediately after exhaustion');
});

// Test 4: Skill Resolver
console.log('\n--- Skill Resolver ---');

test('SkillResolver exports correctly', () => {
  const { parseFrontmatter, skillMatchesPlatform, resolveSkills, listAllSkills } = require('../src-js/core/skill-resolver');
  assert(typeof parseFrontmatter === 'function', 'parseFrontmatter should be a function');
  assert(typeof skillMatchesPlatform === 'function', 'skillMatchesPlatform should be a function');
  assert(typeof resolveSkills === 'function', 'resolveSkills should be a function');
  assert(typeof listAllSkills === 'function', 'listAllSkills should be a function');
});

test('parseFrontmatter extracts YAML', () => {
  const { parseFrontmatter } = require('../src-js/core/skill-resolver');
  const content = `---
id: test-skill
name: Test Skill
priority: 10
---
This is the body.`;
  const { frontmatter, body } = parseFrontmatter(content);
  assert(frontmatter.id === 'test-skill', 'Should extract id');
  assert(frontmatter.name === 'Test Skill', 'Should extract name');
  // Simple YAML parser returns strings, conversion happens on use
  assert(frontmatter.priority === '10' || frontmatter.priority === 10, 'Should extract priority');
  assert(body.includes('This is the body'), 'Should extract body');
});

test('skillMatchesPlatform works correctly', () => {
  const { skillMatchesPlatform } = require('../src-js/core/skill-resolver');
  
  // No platforms = matches all
  assert(skillMatchesPlatform({}), 'Should match when no platforms');
  
  // Platform array
  const currentPlatform = process.platform;
  const isMatch = skillMatchesPlatform({ platforms: ['linux', 'darwin', 'win32'] });
  assert(isMatch, `Should match current platform ${currentPlatform}`);
});

// Test 5: Runtime Host Adapter
console.log('\n--- Runtime Host Adapter ---');

test('HostAdapter exports correctly', () => {
  const { HostAdapter, createHostAdapter, detectHostType } = require('../src-js/core/runtime-host-adapter');
  assert(HostAdapter, 'HostAdapter should be exported');
  assert(typeof createHostAdapter === 'function', 'createHostAdapter should be a function');
  assert(typeof detectHostType === 'function', 'detectHostType should be a function');
});

test('HostAdapter creates without vscode context', () => {
  const { HostAdapter } = require('../src-js/core/runtime-host-adapter');
  const adapter = new HostAdapter();
  assert(adapter, 'Should create adapter');
  assert(typeof adapter.getWorkspacePath === 'function', 'Should have getWorkspacePath method');
});

test('detectHostType returns a string', () => {
  const { detectHostType } = require('../src-js/core/runtime-host-adapter');
  const type = detectHostType();
  assert(typeof type === 'string', 'Should return string');
});

// Summary
console.log('\n=== Summary ===');
console.log(`${GREEN}Passed: ${passed}${RESET}`);
console.log(`${RED}Failed: ${failed}${RESET}`);

if (failed > 0) {
  console.log(`\n${RED}hermes_integration_smoke: FAILED${RESET}`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}hermes_integration_smoke: OK${RESET}`);
  process.exit(0);
}
