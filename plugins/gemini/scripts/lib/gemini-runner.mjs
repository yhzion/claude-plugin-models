import { spawnSync, spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

export function buildGeminiArgs({ prompt, model, outputFormat }) {
  const args = ['-p', prompt];
  if (model) args.push('-m', model);
  if (outputFormat) args.push('--output-format', outputFormat);
  return args;
}

export function runGeminiForeground({ geminiBin = 'gemini', prompt, model, outputFormat, env, timeoutMs = 0 }) {
  const args = buildGeminiArgs({ prompt, model, outputFormat });
  const result = spawnSync(geminiBin, args, {
    encoding: 'utf8',
    env: env ?? process.env,
    timeout: timeoutMs || undefined,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    signal: result.signal ?? null,
  };
}

export function spawnGeminiBackground({ geminiBin = 'gemini', prompt, model, outputFormat, logFile, env }) {
  const args = buildGeminiArgs({ prompt, model, outputFormat });
  const out = openSync(logFile, 'a');
  const err = openSync(logFile, 'a');
  // detached: true makes the child a process-group leader.
  // This lets cancel kill the whole tree via process.kill(-pid, ...).
  const child = spawn(geminiBin, args, {
    detached: true,
    stdio: ['ignore', out, err],
    env: env ?? process.env,
  });
  child.unref();
  closeSync(out);
  closeSync(err);
  return { pid: child.pid };
}

/**
 * Cancel a backgrounded gemini job.
 *
 * gemini ignores SIGTERM/SIGINT (Node CLI without signal handlers), and its
 * children are Python worker threads spawned by the harness. SIGTERM to the
 * parent leaves the workers running. We target the full process group via
 * `-pid` and escalate SIGTERM → SIGKILL.
 *
 * Returns { signalSent, escalated, alive } describing what happened.
 */
export function cancelGeminiProcess(pid, { graceMs = 2000 } = {}) {
  if (!pid) return { signalSent: null, escalated: false, alive: false };

  const result = { signalSent: 'SIGTERM', escalated: false, alive: true };

  // Try graceful first against the whole group.
  try { process.kill(-pid, 'SIGTERM'); }
  catch {
    try { process.kill(pid, 'SIGTERM'); }
    catch { return { signalSent: null, escalated: false, alive: false }; }
  }

  // Synchronous wait — small grace period.
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); }
    catch { result.alive = false; return result; }
    // 100ms busy-ish wait via spawnSync sleep — keeps the synchronous contract
    // the CLI relies on, without taking a runtime dependency.
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},100)'], { timeout: 200 });
  }

  // Still alive — escalate.
  result.escalated = true;
  result.signalSent = 'SIGKILL';
  try { process.kill(-pid, 'SIGKILL'); }
  catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
  }
  try { process.kill(pid, 0); result.alive = true; }
  catch { result.alive = false; }
  return result;
}
