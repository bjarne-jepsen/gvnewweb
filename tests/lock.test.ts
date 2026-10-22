import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock } from '../lib/lock';

// Phase 5f: a lock knows its owner, and a lock whose owner is gone is taken over.
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const lockPath = async () => { const dir = await mkdtemp(join(tmpdir(), 'gv-lock-')); roots.push(dir); return join(dir, 'lock'); };
const exists = (path: string) => Bun.file(path).exists();
const goneProcess = async () => { const p = Bun.spawn(['true']); await p.exited; return p.pid; };

test('låsen gemmer proces-ID og starttid, afviser en ny kørsel og fjernes ved release', async () => {
  const path = await lockPath();
  const lock = await acquireLock(path, 'Build/dev');
  expect(lock.recovered).toBeUndefined();
  const holder = JSON.parse(await readFile(path, 'utf8'));
  expect(holder.pid).toBe(process.pid);
  expect(Number.isNaN(Date.parse(holder.startedAt))).toBe(false);
  await rejects(acquireLock(path, 'Build/dev'), new RegExp(`Build/dev kører allerede \\(proces ${process.pid}, startet `));
  await lock.release();
  expect(await exists(path)).toBe(false);
  await (await acquireLock(path, 'Build/dev')).release();
});

test('en lås fra en proces, der er afsluttet, overtages og rapporteres', async () => {
  const path = await lockPath(), pid = await goneProcess();
  await writeFile(path, JSON.stringify({ pid, startedAt: '2026-10-22T16:39:00.000Z' }));
  const lock = await acquireLock(path, 'Sync');
  expect(lock.recovered).toEqual({ pid, startedAt: '2026-10-22T16:39:00.000Z' });
  expect(JSON.parse(await readFile(path, 'utf8')).pid).toBe(process.pid);
  await lock.release();
  expect(await exists(path)).toBe(false);
});

test('en lås fra en anden proces, der kører, afvises og bliver liggende', async () => {
  const path = await lockPath(), other = Bun.spawn(['sleep', '30']);
  try {
    const content = JSON.stringify({ pid: other.pid, startedAt: '2026-10-22T16:39:00.000Z' });
    await writeFile(path, content);
    await rejects(acquireLock(path, 'Sync'), new RegExp(`Sync kører allerede \\(proces ${other.pid}, startet 2026-10-22T16:39:00.000Z\\)`));
    expect(await readFile(path, 'utf8')).toBe(content);
  } finally { other.kill(); await other.exited; }
});

test('en tom eller ugyldig lås afvises og bliver liggende (default deny)', async () => {
  const path = await lockPath();
  for (const content of ['', '{"pid":', '{"pid":0,"startedAt":"x"}', '{"pid":"123","startedAt":"x"}', '{"startedAt":"x"}']) {
    await writeFile(path, content);
    await rejects(acquireLock(path, 'Build/dev'), /er uden proces-ID/);
    expect(await readFile(path, 'utf8')).toBe(content);
  }
});

test('release fjerner ikke en lås, som en anden kørsel har overtaget', async () => {
  const path = await lockPath();
  const lock = await acquireLock(path, 'Build/dev');
  const other = JSON.stringify({ pid: await goneProcess(), startedAt: '2026-10-22T18:00:00.000Z' });
  await writeFile(path, other); // as if our lock had been removed and another run took the file
  await lock.release();
  expect(await readFile(path, 'utf8')).toBe(other);
});
