import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export function generateJobId() {
  return `gemini-task-${randomBytes(6).toString('hex')}`;
}

function jobPath(dataDir, id) {
  return join(dataDir, `${id}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function atomicWriteJson(filePath, obj) {
  const tmp = `${filePath}.tmp-${process.pid}-${randomBytes(3).toString('hex')}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  renameSync(tmp, filePath);
}

export function createJob(dataDir, { id, prompt, title, summary, jobClass, kind, write, logFile }) {
  mkdirSync(dataDir, { recursive: true });
  const ts = nowIso();
  const record = {
    id,
    status: 'queued',
    title: title ?? 'Gemini Task',
    summary: summary ?? null,
    jobClass: jobClass ?? 'task',
    kind: kind ?? 'task',
    prompt,
    pid: null,
    write: write ?? false,
    logFile: logFile ?? null,
    sessionId: null,
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    errorMessage: null,
  };
  atomicWriteJson(jobPath(dataDir, id), record);
  return record;
}

export function readJob(dataDir, id) {
  const p = jobPath(dataDir, id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function updateJob(dataDir, id, patch) {
  const current = readJob(dataDir, id);
  if (!current) throw new Error(`unknown job id: ${id}`);
  const next = { ...current, ...patch, updatedAt: nowIso() };
  if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'cancelled') {
    next.completedAt ??= nowIso();
  }
  atomicWriteJson(jobPath(dataDir, id), next);
  return next;
}

export function listJobs(dataDir) {
  if (!existsSync(dataDir)) return [];
  const entries = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  const jobs = entries
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  jobs.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return jobs;
}

export function deleteJob(dataDir, id) {
  const p = jobPath(dataDir, id);
  if (existsSync(p)) unlinkSync(p);
}
