import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const companion = resolve(repoRoot, 'plugins/glm/scripts/glm-companion.mjs');

let tmpDir;
let jobsDir;
let settingsPath;
let claudeBin;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'glm-companion-'));
  jobsDir = join(tmpDir, 'jobs');
  settingsPath = join(tmpDir, 'settings.glm.json');
  claudeBin = join(tmpDir, 'claude-mock.sh');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeMockClaude(script) {
  writeFileSync(claudeBin, `#!/usr/bin/env bash\n${script}\n`, 'utf8');
  chmodSync(claudeBin, 0o755);
}

function writeValidSettings() {
  writeFileSync(
    settingsPath,
    JSON.stringify({
      model: 'glm-5.1',
      env: {
        ANTHROPIC_AUTH_TOKEN: 'fake-token',
        ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
      },
    }),
    'utf8'
  );
}

function run(args, extraEnv = {}) {
  return spawnSync('node', [companion, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GLM_JOBS_DIR: jobsDir,
      GLM_SETTINGS_PATH: settingsPath,
      GLM_CLAUDE_BIN: claudeBin,
      ...extraEnv,
    },
  });
}

test('setup reports ok when settings file exists and is valid', () => {
  writeValidSettings();
  const result = run(['setup']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ok|ready|GLM/i);
});

test('setup --json returns JSON with ok=true on valid settings', () => {
  writeValidSettings();
  const result = run(['setup', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.settingsPath, settingsPath);
});

test('setup --json returns ok=false when settings file is missing', () => {
  const result = run(['setup', '--json']);
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error ?? '', /missing|not found|exist/i);
});

test('task (foreground) prints GLM stdout and records a completed job', () => {
  writeValidSettings();
  writeMockClaude("printf 'pong'");
  const result = run(['task', 'ping']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /pong/);

  const jobs = readdirSync(jobsDir).filter((f) => f.endsWith('.json'));
  assert.equal(jobs.length, 1, 'one job file expected');
});

test('task --background returns a job id and exits immediately', () => {
  writeValidSettings();
  writeMockClaude("sleep 1; printf 'late'");
  const result = run(['task', '--background', 'ping']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /glm-task-[a-z0-9]+/);
});

test('task --json --background returns JSON with id and status', () => {
  writeValidSettings();
  writeMockClaude("sleep 1; printf 'late'");
  const result = run(['task', '--background', '--json', 'ping']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.id, /^glm-task-/);
  assert.ok(['queued', 'running'].includes(payload.status));
});

test('status --json lists jobs (empty by default)', () => {
  writeValidSettings();
  const result = run(['status', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.ok(Array.isArray(payload.jobs));
  assert.equal(payload.jobs.length, 0);
});

test('status --json after a foreground task lists the completed job', () => {
  writeValidSettings();
  writeMockClaude("printf 'pong'");
  run(['task', 'ping']);
  const result = run(['status', '--json']);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.jobs.length, 1);
  assert.equal(payload.jobs[0].status, 'completed');
});

test('result --json returns the captured stdout of a completed job', () => {
  writeValidSettings();
  writeMockClaude("printf 'pong-result'");
  const t = run(['task', '--json', 'ping']);
  const taskPayload = JSON.parse(t.stdout);
  const result = run(['result', '--json', taskPayload.id]);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.id, taskPayload.id);
  assert.match(payload.output ?? '', /pong-result/);
});
