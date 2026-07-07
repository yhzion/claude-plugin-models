import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const companion = resolve(repoRoot, 'plugins/minimax-m3/scripts/minimax-m3-companion.mjs');

test('minimax-m3-companion --help lists all expected subcommands', () => {
  const result = spawnSync('node', [companion, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `companion --help exited non-zero: ${result.stderr}`);
  const out = result.stdout;
  for (const sub of ['setup', 'task', 'status', 'result', 'cancel']) {
    assert.ok(out.includes(`minimax-m3-companion ${sub}`), `--help must mention ${sub} subcommand`);
  }
  assert.ok(out.includes('MINIMAX_M3_SETTINGS_PATH'), '--help must mention MINIMAX_M3_SETTINGS_PATH env override');
  assert.ok(out.includes('MINIMAX_M3_JOBS_DIR'), '--help must mention MINIMAX_M3_JOBS_DIR env override');
  assert.ok(out.includes('MINIMAX_M3_CLAUDE_BIN'), '--help must mention MINIMAX_M3_CLAUDE_BIN env override');
  assert.ok(out.includes('MINIMAX_M3_CLAUDE_EFFORT'), '--help must mention MINIMAX_M3_CLAUDE_EFFORT env override');
  assert.ok(out.includes('bunker-llm') || out.includes('bunker'), '--help must explain the auth model (bunker key file)');
});

test('minimax-m3-companion setup --json fails when the settings file is missing', () => {
  const result = spawnSync('node', [companion, 'setup', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, MINIMAX_M3_SETTINGS_PATH: '/nonexistent/minimax-m3-settings-for-test.json' },
  });
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error ?? '', /Settings file does not exist/i);
});

test('minimax-m3-companion task without prompt exits non-zero', () => {
  const result = spawnSync('node', [companion, 'task'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, 'task without prompt must fail');
  assert.match(result.stderr, /prompt is required/i);
});
