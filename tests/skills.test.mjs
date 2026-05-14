import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const skillsDir = resolve(repoRoot, 'plugins/glm/skills');

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

const EXPECTED_SKILLS = [
  'glm-cli-runtime',
  'glm-result-handling',
  'glm-5-1-prompting',
];

test('all v0.4.0 skills directories exist', () => {
  for (const name of EXPECTED_SKILLS) {
    const dir = join(skillsDir, name);
    assert.ok(existsSync(dir), `${dir} must exist`);
    assert.ok(statSync(dir).isDirectory(), `${dir} must be a directory`);
  }
});

for (const name of EXPECTED_SKILLS) {
  test(`skills/${name}/SKILL.md is present with valid frontmatter`, () => {
    const skillPath = join(skillsDir, name, 'SKILL.md');
    assert.ok(existsSync(skillPath), `${skillPath} must exist`);
    const raw = readFileSync(skillPath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    assert.ok(frontmatter, `${name} SKILL.md must start with frontmatter`);
    assert.equal(frontmatter.name, name, `${name} SKILL.md name must match dir`);
    assert.ok(frontmatter.description?.length > 30, `${name} description must be substantive`);
    assert.ok(body.trim().length > 200, `${name} body must be non-trivial`);
  });
}

test('glm-5-1-prompting has the three documented reference files', () => {
  const refDir = join(skillsDir, 'glm-5-1-prompting/references');
  assert.ok(existsSync(refDir));
  const expected = ['prompt-blocks.md', 'glm-prompt-recipes.md', 'glm-prompt-antipatterns.md'];
  const actual = readdirSync(refDir);
  for (const f of expected) {
    assert.ok(actual.includes(f), `references/${f} must exist`);
  }
});

test('glm-5-1-prompting SKILL.md references prompt-blocks / recipes / antipatterns', () => {
  const md = readFileSync(join(skillsDir, 'glm-5-1-prompting/SKILL.md'), 'utf8');
  assert.ok(md.includes('prompt-blocks.md'));
  assert.ok(md.includes('glm-prompt-recipes.md'));
  assert.ok(md.includes('glm-prompt-antipatterns.md'));
});

test('skill cross-references use [[name]] linking convention', () => {
  // Cross-references between the three skills make them discoverable.
  const cliRuntime = readFileSync(join(skillsDir, 'glm-cli-runtime/SKILL.md'), 'utf8');
  assert.ok(cliRuntime.includes('[[glm-result-handling]]') || cliRuntime.includes('[[glm-5-1-prompting]]'));

  const resultHandling = readFileSync(join(skillsDir, 'glm-result-handling/SKILL.md'), 'utf8');
  assert.ok(resultHandling.includes('[[glm-cli-runtime]]') || resultHandling.includes('[[glm-5-1-prompting]]'));

  const prompting = readFileSync(join(skillsDir, 'glm-5-1-prompting/SKILL.md'), 'utf8');
  assert.ok(prompting.includes('[[glm-cli-runtime]]') || prompting.includes('[[glm-result-handling]]'));
});

test('glm-cli-runtime documents the canonical companion invocation path', () => {
  const md = readFileSync(join(skillsDir, 'glm-cli-runtime/SKILL.md'), 'utf8');
  assert.ok(md.includes('${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs'));
  assert.ok(md.includes('GLM_SETTINGS_PATH') || md.includes('GLM_JOBS_DIR') || md.includes('GLM_CLAUDE_BIN'));
});

test('glm-result-handling enforces the canonical GLM Response header', () => {
  const md = readFileSync(join(skillsDir, 'glm-result-handling/SKILL.md'), 'utf8');
  assert.ok(md.includes('## GLM Response'));
  assert.ok(md.toLowerCase().includes('verbatim'));
});
