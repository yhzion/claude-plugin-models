import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const marketplacePath = resolve(repoRoot, '.claude-plugin/marketplace.json');

test('marketplace lists the pi plugin', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  assert.ok(Array.isArray(mp.plugins), 'plugins must be an array');
  const pi = mp.plugins.find((p) => p.name === 'pi');
  assert.ok(pi, 'pi plugin entry must exist');
  assert.match(pi.version ?? '', /^\d+\.\d+\.\d+$/);
  assert.ok(
    pi.description?.toLowerCase().includes('pi'),
    'pi entry description must mention pi'
  );
});

test('marketplace pi source path resolves to the pi plugin manifest', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  const pi = mp.plugins.find((p) => p.name === 'pi');
  const sourcePath = resolve(repoRoot, pi.source);
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
