#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  createJob,
  readJob,
  updateJob,
  listJobs,
  generateJobId,
} from './lib/state.mjs';
import {
  runClaudeForeground,
  spawnClaudeBackground,
  cancelClaudeProcess,
} from './lib/claude-runner.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..');

const DEFAULT_SETTINGS_PATH = process.env.MINIMAX_M3_SETTINGS_PATH ?? join(homedir(), '.claude/settings.minimax-m3.json');
const DEFAULT_JOBS_DIR = process.env.MINIMAX_M3_JOBS_DIR ?? join(homedir(), '.claude/minimax-m3-jobs/default');
const CLAUDE_BIN = process.env.MINIMAX_M3_CLAUDE_BIN ?? 'claude';

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
  updateJob(DEFAULT_JOBS_DIR, id, {
    status: code === 0 ? 'completed' : 'failed',
    errorMessage: code === 0 ? null : (stderr || `exit ${code}`),
  });
}

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--background' || a === '--write' || a === '--json') {
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
  else process.stderr.write(payload.error ?? String(payload));
  process.exit(code);
}

function cmdSetup(args) {
  const asJson = !!args.flags.json;
  if (!existsSync(DEFAULT_SETTINGS_PATH)) {
    return fail({
      ok: false,
      settingsPath: DEFAULT_SETTINGS_PATH,
      error: `Settings file does not exist: ${DEFAULT_SETTINGS_PATH}`,
    }, asJson);
  }
  let settings;
  try {
    settings = JSON.parse(readFileSync(DEFAULT_SETTINGS_PATH, 'utf8'));
  } catch (e) {
    return fail({ ok: false, settingsPath: DEFAULT_SETTINGS_PATH, error: `Invalid JSON: ${e.message}` }, asJson);
  }
  const baseUrl = settings.env?.ANTHROPIC_BASE_URL;
  const model = settings.model ?? settings.env?.ANTHROPIC_DEFAULT_OPUS_MODEL ?? 'minimax-m3';
  if (!baseUrl) {
    return fail({ ok: false, settingsPath: DEFAULT_SETTINGS_PATH, error: 'Missing env.ANTHROPIC_BASE_URL' }, asJson);
  }
  // Note: ANTHROPIC_AUTH_TOKEN is intentionally NOT required from the settings
  // file — MiniMax-M3 reads the key from ~/.bunker/key.env (sourced by the
  // user's wrapper before invoking claude). The settings file only carries
  // routing/URL config.
  const ok = {
    ok: true,
    settingsPath: DEFAULT_SETTINGS_PATH,
    model,
    baseUrl,
  };
  if (asJson) emit(ok, true);
  else emit(`MiniMax-M3 ready — settings at ${DEFAULT_SETTINGS_PATH} (model=${model}, baseUrl=${baseUrl})\n`, false);
}

function ensureJobsDir() {
  mkdirSync(DEFAULT_JOBS_DIR, { recursive: true });
}

async function cmdTask(args) {
  const asJson = !!args.flags.json;
  const background = !!args.flags.background;
  const write = !!args.flags.write;
  const prompt = args._.slice(1).join(' ');
  if (!prompt) return fail({ ok: false, error: 'task: prompt is required' }, asJson);
  if (!existsSync(DEFAULT_SETTINGS_PATH)) {
    return fail({ ok: false, error: `Settings file does not exist: ${DEFAULT_SETTINGS_PATH}. Run /minimax-m3:setup first.` }, asJson);
  }

  ensureJobsDir();
  const id = args.flags.id ?? generateJobId();
  const logFile = join(DEFAULT_JOBS_DIR, `${id}.log`);

  if (background) {
    const job = createJob(DEFAULT_JOBS_DIR, { id, prompt, write, logFile });
    const { pid } = spawnTaskWorker(id);
    updateJob(DEFAULT_JOBS_DIR, id, { pid, status: 'running' });
    if (asJson) return emit({ id: job.id, status: 'running', pid, logFile }, true);
    return emit(`${job.id} (background, pid=${pid})\n`, false);
  }

  // Foreground
  createJob(DEFAULT_JOBS_DIR, { id, prompt, write, logFile });
  updateJob(DEFAULT_JOBS_DIR, id, { status: 'running', pid: process.pid });
  const { code, stdout, stderr } = await runClaudeForeground({
    claudeBin: CLAUDE_BIN,
    settingsPath: DEFAULT_SETTINGS_PATH,
    prompt,
  });
  writeFileSync(logFile, stdout + (stderr ? `\n[stderr]\n${stderr}` : ''), 'utf8');
  const finalStatus = code === 0 ? 'completed' : 'failed';
  updateJob(DEFAULT_JOBS_DIR, id, {
    status: finalStatus,
    errorMessage: code === 0 ? null : stderr || `exit ${code}`,
  });
  if (asJson) {
    return emit({ id, status: finalStatus, output: stdout, error: code === 0 ? null : stderr }, true);
  }
  process.stdout.write(stdout);
  if (code !== 0) {
    process.stderr.write(stderr);
    process.exit(code);
  }
}

