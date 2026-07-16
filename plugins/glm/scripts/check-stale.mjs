#!/usr/bin/env node
// check-stale — fail if a hardcoded GLM version (e.g. "GLM-5.x") is baked into
// the plugin's static docs/config/scripts. The model id must live ONLY in
// ~/.claude/settings.glm.json (single source of truth) and be read dynamically.
//
// Fenced code blocks (``` ... ```) are skipped, because a concrete model id is
// legitimately allowed inside a JSON/code example (e.g. setup.md's template).
//
// Run:  node scripts/check-stale.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..');
const SELF = fileURLToPath(import.meta.url);

// Match a hardcoded GLM version, e.g. "GLM-5.x", "glm-5.x", "GLM 5.x", "GLM_5.x" (any single-digit minor).
const VERSION_PATTERN = /\bglm[-_ ]?5\.\d\b/i;

const SCAN_EXTS = new Set(['.md', '.json', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', 'glm-jobs']);

function extOf(p) {
  const dot = p.lastIndexOf('.');
  return dot === -1 ? '' : p.slice(dot);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.git')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (SCAN_EXTS.has(extOf(full))) out.push(full);
  }
  return out;
}

// Scan one file's lines, skipping lines inside fenced code blocks.
// Returns hits with original 1-based line numbers preserved.
function scanFile(file) {
  const raw = readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const hits = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = lines[i].match(VERSION_PATTERN);
    if (m) hits.push({ line: i + 1, match: m[0], text: lines[i].trim() });
  }
  return hits;
}

const files = walk(PLUGIN_ROOT).filter((f) => f !== SELF);
const allHits = [];
for (const file of files) {
  for (const h of scanFile(file)) {
    allHits.push({ rel: file.replace(PLUGIN_ROOT + '/', ''), ...h });
  }
}

if (allHits.length) {
  process.stderr.write(
    `check-stale: hardcoded GLM version found in ${allHits.length} place(s).\n` +
    `The model id must live only in ~/.claude/settings.glm.json and be read dynamically.\n\n`,
  );
  for (const h of allHits) {
    process.stderr.write(`  ${h.rel}:${h.line}  "${h.match}"  ${h.text}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `check-stale: OK — no hardcoded GLM versions outside code blocks (${files.length} files scanned).\n`,
);
