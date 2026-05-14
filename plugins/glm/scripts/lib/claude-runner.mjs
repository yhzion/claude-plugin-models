import { spawnSync, spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

export function buildClaudeArgs({ settingsPath, prompt }) {
  return [
    '--dangerously-skip-permissions',
    '--settings', settingsPath,
    '-p', prompt,
  ];
}

export function runClaudeForeground({ claudeBin = 'claude', settingsPath, prompt, env, timeoutMs = 0 }) {
  const args = buildClaudeArgs({ settingsPath, prompt });
  const result = spawnSync(claudeBin, args, {
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
