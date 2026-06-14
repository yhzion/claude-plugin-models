#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

import {
  createJob,
  readJob,
  updateJob,
  listJobs,
  generateJobId,
} from './lib/state.mjs';
import {
  runGeminiForeground,
  cancelGeminiProcess,
} from './lib/gemini-runner.mjs';
import {
  hasGitRepo,
  detectMainBranch,
  collectWorkingTreeDiff,
  collectBranchDiff,
  collectCommitLog,
} from './lib/git.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..');

const DEFAULT_JOBS_DIR = process.env.GEMINI_JOBS_DIR ?? join(homedir(), '.claude/gemini-jobs/default');
const GEMINI_BIN = process.env.GEMINI_BIN ?? 'gemini';
const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? null;

const SELF = fileURLToPath(import.meta.url);

// Re-exec this companion as a detached background worker. The worker owns the
// job lifecycle (running -> completed/failed), which is what keeps the status
// record from going stale: a plain fire-and-forget of the CLI had no one left
// to write the terminal status.
function spawnTaskWorker(id) {
  const child = spawn(process.execPath, [SELF, 'task-worker', '--id', id], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  return { pid: child.pid };
}

function isPidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // exists but not ours
}

// Self-healing read: a job stuck at 'running' whose worker pid is gone never got
// finalized (worker crashed or was killed). Reconcile it to 'failed' so callers
// never block forever polling a stale 'running'. pid===null means the worker has
// not recorded itself yet — leave it alone to avoid false-failing a fresh job.
function reconcileJob(job) {
  if (!job || job.status !== 'running' || !job.pid) return job;
  if (isPidAlive(job.pid)) return job;
  const fresh = readJob(DEFAULT_JOBS_DIR, job.id);
  if (fresh && fresh.status !== 'running') return fresh;
  return updateJob(DEFAULT_JOBS_DIR, job.id, {
    status: 'failed',
    errorMessage: 'process exited without recording completion (status reconciled)',
  });
}

// Write the terminal status, unless cancel (or a prior finalize) already set a
// terminal status — never clobber a cancellation.
function finalizeJob(id, { code, stderr }) {
  const cur = readJob(DEFAULT_JOBS_DIR, id);
  if (cur && ['completed', 'failed', 'cancelled'].includes(cur.status)) return;
  const authError = code === 41;
  updateJob(DEFAULT_JOBS_DIR, id, {
    status: code === 0 ? 'completed' : 'failed',
    errorMessage: code === 0 ? null : (authError ? 'unauthenticated' : (stderr || `exit ${code}`)),
  });
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--background' || a === '--write' || a === '--json' || a === '--skip-probe') {
      args.flags[a.slice(2)] = true;
    } else if (a.startsWith('--') && a.includes('=')) {
      const [k, v] = a.slice(2).split('=', 2);
      args.flags[k] = v;
    } else if (a.startsWith('--')) {
      args.flags[a.slice(2)] = argv[++i];
    } else {
      args._.push(a);
    }
  }
  return args;
}

