import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const GLM_SMOKE = process.env.GLM_SMOKE === '1';
const settingsPath = resolve(homedir(), '.claude/settings.glm.json');

test('GLM settings file exists at ~/.claude/settings.glm.json', { skip: !GLM_SMOKE && 'set GLM_SMOKE=1 to run' }, () => {
  assert.ok(existsSync(settingsPath), `settings file missing: ${settingsPath}`);
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  assert.equal(settings.model, 'glm-5.1', 'model must be glm-5.1');
  assert.ok(settings.env?.ANTHROPIC_AUTH_TOKEN, 'auth token must be present');
  assert.ok(
    settings.env?.ANTHROPIC_BASE_URL?.includes('z.ai'),
    'base URL must point to z.ai'
  );
});

test('GLM responds to a trivial prompt via claude -p', { skip: !GLM_SMOKE && 'set GLM_SMOKE=1 to run' }, () => {
  const result = spawnSync(
    'claude',
    [
      '--dangerously-skip-permissions',
      '--settings', settingsPath,
      '-p', 'Reply with exactly one word: pong',
    ],
    { encoding: 'utf8', timeout: 60_000 }
  );

  assert.equal(result.status, 0, `claude -p exited non-zero: ${result.stderr}`);
  const out = (result.stdout ?? '').toLowerCase();
  assert.ok(out.includes('pong'), `expected "pong" in output, got: ${result.stdout}`);
});
