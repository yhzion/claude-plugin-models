import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const companion = resolve(repoRoot, 'plugins/gemini/scripts/gemini-companion.mjs');

test('gemini-companion --help lists all expected subcommands', () => {
  const result = spawnSync('node', [companion, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `companion --help exited non-zero: ${result.stderr}`);
  const out = result.stdout;
  for (const sub of ['setup', 'task', 'review', 'status', 'result', 'cancel']) {
    assert.ok(out.includes(`gemini-companion ${sub}`), `--help must mention ${sub} subcommand`);
  }
  assert.ok(out.includes('GEMINI_BIN'), '--help must mention GEMINI_BIN env override');
  assert.ok(out.includes('GEMINI_JOBS_DIR'), '--help must mention GEMINI_JOBS_DIR env override');
});

test('gemini-companion setup --skip-probe --json returns ok=true with a working gemini binary stub', () => {
  // /bin/true responds to any argv with exit 0. probeBin() only checks that
  // --version returns 0; --skip-probe skips the real probeAuth() round-trip.
  const result = spawnSync('node', [companion, 'setup', '--skip-probe', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, GEMINI_BIN: '/bin/true' },
  });
  assert.equal(result.status, 0, `setup --skip-probe exited non-zero: ${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.probed, false);
});

test('gemini-companion setup --json fails fast when the gemini binary is missing', () => {
  const result = spawnSync('node', [companion, 'setup', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, GEMINI_BIN: '/nonexistent/gemini-binary-for-test' },
  });
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error ?? '', /gemini CLI not found|not executable/i);
});
