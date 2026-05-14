import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GLM_SMOKE = process.env.GLM_SMOKE === '1';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const companion = resolve(repoRoot, 'plugins/glm/scripts/glm-companion.mjs');
const settingsPath = resolve(homedir(), '.claude/settings.glm.json');

let tmpDir;
let workRepo;
let jobsDir;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'glm-review-smoke-'));
  workRepo = join(tmpDir, 'repo');
  jobsDir = join(tmpDir, 'jobs');
  mkdirSync(workRepo, { recursive: true });
  function git(args) {
    const r = spawnSync('git', args, { cwd: workRepo, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'smoke@example.com']);
  git(['config', 'user.name', 'Smoke']);
  writeFileSync(
    join(workRepo, 'auth.js'),
    "function validate(token) {\n  return token === 'admin';\n}\nmodule.exports = validate;\n"
  );
  git(['add', 'auth.js']);
  git(['commit', '-q', '-m', 'initial']);
  // Introduce an obvious correctness/security problem for GLM to find.
  writeFileSync(
    join(workRepo, 'auth.js'),
    "function validate(token) {\n  // accept anything truthy — TODO\n  return !!token;\n}\nmodule.exports = validate;\n"
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test(
  'review end-to-end: real GLM-5.1 reviews a deliberately bad diff and flags an issue',
  { skip: !GLM_SMOKE && 'set GLM_SMOKE=1 to run', timeout: 120_000 },
  () => {
    const result = spawnSync('node', [companion, 'review', '--json'], {
      encoding: 'utf8',
      cwd: workRepo,
      env: {
        ...process.env,
        GLM_JOBS_DIR: jobsDir,
        GLM_SETTINGS_PATH: settingsPath,
      },
      timeout: 110_000,
    });
    assert.equal(result.status, 0, `companion review failed: ${result.stderr}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 'completed');
    assert.match(payload.output, /## Intent/);
    assert.match(payload.output, /## Issues/);
    // Sanity: GLM should mention auth or token or security somewhere given the bad diff.
    assert.match(payload.output.toLowerCase(), /auth|token|secur|validate|truthy/);
  }
);