function emit(payload, asJson) {
  if (asJson) process.stdout.write(JSON.stringify(payload));
  else process.stdout.write(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
}

function fail(payload, asJson, code = 1) {
  if (asJson) process.stdout.write(JSON.stringify(payload));
  else process.stderr.write((payload.error ?? String(payload)) + '\n');
  process.exit(code);
}

function probeBin() {
  const result = spawnSync(GEMINI_BIN, ['--version'], { encoding: 'utf8' });
  if (result.error || (result.status ?? 1) !== 0) {
    return { ok: false, error: `gemini CLI not found or not executable: ${GEMINI_BIN} (install from https://github.com/google-gemini/gemini-cli)` };
  }
  return { ok: true, version: (result.stdout || '').trim() };
}

function probeAuth({ timeoutMs = 15000 } = {}) {
  // Cheapest real call: short prompt, plain text output.
  const result = spawnSync(GEMINI_BIN, ['-p', 'Reply with exactly: OK'], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const code = result.status ?? 1;
  const stderr = result.stderr ?? '';
  if (code === 0) return { ok: true };
  if (code === 41) {
    return {
      ok: false,
      reason: 'unauthenticated',
      error: stderr.trim() || 'Gemini CLI reports no auth method set.',
      hint: 'Run `gemini` once in a terminal to complete OAuth, or export GEMINI_API_KEY.',
    };
  }
  return { ok: false, reason: 'probe-failed', code, error: stderr.trim() || `gemini exited ${code}` };
}

function cmdSetup(args) {
  const asJson = !!args.flags.json;
  const skipProbe = !!args.flags['skip-probe'];

  const bin = probeBin();
  if (!bin.ok) return fail(bin, asJson);

  if (skipProbe) {
    const payload = { ok: true, version: bin.version, probed: false };
    if (asJson) return emit(payload, true);
    return emit(`Gemini CLI present (v${bin.version}). Auth probe skipped.\n`, false);
  }

  const auth = probeAuth();
  if (!auth.ok) {
    return fail(
      { ok: false, version: bin.version, ...auth },
      asJson,
    );
  }
  const payload = { ok: true, version: bin.version, probed: true };
  if (asJson) return emit(payload, true);
  return emit(`Gemini ready — CLI v${bin.version}, auth OK.\n`, false);
}

function ensureJobsDir() {
  mkdirSync(DEFAULT_JOBS_DIR, { recursive: true });
}

async function cmdTask(args) {
  const asJson = !!args.flags.json;
  const background = !!args.flags.background;
  const write = !!args.flags.write;
  const model = args.flags.model ?? DEFAULT_MODEL;
  const prompt = args._.slice(1).join(' ');
  if (!prompt) return fail({ ok: false, error: 'task: prompt is required' }, asJson);

  const bin = probeBin();
  if (!bin.ok) return fail(bin, asJson);

  ensureJobsDir();
  const id = args.flags.id ?? generateJobId();
  const logFile = join(DEFAULT_JOBS_DIR, `${id}.log`);

  if (background) {
    const job = createJob(DEFAULT_JOBS_DIR, { id, prompt, write, logFile });
    if (model) updateJob(DEFAULT_JOBS_DIR, id, { model }); // persist before worker reads it
    const { pid } = spawnTaskWorker(id);
    updateJob(DEFAULT_JOBS_DIR, id, { pid, status: 'running' });
    if (asJson) return emit({ id: job.id, status: 'running', pid, logFile, model }, true);
    return emit(`${job.id} (background, pid=${pid}${model ? `, model=${model}` : ''})\n`, false);
  }

  createJob(DEFAULT_JOBS_DIR, { id, prompt, write, logFile });
  updateJob(DEFAULT_JOBS_DIR, id, { status: 'running', pid: process.pid });
  const { code, stdout, stderr } = await runGeminiForeground({
    geminiBin: GEMINI_BIN,
    prompt,
    model,
  });
  writeFileSync(logFile, stdout + (stderr ? `\n[stderr]\n${stderr}` : ''), 'utf8');
  const finalStatus = code === 0 ? 'completed' : (code === 41 ? 'failed' : 'failed');
  const authError = code === 41;
  updateJob(DEFAULT_JOBS_DIR, id, {
    status: finalStatus,
    errorMessage: code === 0 ? null : (authError ? 'unauthenticated' : (stderr || `exit ${code}`)),
  });
  if (asJson) {
    return emit({ id, status: finalStatus, output: stdout, error: code === 0 ? null : stderr, code }, true);
  }
  process.stdout.write(stdout);
  if (code !== 0) {
    process.stderr.write(stderr);
    if (authError) {
      process.stderr.write('\n[hint] Run /gemini:setup — gemini CLI reports no auth method set.\n');
    }
    process.exit(code);
  }
}

// Detached background worker: owns one job's lifecycle. Runs the same
// foreground delegation but streams the result to the job's logFile and writes
// the terminal status itself. detached:false keeps the nested gemini in this
// worker's process group so cancel can group-kill the whole tree.
async function cmdTaskWorker(args) {
  const id = args.flags.id;
  if (!id) process.exit(2);
  const job = readJob(DEFAULT_JOBS_DIR, id);
  if (!job) process.exit(1);
  updateJob(DEFAULT_JOBS_DIR, id, { status: 'running', pid: process.pid });
  const { code, stdout, stderr } = await runGeminiForeground({
    geminiBin: GEMINI_BIN,
    prompt: job.prompt,
    model: job.model ?? null,
    detached: false,
  });
  writeFileSync(job.logFile, stdout + (stderr ? `\n[stderr]\n${stderr}` : ''), 'utf8');
  finalizeJob(id, { code, stderr });
}

function cmdStatus(args) {
  const asJson = !!args.flags.json;
  const jobId = args._[1];
  if (jobId) {
    let job = readJob(DEFAULT_JOBS_DIR, jobId);
    if (!job) return fail({ ok: false, error: `unknown job: ${jobId}` }, asJson);
    job = reconcileJob(job);
    if (asJson) return emit({ ok: true, job }, true);
    return emit(formatJobLine(job) + '\n', false);
  }
  const jobs = listJobs(DEFAULT_JOBS_DIR).map(reconcileJob);
  if (asJson) return emit({ jobs }, true);
  if (jobs.length === 0) return emit('No jobs.\n', false);
  emit(jobs.map(formatJobLine).join('\n') + '\n', false);
}

function formatJobLine(job) {
  return `${job.id}  ${job.status.padEnd(10)}  ${job.updatedAt}  ${(job.prompt ?? '').slice(0, 60)}`;
}

function cmdResult(args) {
  const asJson = !!args.flags.json;
  const id = args._[1];
  if (!id) return fail({ ok: false, error: 'result: job id is required' }, asJson);
  let job = readJob(DEFAULT_JOBS_DIR, id);
  if (!job) return fail({ ok: false, error: `unknown job: ${id}` }, asJson);
  job = reconcileJob(job);
  let output = '';
  if (job.logFile && existsSync(job.logFile)) {
    output = readFileSync(job.logFile, 'utf8');
  }
  if (asJson) return emit({ id, status: job.status, output, error: job.errorMessage }, true);
  process.stdout.write(output);
}

async function cmdReview(args) {
  const asJson = !!args.flags.json;
  const background = !!args.flags.background;
  const explicitBase = args.flags.base;
  const explicitScope = args.flags.scope;
  const model = args.flags.model ?? DEFAULT_MODEL;
  const cwd = process.cwd();

  if (!hasGitRepo(cwd)) {
    return fail({ ok: false, error: `Not a git repository: ${cwd}` }, asJson);
  }

  const bin = probeBin();
  if (!bin.ok) return fail(bin, asJson);

  const baseRef = explicitBase ?? detectMainBranch(cwd);
  let scope = explicitScope ?? 'auto';
  let diff = '';
  let commits = '';

  if (scope === 'auto') {
    const wtDiff = collectWorkingTreeDiff(cwd);
    if (wtDiff.trim()) {
      scope = 'working-tree';
      diff = wtDiff;
    } else if (baseRef) {
      const branchDiff = collectBranchDiff(cwd, baseRef);
      if (branchDiff.trim()) {
        scope = 'branch';
        diff = branchDiff;
        commits = collectCommitLog(cwd, baseRef);
      }
    }
  } else if (scope === 'working-tree') {
    diff = collectWorkingTreeDiff(cwd);
  } else if (scope === 'branch') {
    if (!baseRef) return fail({ ok: false, error: 'review: --scope branch requires a detectable main branch or --base' }, asJson);
    diff = collectBranchDiff(cwd, baseRef);
    commits = collectCommitLog(cwd, baseRef);
  } else {
    return fail({ ok: false, error: `review: unknown --scope value: ${scope}` }, asJson);
  }

  if (!diff.trim()) {
    return fail({ ok: false, error: 'Nothing to review — no changes detected (clean working tree and no branch commits).' }, asJson);
  }

  const templatePath = join(PLUGIN_ROOT, 'prompts/review.md');
  const template = readFileSync(templatePath, 'utf8');
  const branchName = (args.flags.branch ?? '').trim() || 'current';
  const prompt = template
    .replace('{{BACKGROUND}}', args.flags.background_text ?? '(none provided)')
    .replace('{{REPO_NAME}}', basename(cwd))
    .replace('{{BRANCH}}', branchName)
    .replace('{{BASE_REF}}', baseRef ?? '(unknown)')
    .replace('{{SCOPE}}', scope)
    .replace('{{COMMITS}}', commits || '(none — working-tree diff)')
    .replace('{{DIFF}}', diff);

  ensureJobsDir();
  const id = args.flags.id ?? generateJobId();
  const logFile = join(DEFAULT_JOBS_DIR, `${id}.log`);
  createJob(DEFAULT_JOBS_DIR, { id, prompt, jobClass: 'review', kind: 'review', logFile });

  if (background) {
    if (model) updateJob(DEFAULT_JOBS_DIR, id, { model }); // persist before worker reads it
    const { pid } = spawnTaskWorker(id);
    updateJob(DEFAULT_JOBS_DIR, id, { pid, status: 'running' });
    if (asJson) return emit({ ok: true, id, status: 'running', pid, logFile, scope, baseRef, model }, true);
    return emit(`${id} (review, background, pid=${pid}, scope=${scope}${model ? `, model=${model}` : ''})\n`, false);
  }

  updateJob(DEFAULT_JOBS_DIR, id, { status: 'running', pid: process.pid });
  const { code, stdout, stderr } = await runGeminiForeground({
    geminiBin: GEMINI_BIN,
    prompt,
    model,
  });
  writeFileSync(logFile, stdout + (stderr ? `\n[stderr]\n${stderr}` : ''), 'utf8');
  const finalStatus = code === 0 ? 'completed' : 'failed';
  const authError = code === 41;
  updateJob(DEFAULT_JOBS_DIR, id, {
    status: finalStatus,
    errorMessage: code === 0 ? null : (authError ? 'unauthenticated' : (stderr || `exit ${code}`)),
  });

  if (asJson) {
    return emit({ ok: code === 0, id, status: finalStatus, scope, baseRef, output: stdout, error: code === 0 ? null : stderr, code }, true);
  }
  process.stdout.write(stdout);
  if (code !== 0) {
    process.stderr.write(stderr);
    if (authError) {
      process.stderr.write('\n[hint] Run /gemini:setup — gemini CLI reports no auth method set.\n');
    }
    process.exit(code);
  }
}

function cmdCancel(args) {
  const asJson = !!args.flags.json;
  const id = args._[1];
  if (!id) return fail({ ok: false, error: 'cancel: job id is required' }, asJson);
  const job = readJob(DEFAULT_JOBS_DIR, id);
  if (!job) return fail({ ok: false, error: `unknown job: ${id}` }, asJson);

  let cancelInfo = { signalSent: null, escalated: false, alive: false };
  if (job.pid && job.status === 'running') {
    cancelInfo = cancelGeminiProcess(job.pid);
  }
  const updated = updateJob(DEFAULT_JOBS_DIR, id, { status: 'cancelled' });
  if (asJson) return emit({ ok: true, job: updated, cancel: cancelInfo }, true);
  const tag = cancelInfo.escalated ? 'SIGKILL' : (cancelInfo.signalSent ?? 'no-op');
  emit(`cancelled ${id} (${tag})\n`, false);
}

function cmdHelp() {
  process.stdout.write(`gemini-companion — Google Gemini task delegator

Usage:
  gemini-companion setup [--skip-probe] [--json]
  gemini-companion task [--background] [--write] [--model <name>] [--json] [--id <id>] <prompt>
  gemini-companion review [--base <ref>] [--scope auto|working-tree|branch] [--model <name>] [--background] [--json]
  gemini-companion status [<id>] [--json]
  gemini-companion result <id> [--json]
  gemini-companion cancel <id> [--json]

Environment:
  GEMINI_BIN          override 'gemini' binary path (testing)
  GEMINI_JOBS_DIR     override ~/.claude/gemini-jobs/default
  GEMINI_MODEL        default model name to pass via -m
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  switch (cmd) {
    case 'setup':   return cmdSetup(args);
    case 'task':    return await cmdTask(args);
    case 'task-worker': return await cmdTaskWorker(args);
    case 'review':  return await cmdReview(args);
    case 'status':  return cmdStatus(args);
    case 'result':  return cmdResult(args);
    case 'cancel':  return cmdCancel(args);
    case 'help':
    case '--help':
    case undefined: return cmdHelp();
    default:
      process.stderr.write(`unknown subcommand: ${cmd}\n`);
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});
