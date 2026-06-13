import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const marketplacePath = resolve(repoRoot, '.claude-plugin/marketplace.json');

test('marketplace lists the opencode plugin', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  assert.ok(Array.isArray(mp.plugins), 'plugins must be an array');
  const opencode = mp.plugins.find((p) => p.name === 'opencode');
  assert.ok(opencode, 'opencode plugin entry must exist');
  assert.match(opencode.version ?? '', /^\d+\.\d+\.\d+$/);
  assert.ok(
    opencode.description?.toLowerCase().includes('opencode'),
    'opencode entry description must mention opencode'
  );
});

test('marketplace opencode source path resolves to the opencode plugin manifest', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  const opencode = mp.plugins.find((p) => p.name === 'opencode');
  const sourcePath = resolve(repoRoot, opencode.source);
  assert.ok(existsSync(sourcePath), `source path must exist: ${sourcePath}`);
  assert.ok(statSync(sourcePath).isDirectory(), 'source must be a directory');

  const pluginManifestAtSource = resolve(sourcePath, '.claude-plugin/plugin.json');
  assert.ok(
    existsSync(pluginManifestAtSource),
    `plugin manifest must exist at source/<.claude-plugin/plugin.json>: ${pluginManifestAtSource}`
  );
});

test('marketplace plugin entries have unique names and sources', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  const names = mp.plugins.map((p) => p.name);
  const sources = mp.plugins.map((p) => p.source);
  assert.equal(new Set(names).size, names.length, 'plugin names must be unique');
  assert.equal(new Set(sources).size, sources.length, 'plugin sources must be unique');
});
