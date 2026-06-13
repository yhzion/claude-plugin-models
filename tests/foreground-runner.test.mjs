// Tests for the redesigned async foreground runners (glm + gemini).
//
// The bug: foreground delegation used a synchronous spawnSync that (a) left
// stdin open so a nested CLI could block forever on EOF, and (b) used a
// SIGTERM-only timeout that these CLIs ignore. The redesign makes the runner
// async (Promise-returning), ignores stdin, and enforces a real timeout that
// escalates SIGTERM -> SIGKILL against the whole process group.
//
// These tests are hermetic: they point the runner at a throwaway fake binary
// (a chmod+x node script), so no real claude/gemini/API is involved.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runClaudeForeground } from '../plugins/glm/scripts/lib/claude-runner.mjs';
import { runGeminiForeground } from '../plugins/gemini/scripts/lib/gemini-runner.mjs';

function fakeBin(body) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-cli-'));
  const p = join(dir, 'fake.mjs');
  writeFileSync(p, '#!/usr/bin/env node\n' + body + '\n', 'utf8');
  chmodSync(p, 0o755);
  return p;
}

// A child that prints to stdout and exits cleanly.
const PRINT_AND_EXIT = 'process.stdout.write("HELLO"); process.exit(0);';
// A child that ignores SIGTERM and never exits on its own.
const IGNORE_SIGTERM_FOREVER = 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000);';

const runners = [
  { name: 'glm', run: (o) => runClaudeForeground(o) },
  { name: 'gemini', run: (o) => runGeminiForeground(o) },
];

for (const { name, run } of runners) {
  test(`${name}: foreground returns a Promise and captures stdout`, async () => {
    const bin = fakeBin(PRINT_AND_EXIT);
    const ret = run({ [name === 'glm' ? 'claudeBin' : 'geminiBin']: bin, settingsPath: '/x', prompt: 'hi' });
    assert.equal(typeof ret?.then, 'function', 'foreground runner must return a Promise');
    const { code, stdout } = await ret;
    assert.equal(code, 0);
    assert.equal(stdout, 'HELLO');
  });

  test(`${name}: foreground times out and kills a SIGTERM-ignoring child`, { timeout: 8000 }, async () => {
    const bin = fakeBin(IGNORE_SIGTERM_FOREVER);
    const start = Date.now();
    const { code } = await run({
      [name === 'glm' ? 'claudeBin' : 'geminiBin']: bin,
      settingsPath: '/x', prompt: 'hi', timeoutMs: 1000,
    });
    const elapsed = Date.now() - start;
    assert.equal(code, 124, 'a timed-out job must report exit code 124');
    assert.ok(elapsed < 6000, `runner should return promptly after timeout; took ${elapsed}ms`);
  });

  test(`${name}: missing binary surfaces as code 1 without throwing`, async () => {
    const { code } = await run({
      [name === 'glm' ? 'claudeBin' : 'geminiBin']: '/no/such/bin-xyz',
      settingsPath: '/x', prompt: 'hi', timeoutMs: 2000,
    });
    assert.equal(code, 1);
  });
}
