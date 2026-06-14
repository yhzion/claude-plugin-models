import { spawnSync, spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

export function buildGeminiArgs({ prompt, model, outputFormat }) {
  const args = ['-p', prompt];
  if (model) args.push('-m', model);
  if (outputFormat) args.push('--output-format', outputFormat);
  return args;
}

/**
 * Kill a child by its process group, escalating SIGTERM -> SIGKILL.
 *
 * Async (non-blocking) variant of cancelGeminiProcess, for the foreground
 * timeout path. gemini ignores SIGTERM, so we target the whole group (`-pid`,
 * requires the child to be spawned `detached`) and force SIGKILL after a grace
 * period if it is still alive.
 */
function killProcessGroup(pid, { graceMs = 2000 } = {}) {
  if (!pid) return;
  const send = (sig) => {
    try { process.kill(-pid, sig); }
    catch { try { process.kill(pid, sig); } catch { /* already gone */ } }
  };
  send('SIGTERM');
  setTimeout(() => {
    try { process.kill(pid, 0); send('SIGKILL'); } // still alive -> escalate
    catch { /* already dead */ }
  }, graceMs).unref();
}

/**
 * Run a foreground gemini delegation and resolve with { code, stdout, stderr, signal }.
 *
 * Async (Promise-returning) on purpose: a synchronous spawnSync left stdin open
 * (gemini could block forever on EOF) and could not be timed out against a
 * SIGTERM-ignoring child. This version ignores stdin, observes the child via
 * events, and enforces a real timeout (exit code 124).
 */
export function runGeminiForeground({ geminiBin = 'gemini', prompt, model, outputFormat, env, timeoutMs = 900000, detached = true }) {
  const args = buildGeminiArgs({ prompt, model, outputFormat });
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(geminiBin, args, {
        env: env ?? process.env,
        // detached: own process group for group-kill. The background task-worker
        // passes detached:false so the child joins the worker's group, letting a
        // single group-kill of the worker pid take the child down on cancel.
        detached,
        stdio: ['ignore', 'pipe', 'pipe'],  // ignore stdin -> no EOF hang
      });
    } catch (err) {
      resolve({ code: 1, stdout: '', stderr: String(err?.message ?? err), signal: null });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer;
    const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });

    timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid);
    }, timeoutMs);

    child.on('error', (err) => {
      done({ code: 1, stdout, stderr: stderr || String(err?.message ?? err), signal: null });
    });
    child.on('close', (code, signal) => {
      done({
        code: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr: timedOut ? `${stderr}${stderr ? '\n' : ''}[timeout after ${timeoutMs}ms]` : stderr,
        signal: signal ?? null,
      });
    });
  });
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
