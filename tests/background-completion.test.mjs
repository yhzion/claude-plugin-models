import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJob, updateJob } from '../plugins/glm/scripts/lib/state.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One matrix entry per companion. Each describes how to invoke it and how to
// build a mock CLI that the worker will exec.
const COMPANIONS = [
  {
    name: 'glm',
    companion: resolve(repoRoot, 'plugins/glm/scripts/glm-companion.mjs'),
    binEnv: 'GLM_CLAUDE_BIN',
    jobsEnv: 'GLM_JOBS_DIR',
    extraEnv: (tmp) => ({
      GLM_SETTINGS_PATH: writeGlmSettings(tmp),
    }),
    // claude is invoked as: claude --dangerously-skip-permissions --settings X -p PROMPT
    mock: (out) => `#!/usr/bin/env bash\nprintf '%s' "${out}"\n`,
  },
  {
    name: 'gemini',
    companion: resolve(repoRoot, 'plugins/gemini/scripts/gemini-companion.mjs'),
    binEnv: 'GEMINI_BIN',
    jobsEnv: 'GEMINI_JOBS_DIR',
    extraEnv: () => ({}),
    // gemini is invoked as: gemini --version  (probe) | gemini -p PROMPT [-m model]
    mock: (out) => `#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.0.0-mock"; exit 0; fi\nprintf '%s' "${out}"\n`,
  },
  {
    name: 'opencode',
    companion: resolve(repoRoot, 'plugins/opencode/scripts/opencode-companion.mjs'),
    binEnv: 'OPENCODE_BIN',
    jobsEnv: 'OPENCODE_JOBS_DIR',
    extraEnv: () => ({}),
    // opencode is invoked as: opencode --version (probe) | opencode run ... PROMPT
    mock: (out) => `#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.0.0-mock"; exit 0; fi\nprintf '%s' "${out}"\n`,
  },
];

function writeGlmSettings(tmp) {
  const p = join(tmp, 'settings.glm.json');
  writeFileSync(
    p,
    JSON.stringify({
      model: 'glm-5.1',
      env: { ANTHROPIC_AUTH_TOKEN: 'fake-token', ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic' },
    }),
    'utf8',
  );
  return p;
}

for (const c of COMPANIONS) {
  let tmpDir, jobsDir, binPath, baseEnv;

  const run = (args) =>
    spawnSync('node', [c.companion, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...baseEnv },
    });

  test(`${c.name}: background job transitions to completed after worker finishes`, async (t) => {
    tmpDir = mkdtempSync(join(tmpdir(), `${c.name}-bgdone-`));
    t.after(() => rmSync(tmpDir, { recursive: true, force: true }));
    jobsDir = join(tmpDir, 'jobs');
    binPath = join(tmpDir, 'cli-mock.sh');
    writeFileSync(binPath, c.mock('WORKER-OUTPUT-OK'), 'utf8');
    chmodSync(binPath, 0o755);
    baseEnv = { [c.jobsEnv]: jobsDir, [c.binEnv]: binPath, ...c.extraEnv(tmpDir) };

    const started = run(['task', '--background', '--json', 'do something']);
    assert.equal(started.status, 0, started.stderr);
    const { id } = JSON.parse(started.stdout);
    assert.ok(id, 'expected a job id');

    // Poll until terminal or timeout.
    let job;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const s = run(['status', '--json', id]);
      job = JSON.parse(s.stdout).job;
      if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) break;
      await sleep(200);
    }

    assert.equal(job.status, 'completed', `background job must finalize to completed (got ${job?.status})`);

    const res = run(['result', '--json', id]);
    assert.match(JSON.parse(res.stdout).output ?? '', /WORKER-OUTPUT-OK/);
  });

  test(`${c.name}: a running job whose pid is dead is reconciled to failed`, () => {
    tmpDir = mkdtempSync(join(tmpdir(), `${c.name}-reconcile-`));
    jobsDir = join(tmpDir, 'jobs');
    binPath = join(tmpDir, 'cli-mock.sh');
    writeFileSync(binPath, c.mock('x'), 'utf8');
    chmodSync(binPath, 0o755);
    baseEnv = { [c.jobsEnv]: jobsDir, [c.binEnv]: binPath, ...c.extraEnv(tmpDir) };

    mkdirSync(jobsDir, { recursive: true });
    const id = `${c.name}-stale-1`;
    createJob(jobsDir, { id, prompt: 'p', logFile: join(jobsDir, `${id}.log`) });
    // Simulate a worker that recorded 'running' then died: pid 2^31-1 is never alive.
    updateJob(jobsDir, id, { status: 'running', pid: 2147483646 });

    const s = run(['status', '--json', id]);
    assert.equal(s.status, 0, s.stderr);
    const job = JSON.parse(s.stdout).job;
    assert.equal(job.status, 'failed', 'dead-pid running job must be reconciled to failed');

    rmSync(tmpDir, { recursive: true, force: true });
  });
}
