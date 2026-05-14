#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
} from './lib/claude-runner.mjs';

const DEFAULT_SETTINGS_PATH = process.env.GLM_SETTINGS_PATH ?? join(homedir(), '.claude/settings.glm.json');
const DEFAULT_JOBS_DIR = process.env.GLM_JOBS_DIR ?? join(homedir(), '.claude/glm-jobs/default');
const CLAUDE_BIN = process.env.GLM_CLAUDE_BIN ?? 'claude';

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--background' || a === '--write' || a === '--json' || a === '--all' || a === '--fresh' || a === '--resume-last') {
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
    return fail({ ok: false, settingsPath: DEFAULT_SETTINGS_PATH, error: `Settings file does not exist: ${DEFAULT_SETTINGS_PATH}` }, asJson);
  }
  let settings;
  try {
    settings = JSON.parse(readFileSync(DEFAULT_SETTINGS_PATH, 'utf8'));
  } catch (e) {
    return fail({ ok: false, settingsPath: DEFAULT_SETTINGS_PATH, error: `Invalid JSON: ${e.message}` }, asJson);
  }
  const token = settings.env?.ANTHROPIC_AUTH_TOKEN;
  const baseUrl = settings.env?.ANTHROPIC_BASE_URL;
  if (!token) return fail({ ok: false, settingsPath: DEFAULT_SETTINGS_PATH, error: 'Missing env.ANTHROPIC_AUTH_TOKEN' }, asJson);
  if (!baseUrl) return fail({ ok: false, settingsPath: DEFAULT_SETTINGS_PATH, error: 'Missing env.ANTHROPIC_BASE_URL' }, asJson);
  const ok = {
    ok: true,
    settingsPath: DEFAULT_SETTINGS_PATH,
    model: settings.model,
    baseUrl,
  };
  if (asJson) emit(ok, true);
  else emit(`GLM ready — settings at ${DEFAULT_SETTINGS_PATH} (model=${settings.model}, baseUrl=${baseUrl})\n`, false);
}

function ensureJobsDir() {
  mkdirSync(DEFAULT_JOBS_DIR, { recursive: true });
}

function cmdTask(args) {
  const asJson = !!args.flags.json;
  const background = !!args.flags.background;
  const write = !!args.flags.write;
  const prompt = args._.slice(1).join(' ');
  if (!prompt) return fail({ ok: false, error: 'task: prompt is required' }, asJson);
  if (!existsSync(DEFAULT_SETTINGS_PATH)) {
    return fail({ ok: false, error: `Settings file does not exist: ${DEFAULT_SETTINGS_PATH}. Run /glm:setup first.` }, asJson);
  }

  ensureJobsDir();
  const id = args.flags.id ?? generateJobId();
  const logFile = join(DEFAULT_JOBS_DIR, `${id}.log`);

  if (background) {
    const job = createJob(DEFAULT_JOBS_DIR, { id, prompt, write, logFile });
    const { pid } = spawnClaudeBackground({
      claudeBin: CLAUDE_BIN,
      settingsPath: DEFAULT_SETTINGS_PATH,
      prompt,
      logFile,
    });
    updateJob(DEFAULT_JOBS_DIR, id, { pid, status: 'running' });
    if (asJson) return emit({ id: job.id, status: 'running', pid, logFile }, true);
    return emit(`${job.id} (background, pid=${pid})\n`, false);
  }

  // Foreground
  createJob(DEFAULT_JOBS_DIR, { id, prompt, write, logFile });
  updateJob(DEFAULT_JOBS_DIR, id, { status: 'running', pid: process.pid });
  const { code, stdout, stderr } = runClaudeForeground({
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
  if (job.pid && job.status === 'running') {
    try { process.kill(job.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
  const updated = updateJob(DEFAULT_JOBS_DIR, id, { status: 'cancelled' });
  if (asJson) return emit({ ok: true, job: updated }, true);
  emit(`cancelled ${id}\n`, false);
}

function cmdHelp() {
  process.stdout.write(`glm-companion — z.ai GLM-5.1 task delegator

Usage:
  glm-companion setup [--json]
  glm-companion task [--background] [--write] [--json] [--id <id>] <prompt>
  glm-companion status [<id>] [--json]
  glm-companion result <id> [--json]
  glm-companion cancel <id> [--json]

Environment:
  GLM_SETTINGS_PATH   override ~/.claude/settings.glm.json
  GLM_JOBS_DIR        override ~/.claude/glm-jobs/default
  GLM_CLAUDE_BIN      override 'claude' binary path (testing)
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  switch (cmd) {
    case 'setup':   return cmdSetup(args);
    case 'task':    return cmdTask(args);
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

main();
