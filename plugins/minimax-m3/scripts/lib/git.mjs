import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export function hasGitRepo(cwd) {
  return existsSync(join(cwd, '.git'));
}

export function detectMainBranch(cwd) {
  for (const name of ['main', 'master']) {
    const r = git(['rev-parse', '--verify', '-q', name], cwd);
    if (r.code === 0) return name;
  }
  return null;
}

export function collectWorkingTreeDiff(cwd) {
  const tracked = git(['diff', 'HEAD'], cwd).stdout;
  const untrackedList = git(['ls-files', '--others', '--exclude-standard'], cwd).stdout
    .split('\n')
    .filter(Boolean);
  if (untrackedList.length === 0) return tracked;
  const untrackedSections = untrackedList.map((file) => {
    const r = git(['diff', '--no-index', '/dev/null', file], cwd);
    return r.stdout;
  });
  return [tracked, ...untrackedSections].filter(Boolean).join('\n');
}

export function collectBranchDiff(cwd, baseRef) {
  return git(['diff', `${baseRef}...HEAD`], cwd).stdout;
}

export function collectCommitLog(cwd, baseRef) {
  return git(['log', '--oneline', `${baseRef}..HEAD`], cwd).stdout;
}
