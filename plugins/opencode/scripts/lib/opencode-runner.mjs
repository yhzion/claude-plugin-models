import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

/**
 * Build the argv for `opencode run`.
 *
 * Model is optional on purpose: omitting `-m` makes opencode use its own
 * default (typically the last-used) model — which is the desired behavior.
 * `--dangerously-skip-permissions` keeps the nested run from blocking on
 * permission prompts. The prompt is the trailing positional `message`.
 */
export function buildOpencodeArgs({ prompt, model }) {
  const args = ['run', '--dangerously-skip-permissions'];
  if (model) args.push('-m', model);
  args.push(prompt);
  return args;
}

/**
 * Kill a child by its process group, escalating SIGTERM -> SIGKILL.
 *
 * `opencode run` spins up its own server/children and may ignore SIGTERM, so a
 * plain kill is not enough — we target the whole group (`-pid`, requires the
 * child to be spawned `detached`) and force SIGKILL after a grace period.
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
 * Run a foreground opencode delegation and resolve with
 * { code, stdout, stderr, signal }.
 *
 * Async (Promise-returning) by design: stdin is ignored (no EOF hang) and the
 * child is observed via events with a real timeout (exit code 124) backed by a
 * SIGTERM -> SIGKILL process-group escalation.
 */
export function runOpencodeForeground({ opencodeBin = 'opencode', prompt, model, env, timeoutMs = 900000 }) {
  const args = buildOpencodeArgs({ prompt, model });
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(opencodeBin, args, {
        env: env ?? process.env,
        detached: true,                     // own process group for group-kill
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

/**
 * Spawn a detached background opencode run, streaming stdout/stderr to logFile.
 * Returns { pid }. The child is unref'd so it outlives this process.
 */
export function spawnOpencodeBackground({ opencodeBin = 'opencode', prompt, model, logFile, env }) {
  const args = buildOpencodeArgs({ prompt, model });
  const out = openSync(logFile, 'a');
  const err = openSync(logFile, 'a');
  // detached: true makes the child a process-group leader so cancel can kill
  // the whole tree via process.kill(-pid, ...).
  const child = spawn(opencodeBin, args, {
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
 * Cancel a backgrounded opencode job.
 *
 * Targets the full process group via `-pid` and escalates SIGTERM -> SIGKILL.
 * Returns { signalSent, escalated, alive } describing what happened.
 */
export function cancelOpencodeProcess(pid, { graceMs = 2000 } = {}) {
  if (!pid) return { signalSent: null, escalated: false, alive: false };

  const result = { signalSent: 'SIGTERM', escalated: false, alive: true };

  try { process.kill(-pid, 'SIGTERM'); }
  catch {
    try { process.kill(pid, 'SIGTERM'); }
    catch { return { signalSent: null, escalated: false, alive: false }; }
  }

  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); }
    catch { result.alive = false; return result; }
    // Small synchronous grace wait without taking a runtime dependency.
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},100)'], { timeout: 200 });
  }

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
