import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  collectWorkingTreeDiff,
  collectBranchDiff,
  detectMainBranch,
  hasGitRepo,
} from '../../plugins/glm/scripts/lib/git.mjs';

let repoDir;

function git(args, cwd = repoDir) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

beforeEach(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'glm-git-test-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  writeFileSync(join(repoDir, 'a.txt'), 'hello\n');
  git(['add', 'a.txt']);
  git(['commit', '-q', '-m', 'initial']);
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

test('hasGitRepo returns true inside a repo', () => {
  assert.equal(hasGitRepo(repoDir), true);
});

test('hasGitRepo returns false outside a repo', () => {
  const outside = mkdtempSync(join(tmpdir(), 'no-git-'));
  try {
    assert.equal(hasGitRepo(outside), false);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('detectMainBranch returns main when a main branch exists', () => {
  assert.equal(detectMainBranch(repoDir), 'main');
});

test('detectMainBranch returns master when only master exists', () => {
  // Create a sibling repo with master as default.
  const masterRepo = mkdtempSync(join(tmpdir(), 'glm-git-master-'));
  try {
    spawnSync('git', ['init', '-q', '-b', 'master'], { cwd: masterRepo });
    spawnSync('git', ['config', 'user.email', 'x@x'], { cwd: masterRepo });
    spawnSync('git', ['config', 'user.name', 'x'], { cwd: masterRepo });
    writeFileSync(join(masterRepo, 'f'), 'x');
    spawnSync('git', ['add', 'f'], { cwd: masterRepo });
    spawnSync('git', ['commit', '-q', '-m', 'm'], { cwd: masterRepo });
    assert.equal(detectMainBranch(masterRepo), 'master');
  } finally {
    rmSync(masterRepo, { recursive: true, force: true });
  }
});

test('collectWorkingTreeDiff captures unstaged + staged + untracked changes', () => {
  // Unstaged modification
  writeFileSync(join(repoDir, 'a.txt'), 'hello\nworld\n');
  // Staged new file
  writeFileSync(join(repoDir, 'b.txt'), 'staged\n');
  git(['add', 'b.txt']);
  // Untracked new file
  writeFileSync(join(repoDir, 'c.txt'), 'untracked\n');

  const out = collectWorkingTreeDiff(repoDir);
  assert.ok(out.includes('a.txt'), 'should include modified file');
  assert.ok(out.includes('b.txt'), 'should include staged file');
  assert.ok(out.includes('c.txt'), `should include untracked file, got:\n${out}`);
});

test('collectWorkingTreeDiff returns empty string on clean tree', () => {
  const out = collectWorkingTreeDiff(repoDir);
  assert.equal(out.trim(), '');
});

test('collectBranchDiff returns commits between base and HEAD', () => {
  // Branch off main, add a commit
  git(['checkout', '-q', '-b', 'feat/x']);
  writeFileSync(join(repoDir, 'feat.txt'), 'feature\n');
  git(['add', 'feat.txt']);
  git(['commit', '-q', '-m', 'feat: add feature']);

  const out = collectBranchDiff(repoDir, 'main');
  assert.ok(out.includes('feat.txt'), 'branch diff must include feature file');
  assert.ok(out.includes('feat:') || out.includes('+feature'), 'branch diff must reflect the change');
});

test('collectBranchDiff returns empty string when feature branch has no extra commits', () => {
  const out = collectBranchDiff(repoDir, 'main');
  assert.equal(out.trim(), '');
});
