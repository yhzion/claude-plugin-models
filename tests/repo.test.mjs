import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const readmePath = resolve(repoRoot, 'README.md');

test('repo has a README.md so marketplace discovery is meaningful', () => {
  assert.ok(existsSync(readmePath), `README.md missing at ${readmePath}`);
});

test('README documents the marketplace install command', () => {
  const md = readFileSync(readmePath, 'utf8');
  assert.ok(
    md.includes('claude plugins marketplace add yhzion/claude-plugin-models'),
    'README must show the marketplace install command users need to run'
  );
  assert.ok(
    md.includes('/glm:setup') || md.includes('settings.glm.json'),
    'README must mention how to configure the GLM API key'
  );
});

test('README mentions the Korean trigger pattern so users know how to invoke the agent', () => {
  const md = readFileSync(readmePath, 'utf8');
  assert.ok(
    md.includes('glm 에이전트') || md.includes('glm한테') || md.includes('glm에게'),
    'README must show an example Korean dispatch phrase'
  );
});
