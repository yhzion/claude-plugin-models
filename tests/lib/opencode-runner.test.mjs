// Tests for the opencode runner.
//
// opencode manages its own auth and default model, so the delegation is just
// `opencode run [--dangerously-skip-permissions] [-m provider/model] <prompt>`.
// The headline requirement: omitting the model uses opencode's default
// (last-used) model — i.e. buildOpencodeArgs must NOT inject `-m` unless asked.
//
// The async-runner tests are hermetic: they point the runner at a throwaway
// fake binary (a chmod+x node script), so no real opencode/model is involved.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildOpencodeArgs,
  runOpencodeForeground,
} from '../../plugins/opencode/scripts/lib/opencode-runner.mjs';

function fakeBin(body) {
  const dir = mkdtempSync(join(tmpdir(), 'opencode-fake-'));
  const p = join(dir, 'fake.mjs');
  writeFileSync(p, '#!/usr/bin/env node\n' + body + '\n', 'utf8');
  chmodSync(p, 0o755);
  return p;
}

const PRINT_AND_EXIT = 'process.stdout.write("HELLO"); process.exit(0);';
const IGNORE_SIGTERM_FOREVER = 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000);';

test('buildOpencodeArgs runs `run` with skip-permissions and omits -m by default', () => {
  const args = buildOpencodeArgs({ prompt: 'do the thing' });
  assert.equal(args[0], 'run');
  assert.ok(args.includes('--dangerously-skip-permissions'));
  assert.ok(!args.includes('-m'), 'no -m when model is unset (uses opencode default/last model)');
  assert.equal(args[args.length - 1], 'do the thing', 'prompt is the trailing positional');
});

test('buildOpencodeArgs injects -m only when a model is provided', () => {
  const args = buildOpencodeArgs({ prompt: 'hi', model: 'anthropic/claude-opus-4-8' });
  const i = args.indexOf('-m');
  assert.ok(i !== -1, '-m present when model given');
  assert.equal(args[i + 1], 'anthropic/claude-opus-4-8');
  assert.equal(args[args.length - 1], 'hi');
});

test('runOpencodeForeground returns a Promise and captures stdout', async () => {
  const bin = fakeBin(PRINT_AND_EXIT);
  const ret = runOpencodeForeground({ opencodeBin: bin, prompt: 'hi' });
  assert.equal(typeof ret?.then, 'function', 'foreground runner must return a Promise');
  const { code, stdout } = await ret;
  assert.equal(code, 0);
  assert.equal(stdout, 'HELLO');
});

test('runOpencodeForeground times out and kills a SIGTERM-ignoring child', { timeout: 8000 }, async () => {
  const bin = fakeBin(IGNORE_SIGTERM_FOREVER);
  const start = Date.now();
  const { code } = await runOpencodeForeground({ opencodeBin: bin, prompt: 'hi', timeoutMs: 1000 });
  const elapsed = Date.now() - start;
  assert.equal(code, 124, 'a timed-out job must report exit code 124');
  assert.ok(elapsed < 6000, `runner should return promptly after timeout; took ${elapsed}ms`);
});

test('runOpencodeForeground surfaces a missing binary as code 1 without throwing', async () => {
  const { code } = await runOpencodeForeground({ opencodeBin: '/no/such/bin-xyz', prompt: 'hi', timeoutMs: 2000 });
  assert.equal(code, 1);
});
