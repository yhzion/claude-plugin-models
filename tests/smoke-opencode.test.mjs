import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const companion = resolve(repoRoot, 'plugins/opencode/scripts/opencode-companion.mjs');

test('opencode-companion --help lists all expected subcommands', () => {
  const result = spawnSync('node', [companion, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `companion --help exited non-zero: ${result.stderr}`);
  const out = result.stdout;
  for (const sub of ['setup', 'task', 'status', 'result', 'cancel']) {
    assert.ok(out.includes(`opencode-companion ${sub}`), `--help must mention ${sub} subcommand`);
  }
  assert.ok(out.includes('OPENCODE_BIN'), '--help must mention OPENCODE_BIN env override');
  assert.ok(out.includes('OPENCODE_JOBS_DIR'), '--help must mention OPENCODE_JOBS_DIR env override');
});

test('opencode-companion setup --skip-probe --json returns ok=true with a working opencode binary stub', () => {
  // /bin/true responds to any argv with exit 0. probeBin() only checks that
  // --version returns 0; --skip-probe skips the real default-model round-trip.
  const result = spawnSync('node', [companion, 'setup', '--skip-probe', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, OPENCODE_BIN: '/bin/true' },
  });
  assert.equal(result.status, 0, `setup --skip-probe exited non-zero: ${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.probed, false);
});

test('opencode-companion setup --json fails fast when the opencode binary is missing', () => {
  const result = spawnSync('node', [companion, 'setup', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, OPENCODE_BIN: '/nonexistent/opencode-binary-for-test' },
  });
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error ?? '', /opencode CLI not found|not executable/i);
});
