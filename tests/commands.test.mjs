import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const commandsDir = resolve(repoRoot, 'plugins/glm/commands');

function parseFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: md };
  const fm = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return { frontmatter: fm, body: match[2] };
}

const EXPECTED = ['setup', 'rescue', 'review', 'status', 'result', 'cancel'];

test('all v0.3.0 slash commands are present', () => {
  const files = readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
  for (const name of EXPECTED) {
    assert.ok(files.includes(`${name}.md`), `commands/${name}.md must exist`);
  }
});

for (const name of EXPECTED) {
  test(`commands/${name}.md has description and allowed-tools frontmatter`, () => {
    const raw = readFileSync(join(commandsDir, `${name}.md`), 'utf8');
    const { frontmatter } = parseFrontmatter(raw);
    assert.ok(frontmatter, `${name}.md must start with YAML frontmatter`);
    assert.ok(frontmatter.description?.length > 10, `${name}.md description must be non-trivial`);
    assert.ok(frontmatter['allowed-tools']?.includes('Bash'), `${name}.md must allow Bash`);
  });

  test(`commands/${name}.md invokes glm-companion.mjs via \${CLAUDE_PLUGIN_ROOT}`, () => {
    const raw = readFileSync(join(commandsDir, `${name}.md`), 'utf8');
    assert.ok(
      raw.includes('${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs'),
      `${name}.md must invoke the companion via \${CLAUDE_PLUGIN_ROOT} (no hardcoded paths)`
    );
  });
}
