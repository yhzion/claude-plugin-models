#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  createJob,
  readJob,
  updateJob,
  listJobs,
  generateJobId,
} from './lib/state.mjs';
import {
  runGeminiForeground,
  spawnGeminiBackground,
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

function cmdTask(args) {
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
    const { pid } = spawnGeminiBackground({
      geminiBin: GEMINI_BIN,
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
  const { code, stdout, stderr } = runGeminiForeground({
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
  return `${job.id}  ${job.status.padEnd(10)}  ${job.updatedAt}  ${(job.prompt ?? '').slice(0, 60)}`;
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

function cmdReview(args) {
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
    const { pid } = spawnGeminiBackground({ geminiBin: GEMINI_BIN, prompt, model, logFile });
    updateJob(DEFAULT_JOBS_DIR, id, { pid, status: 'running' });
    if (asJson) return emit({ ok: true, id, status: 'running', pid, logFile, scope, baseRef, model }, true);
    return emit(`${id} (review, background, pid=${pid}, scope=${scope}${model ? `, model=${model}` : ''})\n`, false);
  }

  updateJob(DEFAULT_JOBS_DIR, id, { status: 'running', pid: process.pid });
  const { code, stdout, stderr } = runGeminiForeground({
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  switch (cmd) {
    case 'setup':   return cmdSetup(args);
    case 'task':    return cmdTask(args);
    case 'review':  return cmdReview(args);
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
