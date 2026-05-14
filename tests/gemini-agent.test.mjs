import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const agentPath = resolve(repoRoot, 'plugins/gemini/agents/gemini.md');

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

test('gemini agent file exists and has frontmatter', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  assert.ok(frontmatter, 'agent must start with YAML frontmatter');
  assert.equal(frontmatter.name, 'gemini', 'agent name must be "gemini"');
});

test('gemini agent description contains Korean trigger phrases', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  const desc = frontmatter.description ?? '';
  assert.ok(
    desc.includes('gemini') && (desc.includes('에이전트') || desc.includes('한테') || desc.includes('에게')),
    'description must include Korean Gemini trigger phrases for natural dispatch'
  );
  assert.ok(
    desc.toLowerCase().includes('gemini') && (desc.toLowerCase().includes('google') || desc.toLowerCase().includes('구글')),
    'description must mention both "gemini" and Google/구글 so semantic matching is unambiguous'
  );
});

test('gemini agent has at least one example block', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  const desc = frontmatter.description ?? '';
  assert.ok(desc.includes('<example>'), 'description should contain <example> blocks for dispatch accuracy');
});

test('gemini agent declares Bash among its tools (needed for gemini -p)', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { frontmatter } = parseFrontmatter(raw);
  const tools = frontmatter.tools ?? '';
  assert.ok(tools.includes('Bash'), `tools must include "Bash": ${tools}`);
});

test('gemini agent body invokes the gemini CLI (not claude -p)', () => {
  const raw = readFileSync(agentPath, 'utf8');
  const { body } = parseFrontmatter(raw);
  assert.ok(
    body.includes('gemini') && body.includes('-p'),
    'agent body must invoke `gemini -p` to delegate to Gemini'
  );
  assert.ok(
    !body.includes('settings.glm.json'),
    'gemini agent body must not reference GLM settings — Gemini auth is OAuth/env, not settings file'
  );
});
