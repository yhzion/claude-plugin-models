import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const agentPath = resolve(repoRoot, 'plugins/glm/agents/glm-rescue.md');

function parseFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: md };
  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  let currentValue = [];
  for (const line of lines) {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (kv && !line.startsWith(' ')) {
      if (currentKey) fm[currentKey] = currentValue.join('\n').trim();
      currentKey = kv[1];
      currentValue = [kv[2]];
    } else if (currentKey) {
      currentValue.push(line);
    }
  }
  if (currentKey) fm[currentKey] = currentValue.join('\n').trim();
  return { frontmatter: fm, body: match[2] };
}

test('glm-rescue agent file has correct name in frontmatter', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  assert.equal(frontmatter.name, 'glm-rescue');
});

test('glm-rescue description differentiates it from the simple glm agent', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  const desc = frontmatter.description ?? '';
  assert.ok(desc.includes('rescue'), 'must mention rescue pattern');
  assert.ok(
    desc.includes('백그라운드') || desc.includes('background') || desc.includes('잡'),
    'must mention background/job tracking differentiator'
  );
});

test('glm-rescue body references the companion via ${CLAUDE_PLUGIN_ROOT}', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { body } = parseFrontmatter(raw);
  assert.ok(
    body.includes('${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs'),
    'rescue agent must dispatch via the companion CLI (no direct claude -p)'
  );
});

test('glm-rescue body documents the three-section prompt format', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { body } = parseFrontmatter(raw);
  assert.ok(body.includes('## Background'));
  assert.ok(body.includes('## Request'));
  assert.ok(body.includes('## Context'));
});

test('glm-rescue body covers status / result / cancel follow-ups', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { body } = parseFrontmatter(raw);
  assert.ok(body.includes('status'));
  assert.ok(body.includes('result'));
  assert.ok(body.includes('cancel'));
});
