import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const companion = resolve(repoRoot, 'plugins/glm/scripts/glm-companion.mjs');

let tmpDir;
let workRepo;
let jobsDir;
let settingsPath;
let claudeBin;
let promptCaptureFile;

function gitInTest(args, cwd = workRepo) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'glm-review-'));
  workRepo = join(tmpDir, 'repo');
  jobsDir = join(tmpDir, 'jobs');
  settingsPath = join(tmpDir, 'settings.glm.json');
  claudeBin = join(tmpDir, 'claude-mock.sh');
  promptCaptureFile = join(tmpDir, 'captured-prompt.txt');

  mkdirSync(workRepo, { recursive: true });
  gitInTest(['init', '-q', '-b', 'main']);
  gitInTest(['config', 'user.email', 'test@example.com']);
  gitInTest(['config', 'user.name', 'Test']);
  writeFileSync(join(workRepo, 'README.md'), '# repo\n');
  gitInTest(['add', 'README.md']);
  gitInTest(['commit', '-q', '-m', 'initial']);

  writeFileSync(
    settingsPath,
    JSON.stringify({ model: 'glm-5.1', env: { ANTHROPIC_AUTH_TOKEN: 't', ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic' } })
  );

  // Mock claude: capture the prompt (last argv) to a file, then echo a stub review.
  writeFileSync(
    claudeBin,
    `#!/usr/bin/env bash\nprintf '%s' "\${@: -1}" > "${promptCaptureFile}"\nprintf 'REVIEW_OK'\n`
  );
  chmodSync(claudeBin, 0o755);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function run(args) {
  return spawnSync('node', [companion, ...args], {
    encoding: 'utf8',
    cwd: workRepo,
    env: {
      ...process.env,
      GLM_JOBS_DIR: jobsDir,
      GLM_SETTINGS_PATH: settingsPath,
      GLM_CLAUDE_BIN: claudeBin,
    },
  });
}

test('review on a clean tree exits non-zero with a clear "nothing to review" message', () => {
  const result = run(['review', '--json']);
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /nothing to review|no changes|empty/i);
});

test('review on a dirty working tree feeds the diff to GLM and returns its output', () => {
  // Make a working-tree change
  writeFileSync(join(workRepo, 'README.md'), '# repo\n\nadded line\n');

  const result = run(['review', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.match(payload.output, /REVIEW_OK/);

  // Verify the prompt actually included the diff content
  const sentPrompt = readFileSync(promptCaptureFile, 'utf8');
  assert.ok(sentPrompt.includes('README.md'), 'prompt must reference the changed file');
  assert.ok(sentPrompt.includes('added line') || sentPrompt.includes('+added line'), `prompt must include the diff hunk, got:\n${sentPrompt}`);
});

test('review --scope branch compares the current branch against detected main', () => {
  gitInTest(['checkout', '-q', '-b', 'feat/x']);
  writeFileSync(join(workRepo, 'feature.txt'), 'new feature\n');
  gitInTest(['add', 'feature.txt']);
  gitInTest(['commit', '-q', '-m', 'feat: add feature']);

  const result = run(['review', '--scope', 'branch', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);

  const sentPrompt = readFileSync(promptCaptureFile, 'utf8');
  assert.ok(sentPrompt.includes('feature.txt'));
});

test('review --base accepts an explicit ref', () => {
  // Create two commits on main, then ask to review against the first
  const firstCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: workRepo, encoding: 'utf8' }).stdout.trim();
  writeFileSync(join(workRepo, 'second.txt'), 'second commit\n');
  gitInTest(['add', 'second.txt']);
  gitInTest(['commit', '-q', '-m', 'second']);

  const result = run(['review', '--base', firstCommit, '--scope', 'branch', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const sentPrompt = readFileSync(promptCaptureFile, 'utf8');
  assert.ok(sentPrompt.includes('second.txt'));
});

test('review records a job in the jobs directory', () => {
  writeFileSync(join(workRepo, 'README.md'), '# repo\nchange\n');
  run(['review', '--json']);
  const jobs = readdirSync(jobsDir).filter((f) => f.endsWith('.json'));
  assert.equal(jobs.length, 1, 'review must persist a job record');
  const job = JSON.parse(readFileSync(join(jobsDir, jobs[0]), 'utf8'));
  assert.equal(job.jobClass, 'review', 'job record should be tagged as review');
});

test('review outside a git repo fails with a clear message', () => {
  const outside = mkdtempSync(join(tmpdir(), 'no-repo-'));
  try {
    const result = spawnSync('node', [companion, 'review', '--json'], {
      encoding: 'utf8',
      cwd: outside,
      env: {
        ...process.env,
        GLM_JOBS_DIR: jobsDir,
        GLM_SETTINGS_PATH: settingsPath,
        GLM_CLAUDE_BIN: claudeBin,
      },
    });
    assert.notEqual(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.match(payload.error, /git|repo|repository/i);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
