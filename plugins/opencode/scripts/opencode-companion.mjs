#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  createJob,
  readJob,
  updateJob,
  listJobs,
  generateJobId,
} from './lib/state.mjs';
import {
  runOpencodeForeground,
  spawnOpencodeBackground,
  cancelOpencodeProcess,
} from './lib/opencode-runner.mjs';

const DEFAULT_JOBS_DIR = process.env.OPENCODE_JOBS_DIR ?? join(homedir(), '.claude/opencode-jobs/default');
const OPENCODE_BIN = process.env.OPENCODE_BIN ?? 'opencode';
// Default model is intentionally null: omitting -m lets opencode use its own
// default (last-used) model. Override per-call with `--model provider/model`
// or globally with the OPENCODE_MODEL env var.
const DEFAULT_MODEL = process.env.OPENCODE_MODEL ?? null;

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
  const result = spawnSync(OPENCODE_BIN, ['--version'], { encoding: 'utf8' });
  if (result.error || (result.status ?? 1) !== 0) {
    return { ok: false, error: `opencode CLI not found or not executable: ${OPENCODE_BIN} (install from https://opencode.ai)` };
  }
  return { ok: true, version: (result.stdout || '').trim() };
}

function probeAuth({ timeoutMs = 60000 } = {}) {
  // Cheapest real call through the actual delegation path: a trivial prompt on
  // the default model. A non-zero exit usually means no model/credentials are
  // configured yet.
  const result = spawnSync(OPENCODE_BIN, ['run', '--dangerously-skip-permissions', 'Reply with exactly: OK'], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const code = result.status ?? 1;
  const stderr = result.stderr ?? '';
  if (code === 0) return { ok: true };
  return {
    ok: false,
    reason: 'probe-failed',
    code,
    error: stderr.trim() || `opencode exited ${code}`,
    hint: 'Run `opencode` once to pick a default model, or `opencode auth` to add provider credentials.',
  };
}

function cmdSetup(args) {
  const asJson = !!args.flags.json;
  const skipProbe = !!args.flags['skip-probe'];

  const bin = probeBin();
  if (!bin.ok) return fail(bin, asJson);

  if (skipProbe) {
    const payload = { ok: true, version: bin.version, probed: false };
    if (asJson) return emit(payload, true);
    return emit(`opencode CLI present (v${bin.version}). Model probe skipped.\n`, false);
  }

  const auth = probeAuth();
  if (!auth.ok) {
    return fail({ ok: false, version: bin.version, ...auth }, asJson);
  }
  const payload = { ok: true, version: bin.version, probed: true };
  if (asJson) return emit(payload, true);
  return emit(`opencode ready — CLI v${bin.version}, default model reachable.\n`, false);
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
    const { pid } = spawnOpencodeBackground({
      opencodeBin: OPENCODE_BIN,
      prompt,
      model,
      logFile,
    });
    updateJob(DEFAULT_JOBS_DIR, id, { pid, status: 'running' });
    if (asJson) return emit({ id: job.id, status: 'running', pid, logFile, model }, true);
    return emit(`${job.id} (background, pid=${pid}${model ? `, model=${model}` : ''})\n`, false);
  }

  createJob(DEFAULT_JOBS_DIR, { id, prompt, write, logFile });
  updateJob(DEFAULT_JOBS_DIR, id, { status: 'running', pid: process.pid });
  const { code, stdout, stderr } = await runOpencodeForeground({
    opencodeBin: OPENCODE_BIN,
    prompt,
    model,
  });
  writeFileSync(logFile, stdout + (stderr ? `\n[stderr]\n${stderr}` : ''), 'utf8');
  const finalStatus = code === 0 ? 'completed' : 'failed';
  updateJob(DEFAULT_JOBS_DIR, id, {
    status: finalStatus,
    errorMessage: code === 0 ? null : (stderr || `exit ${code}`),
  });
  if (asJson) {
    return emit({ id, status: finalStatus, output: stdout, error: code === 0 ? null : stderr, code }, true);
  }
  process.stdout.write(stdout);
  if (code !== 0) {
    process.stderr.write(stderr);
    process.exit(code);
  }
}

function cmdStatus(args) {
  const asJson = !!args.flags.json;
  const jobId = args._[1];
  if (jobId) {
    const job = readJob(DEFAULT_JOBS_DIR, jobId);
    if (!job) return fail({ ok: false, error: `unknown job: ${jobId}` }, asJson);
    if (asJson) return emit({ ok: true, job }, true);
    return emit(formatJobLine(job) + '\n', false);
  }
  const jobs = listJobs(DEFAULT_JOBS_DIR);
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
  const job = readJob(DEFAULT_JOBS_DIR, id);
  if (!job) return fail({ ok: false, error: `unknown job: ${id}` }, asJson);
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
    cancelInfo = cancelOpencodeProcess(job.pid);
  }
  const updated = updateJob(DEFAULT_JOBS_DIR, id, { status: 'cancelled' });
  if (asJson) return emit({ ok: true, job: updated, cancel: cancelInfo }, true);
  const tag = cancelInfo.escalated ? 'SIGKILL' : (cancelInfo.signalSent ?? 'no-op');
  emit(`cancelled ${id} (${tag})\n`, false);
}

function cmdHelp() {
  process.stdout.write(`opencode-companion — opencode task delegator (default/last-used model)

Usage:
  opencode-companion setup [--skip-probe] [--json]
  opencode-companion task [--background] [--write] [--model <provider/model>] [--json] [--id <id>] <prompt>
  opencode-companion status [<id>] [--json]
  opencode-companion result <id> [--json]
  opencode-companion cancel <id> [--json]

Notes:
  Omit --model to use opencode's own default (last-used) model.

Environment:
  OPENCODE_JOBS_DIR   override ~/.claude/opencode-jobs/default
  OPENCODE_BIN        override 'opencode' binary path (testing)
  OPENCODE_MODEL      default model for all tasks (still overridable per-call)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  switch (cmd) {
    case 'setup':   return cmdSetup(args);
    case 'task':    return await cmdTask(args);
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
