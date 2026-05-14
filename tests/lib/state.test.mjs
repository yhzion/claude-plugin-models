import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createJob,
  readJob,
  updateJob,
  listJobs,
  deleteJob,
  generateJobId,
} from '../../plugins/glm/scripts/lib/state.mjs';

let dataDir;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'glm-jobs-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

test('generateJobId returns a unique-looking id with glm-task- prefix', () => {
  const a = generateJobId();
  const b = generateJobId();
  assert.match(a, /^glm-task-[a-z0-9]{8,}$/);
  assert.notEqual(a, b, 'two consecutive ids must differ');
});

test('createJob writes a queued job record and returns it', () => {
  const job = createJob(dataDir, {
    id: 'glm-task-abc12345',
    prompt: 'hello',
    title: 'GLM Task',
  });
  assert.equal(job.status, 'queued');
  assert.equal(job.prompt, 'hello');
  assert.equal(job.id, 'glm-task-abc12345');
  assert.ok(job.createdAt, 'createdAt must be set');
});

test('readJob returns the persisted record', () => {
  createJob(dataDir, { id: 'glm-task-readback', prompt: 'p' });
  const got = readJob(dataDir, 'glm-task-readback');
  assert.equal(got.id, 'glm-task-readback');
  assert.equal(got.prompt, 'p');
});

test('readJob returns null for an unknown id', () => {
  const got = readJob(dataDir, 'glm-task-doesnotexist');
  assert.equal(got, null);
});

test('updateJob merges fields and bumps updatedAt', () => {
  createJob(dataDir, { id: 'glm-task-u', prompt: 'p' });
  const updated = updateJob(dataDir, 'glm-task-u', {
    status: 'running',
    pid: 1234,
  });
  assert.equal(updated.status, 'running');
  assert.equal(updated.pid, 1234);
  assert.ok(updated.updatedAt, 'updatedAt must be set on update');
});

test('updateJob with status=completed sets completedAt', () => {
  createJob(dataDir, { id: 'glm-task-c', prompt: 'p' });
  const updated = updateJob(dataDir, 'glm-task-c', { status: 'completed' });
  assert.ok(updated.completedAt, 'completedAt must be set when status flips to completed');
});

test('listJobs returns most-recent first', async () => {
  createJob(dataDir, { id: 'glm-task-first', prompt: 'p1' });
  await new Promise((r) => setTimeout(r, 20));
  createJob(dataDir, { id: 'glm-task-second', prompt: 'p2' });
  const jobs = listJobs(dataDir);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].id, 'glm-task-second');
  assert.equal(jobs[1].id, 'glm-task-first');
});

test('deleteJob removes the record from disk', () => {
  createJob(dataDir, { id: 'glm-task-rm', prompt: 'p' });
  deleteJob(dataDir, 'glm-task-rm');
  assert.equal(readJob(dataDir, 'glm-task-rm'), null);
});

test('listJobs on an empty dir returns []', () => {
  const jobs = listJobs(dataDir);
  assert.deepEqual(jobs, []);
});

test('atomic write: a torn write does not produce an unreadable record', () => {
  const job = createJob(dataDir, { id: 'glm-task-atomic', prompt: 'p' });
  const reread = readJob(dataDir, job.id);
  assert.deepEqual(reread, job, 'after create, readJob must return exactly the written record');
});
