import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildClaudeArgs,
  runClaudeForeground,
  spawnClaudeBackground,
} from '../../plugins/glm/scripts/lib/claude-runner.mjs';

let tmpDir;
let mockBin;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'glm-runner-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeMockClaude(script) {
  mockBin = join(tmpDir, 'claude-mock.sh');
  writeFileSync(mockBin, `#!/usr/bin/env bash\n${script}\n`, 'utf8');
  chmodSync(mockBin, 0o755);
  return mockBin;
}

test('buildClaudeArgs includes --dangerously-skip-permissions, --settings, -p, and prompt', () => {
  const args = buildClaudeArgs({
    settingsPath: '/some/settings.json',
    prompt: 'hello world',
  });
  assert.ok(args.includes('--dangerously-skip-permissions'));
  assert.ok(args.includes('--settings'));
  assert.equal(args[args.indexOf('--settings') + 1], '/some/settings.json');
  assert.ok(args.includes('-p'));
  assert.equal(args[args.indexOf('-p') + 1], 'hello world');
});

test('runClaudeForeground returns stdout and zero exit when bin succeeds', () => {
  const bin = writeMockClaude("printf 'pong'");
  const result = runClaudeForeground({
    claudeBin: bin,
    settingsPath: '/dev/null',
    prompt: 'ping',
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'pong');
});

test('runClaudeForeground propagates non-zero exit and stderr', () => {
  const bin = writeMockClaude("echo 'kaboom' >&2; exit 42");
  const result = runClaudeForeground({
    claudeBin: bin,
    settingsPath: '/dev/null',
    prompt: 'fail',
  });
  assert.equal(result.code, 42);
  assert.ok(result.stderr.includes('kaboom'));
});

test('runClaudeForeground passes the prompt to the binary', () => {
  // Mock echoes the last argument (which is the prompt for `-p <prompt>`).
  const bin = writeMockClaude('printf %s "${@: -1}"');
  const result = runClaudeForeground({
    claudeBin: bin,
    settingsPath: '/dev/null',
    prompt: 'this-exact-prompt-7e2f',
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'this-exact-prompt-7e2f');
});

test('spawnClaudeBackground returns a pid and writes stdout to logFile', async () => {
  const bin = writeMockClaude("printf 'bg-output'; sleep 0.05");
  const logFile = join(tmpDir, 'bg.log');
  const { pid } = spawnClaudeBackground({
    claudeBin: bin,
    settingsPath: '/dev/null',
    prompt: 'p',
    logFile,
  });
  assert.equal(typeof pid, 'number');
  assert.ok(pid > 0, 'pid must be a positive integer');

  // Wait for the background process to finish writing.
  await new Promise((r) => setTimeout(r, 250));
  assert.ok(existsSync(logFile), `log file should exist at ${logFile}`);
  const log = readFileSync(logFile, 'utf8');
  assert.ok(log.includes('bg-output'), `log should capture stdout, got: ${log}`);
});
