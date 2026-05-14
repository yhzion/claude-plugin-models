import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const marketplacePath = resolve(repoRoot, '.claude-plugin/marketplace.json');

test('marketplace manifest is valid JSON', () => {
  const raw = readFileSync(marketplacePath, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

test('marketplace declares yhzion as owner', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  assert.equal(mp.owner?.name, 'yhzion');
  assert.equal(mp.owner?.email, 'gplusit@gmail.com');
});

test('marketplace lists the glm plugin', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  assert.ok(Array.isArray(mp.plugins), 'plugins must be an array');
  const glm = mp.plugins.find((p) => p.name === 'glm');
  assert.ok(glm, 'glm plugin entry must exist');
  assert.match(glm.version ?? '', /^\d+\.\d+\.\d+$/);
});

test('marketplace plugin source path resolves to a plugin manifest', () => {
  const mp = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  const glm = mp.plugins.find((p) => p.name === 'glm');
  const sourcePath = resolve(repoRoot, glm.source);
  assert.ok(existsSync(sourcePath), `source path must exist: ${sourcePath}`);
  assert.ok(statSync(sourcePath).isDirectory(), 'source must be a directory');

  const pluginManifestAtSource = resolve(sourcePath, '.claude-plugin/plugin.json');
  assert.ok(
    existsSync(pluginManifestAtSource),
    `plugin manifest must exist at source/<.claude-plugin/plugin.json>: ${pluginManifestAtSource}`
  );
});
