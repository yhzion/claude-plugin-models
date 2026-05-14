import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const manifestPath = resolve(repoRoot, 'plugins/gemini/.claude-plugin/plugin.json');

test('gemini plugin manifest is valid JSON', () => {
  const raw = readFileSync(manifestPath, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

test('gemini plugin manifest has required fields', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.name, 'gemini', 'plugin name must be "gemini"');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'version must be semver');
  assert.ok(manifest.description?.length > 10, 'description must be non-trivial');
});

test('gemini plugin manifest author uses yhzion personal account', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.author?.name, 'yhzion');
  assert.equal(manifest.author?.email, 'gplusit@gmail.com');
});

test('gemini plugin manifest points to yhzion/claude-plugin-models repository', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.ok(
    manifest.repository?.includes('yhzion/claude-plugin-models'),
    `repository field must reference yhzion/claude-plugin-models, got: ${manifest.repository}`
  );
});
