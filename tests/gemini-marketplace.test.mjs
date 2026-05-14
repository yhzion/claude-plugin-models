import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const marketplacePath = resolve(repoRoot, '.claude-plugin/marketplace.json');

test('marketplace lists the gemini plugin', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  assert.ok(Array.isArray(mp.plugins), 'plugins must be an array');
  const gemini = mp.plugins.find((p) => p.name === 'gemini');
  assert.ok(gemini, 'gemini plugin entry must exist');
  assert.match(gemini.version ?? '', /^\d+\.\d+\.\d+$/);
  assert.ok(
    gemini.description?.toLowerCase().includes('gemini'),
    'gemini entry description must mention Gemini'
  );
});

test('marketplace gemini source path resolves to the gemini plugin manifest', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  const gemini = mp.plugins.find((p) => p.name === 'gemini');
  const sourcePath = resolve(repoRoot, gemini.source);
  assert.ok(existsSync(sourcePath), `source path must exist: ${sourcePath}`);
  assert.ok(statSync(sourcePath).isDirectory(), 'source must be a directory');

  const pluginManifestAtSource = resolve(sourcePath, '.claude-plugin/plugin.json');
  assert.ok(
    existsSync(pluginManifestAtSource),
    `plugin manifest must exist at source/<.claude-plugin/plugin.json>: ${pluginManifestAtSource}`
  );
});

test('marketplace gemini and glm plugin entries do not share the same name or source', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  const names = mp.plugins.map((p) => p.name);
  const sources = mp.plugins.map((p) => p.source);
  assert.equal(new Set(names).size, names.length, 'plugin names must be unique');
  assert.equal(new Set(sources).size, sources.length, 'plugin sources must be unique');
});
