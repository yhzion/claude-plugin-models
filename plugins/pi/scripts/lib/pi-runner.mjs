import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

/**
 * Build the argv for a non-interactive `pi` run.
 *
 * `-p` (print mode) makes pi process the prompt and exit. Per pi's docs, print
 * mode does NOT show a trust prompt, so no extra "skip permissions" flag is
 * needed (unlike opencode). Model is optional: omitting `--model` lets pi use
 * its own default provider/model. The prompt is the trailing positional message.
 */
export function buildPiArgs({ prompt, model }) {
  const args = ['-p'];
  if (model) args.push('--model', model);
  args.push(prompt);
  return args;
}

/**
 * Kill a child by its process group, escalating SIGTERM -> SIGKILL.
 *
 * pi runs an agent loop with its own children and may ignore SIGTERM, so a
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
 * Run a foreground pi delegation and resolve with
 * { code, stdout, stderr, signal }.
 *
 * Async (Promise-returning) by design: stdin is ignored (no EOF hang) and the
 * child is observed via events with a real timeout (exit code 124) backed by a
 * SIGTERM -> SIGKILL process-group escalation.
 */
export function runPiForeground({ piBin = 'pi', prompt, model, env, timeoutMs = 900000, detached = true }) {
  const args = buildPiArgs({ prompt, model });
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(piBin, args, {
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

/**
 * Spawn a detached background pi run, streaming stdout/stderr to logFile.
 * Returns { pid }. The child is unref'd so it outlives this process.
 *
 * Retained for parity with the other runners and direct-runner tests; the
 * companion's background path goes through a tracked task-worker instead.
 */
export function spawnPiBackground({ piBin = 'pi', prompt, model, logFile, env }) {
  const args = buildPiArgs({ prompt, model });
  const out = openSync(logFile, 'a');
  const err = openSync(logFile, 'a');
  const child = spawn(piBin, args, {
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
 * Cancel a backgrounded pi job.
 *
 * Targets the full process group via `-pid` and escalates SIGTERM -> SIGKILL.
 * Returns { signalSent, escalated, alive } describing what happened.
 */
export function cancelPiProcess(pid, { graceMs = 2000 } = {}) {
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
