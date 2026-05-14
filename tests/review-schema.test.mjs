import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const schemaPath = resolve(repoRoot, 'plugins/glm/schemas/review-output.schema.json');
const templatePath = resolve(repoRoot, 'plugins/glm/prompts/review.md');

test('review-output schema is valid JSON Schema (parses + has expected properties)', () => {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.type, 'object');
  assert.ok(Array.isArray(schema.required));
  assert.ok(schema.required.includes('intent'));
  assert.ok(schema.required.includes('issues'));
  assert.ok(schema.required.includes('looksGood'));
});

test('review-output schema constrains severity to the documented enum', () => {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const severity = schema.properties.issues.items.properties.severity;
  assert.deepEqual(severity.enum.sort(), ['critical', 'major', 'minor']);
});

test('review prompt template references all required placeholders', () => {
  const tpl = readFileSync(templatePath, 'utf8');
  for (const placeholder of ['{{BACKGROUND}}', '{{REPO_NAME}}', '{{BRANCH}}', '{{BASE_REF}}', '{{SCOPE}}', '{{COMMITS}}', '{{DIFF}}']) {
    assert.ok(tpl.includes(placeholder), `template must contain ${placeholder}`);
  }
});

test('review prompt template enforces the documented output structure', () => {
  const tpl = readFileSync(templatePath, 'utf8');
  assert.ok(tpl.includes('## Intent'));
  assert.ok(tpl.includes('## Issues'));
  assert.ok(tpl.includes('## Looks good'));
});
