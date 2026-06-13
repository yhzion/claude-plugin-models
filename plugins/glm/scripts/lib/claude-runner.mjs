import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

export function buildClaudeArgs({ settingsPath, prompt }) {
  return [
    '--dangerously-skip-permissions',
    '--settings', settingsPath,
    '-p', prompt,
  ];
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
 * Run a foreground GLM delegation and resolve with { code, stdout, stderr, signal }.
 *
 * Async (Promise-returning) on purpose: a synchronous spawnSync left stdin open
 * (the nested claude could block forever on EOF) and could not be timed out
 * against a SIGTERM-ignoring child. This version ignores stdin, observes the
 * child via events, and enforces a real timeout (exit code 124).
 */
export function runClaudeForeground({ claudeBin = 'claude', settingsPath, prompt, env, timeoutMs = 900000 }) {
  const args = buildClaudeArgs({ settingsPath, prompt });
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(claudeBin, args, {
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