// Detached background worker: owns one job's lifecycle. Runs the same
// foreground delegation but streams the result to the job's logFile and writes
// the terminal status itself. detached:false keeps the nested claude in this
// worker's process group so cancel can group-kill the whole tree.
async function cmdTaskWorker(args) {
  const id = args.flags.id;
  if (!id) process.exit(2);
  const job = readJob(DEFAULT_JOBS_DIR, id);
  if (!job) process.exit(1);
  updateJob(DEFAULT_JOBS_DIR, id, { status: 'running', pid: process.pid });
  const { code, stdout, stderr } = await runClaudeForeground({
    claudeBin: CLAUDE_BIN,
    settingsPath: DEFAULT_SETTINGS_PATH,
    prompt: job.prompt,
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
  return `${job.id}  ${job.status.padEnd(10)}  ${job.updatedAt}  ${job.prompt?.slice(0, 60) ?? ''}`;
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

function cmdCancel(args) {
  const asJson = !!args.flags.json;
  const id = args._[1];
  if (!id) return fail({ ok: false, error: 'cancel: job id is required' }, asJson);
  const job = readJob(DEFAULT_JOBS_DIR, id);
  if (!job) return fail({ ok: false, error: `unknown job: ${id}` }, asJson);
  let cancelInfo = { signalSent: null, escalated: false, alive: false };
  if (job.pid && job.status === 'running') {
    cancelInfo = cancelClaudeProcess(job.pid);
  }
  const updated = updateJob(DEFAULT_JOBS_DIR, id, { status: 'cancelled' });
  if (asJson) return emit({ ok: true, job: updated, cancel: cancelInfo }, true);
  const tag = cancelInfo.escalated ? 'SIGKILL' : (cancelInfo.signalSent ?? 'no-op');
  emit(`cancelled ${id} (${tag})\n`, false);
}

function cmdHelp() {
  // Read the active model id from the settings file (single source of truth)
  // so this banner never goes stale when the model is upgraded.
  let modelTag = 'MiniMax-M3';
  try {
    const settings = JSON.parse(readFileSync(DEFAULT_SETTINGS_PATH, 'utf8'));
    if (settings.model) modelTag = settings.model;
  } catch {
    // settings missing or invalid — keep the generic label
  }
  process.stdout.write(`minimax-m3-companion — self-hosted ${modelTag} task delegator

Usage:
  minimax-m3-companion setup [--json]
  minimax-m3-companion task [--background] [--write] [--json] [--id <id>] <prompt>
  minimax-m3-companion status [<id>] [--json]
  minimax-m3-companion result <id> [--json]
  minimax-m3-companion cancel <id> [--json]

Environment:
  MINIMAX_M3_SETTINGS_PATH   override ~/.claude/settings.minimax-m3.json
  MINIMAX_M3_JOBS_DIR        override ~/.claude/minimax-m3-jobs/default
  MINIMAX_M3_CLAUDE_BIN      override 'claude' binary path (testing)
  MINIMAX_M3_CLAUDE_EFFORT   override default effort (default: max; '' disables)

Authentication:
  The settings file does NOT contain ANTHROPIC_AUTH_TOKEN. The key is sourced
  from ~/.bunker/key.env (chmod 600) by the user's wrapper before invoking
  claude — the same pattern as the existing ~/bin/claude-minimax-m3 script.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  switch (cmd) {
    case 'setup':        return cmdSetup(args);
    case 'task':         return await cmdTask(args);
    case 'task-worker':  return await cmdTaskWorker(args);
    case 'status':       return cmdStatus(args);
    case 'result':       return cmdResult(args);
    case 'cancel':       return cmdCancel(args);
    case 'help':
    case '--help':
    case '-h':
    case undefined:      return cmdHelp();
    default:
      process.stderr.write(`unknown subcommand: ${cmd}\n`);
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});
