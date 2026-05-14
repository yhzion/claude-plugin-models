import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const agentPath = resolve(repoRoot, 'plugins/glm/agents/glm.md');

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

test('glm agent file exists and has frontmatter', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  assert.ok(frontmatter, 'agent must start with YAML frontmatter');
  assert.equal(frontmatter.name, 'glm', 'agent name must be "glm"');
});

test('glm agent description contains Korean trigger phrases', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  const desc = frontmatter.description ?? '';
  assert.ok(
    desc.includes('glm 에이전트') || desc.includes('glm한테') || desc.includes('glm에게'),
    'description must include Korean GLM trigger phrases for natural dispatch'
  );
  assert.ok(
    desc.toLowerCase().includes('glm') && desc.toLowerCase().includes('z.ai'),
    'description must mention both "glm" and "z.ai" so semantic matching is unambiguous'
  );
});

test('glm agent has at least one example block', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  const desc = frontmatter.description ?? '';
  assert.ok(desc.includes('<example>'), 'description should contain <example> blocks for dispatch accuracy');
});

test('glm agent declares Bash among its tools (needed for claude -p)', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  const tools = frontmatter.tools ?? '';
  assert.ok(tools.includes('Bash'), `tools must include "Bash": ${tools}`);
});

test('glm agent body invokes claude with GLM settings file', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { body } = parseFrontmatter(raw);
  assert.ok(
    body.includes('settings.glm.json'),
    'agent body must reference ~/.claude/settings.glm.json as the GLM configuration'
  );
  assert.ok(
    body.includes('claude') && body.includes('-p'),
    'agent body must invoke `claude -p` to delegate to GLM'
  );
  assert.ok(
    body.includes('--dangerously-skip-permissions'),
    'nested claude -p must skip permissions or it will hang on prompts'
  );
});
