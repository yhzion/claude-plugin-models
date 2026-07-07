import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

// MiniMax-M3 calls always run at max effort unless overridden. Set MINIMAX_M3_CLAUDE_EFFORT
// to '' (empty) to disable, or to another level (low|medium|high|xhigh|max).
const DEFAULT_EFFORT = process.env.MINIMAX_M3_CLAUDE_EFFORT ?? 'max';

export function buildClaudeArgs({ settingsPath, prompt, effort = DEFAULT_EFFORT }) {
  const args = [
    '--dangerously-skip-permissions',
    '--settings', settingsPath,
  ];
  if (effort) args.push('--effort', effort);
  args.push('-p', prompt);
  return args;
}

/**
 * Kill a child by its process group, escalating SIGTERM -> SIGKILL.
 *
 * `claude -p` ignores SIGTERM, so a plain kill is not enough — we target the
 * whole group (`-pid`, requires the child to be spawned `detached`) and force
 * SIGKILL after a short grace period if it is still alive.
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
 * Run a foreground MiniMax-M3 delegation and resolve with { code, stdout, stderr, signal }.
 *
 * Async (Promise-returning) on purpose: a synchronous spawnSync left stdin open
 * (the nested claude could block forever on EOF) and could not be timed out
 * against a SIGTERM-ignoring child. This version ignores stdin, observes the
 * child via events, and enforces a real timeout (exit code 124).
 */
export function runClaudeForeground({ claudeBin = 'claude', settingsPath, prompt, env, timeoutMs = 900000, detached = true }) {
  const args = buildClaudeArgs({ settingsPath, prompt });
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(claudeBin, args, {
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

export function spawnClaudeBackground({ claudeBin = 'claude', settingsPath, prompt, logFile, env }) {
  const args = buildClaudeArgs({ settingsPath, prompt });
  const out = openSync(logFile, 'a');
  const err = openSync(logFile, 'a');
  const child = spawn(claudeBin, args, {
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
 * Cancel a backgrounded MiniMax-M3 job by its worker pid.
 *
 * The background task-worker is a process-group leader and the nested `claude`
 * runs in that same group (spawned detached:false), so targeting the group via
 * `-pid` and escalating SIGTERM -> SIGKILL takes the whole tree down. `claude`
 * ignores SIGTERM, hence the escalation.
 *
 * Returns { signalSent, escalated, alive } describing what happened.
 */
export function cancelClaudeProcess(pid, { graceMs = 2000 } = {}) {
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
