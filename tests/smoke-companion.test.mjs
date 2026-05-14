import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GLM_SMOKE = process.env.GLM_SMOKE === '1';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const companion = resolve(repoRoot, 'plugins/glm/scripts/glm-companion.mjs');
const settingsPath = resolve(homedir(), '.claude/settings.glm.json');

let jobsDir;

beforeEach(() => {
  jobsDir = mkdtempSync(join(tmpdir(), 'glm-jobs-smoke-'));
});

afterEach(() => {
  rmSync(jobsDir, { recursive: true, force: true });
});

test(
  'companion task end-to-end: real GLM-5.1 round-trip via companion CLI',
  { skip: !GLM_SMOKE && 'set GLM_SMOKE=1 to run' },
  () => {
    const result = spawnSync(
      'node',
      [companion, 'task', '--json', 'Reply with exactly one word: pong'],
      {
        encoding: 'utf8',
        timeout: 90_000,
        env: {
          ...process.env,
          GLM_JOBS_DIR: jobsDir,
          GLM_SETTINGS_PATH: settingsPath,
        },
      }
    );
    assert.equal(result.status, 0, `companion exited non-zero: ${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, 'completed');
    assert.match(payload.output.toLowerCase(), /pong/);

    const jobs = readdirSync(jobsDir).filter((f) => f.endsWith('.json'));
    assert.equal(jobs.length, 1, 'job record should have been persisted');
  }
);

test(
  'companion setup --json reports ok=true against the real settings file',
  { skip: !GLM_SMOKE && 'set GLM_SMOKE=1 to run' },
  () => {
    const result = spawnSync('node', [companion, 'setup', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, GLM_SETTINGS_PATH: settingsPath },
    });
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.model, 'glm-5.1');
  }
);
