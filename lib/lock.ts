import { open, readFile, rm } from 'node:fs/promises';

/** Who holds a lock: written by the holder right after it creates the file. */
export interface LockHolder { pid: number; startedAt: string }
const parse = (text: string): LockHolder | undefined => {
  try {
    const h = JSON.parse(text);
    return Number.isSafeInteger(h?.pid) && h.pid > 0 && typeof h.startedAt === 'string' ? { pid: h.pid, startedAt: h.startedAt } : undefined;
  } catch { return undefined; }
};
// Signal 0 only checks that the process exists. EPERM: it exists, but belongs to another user.
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } };
const code = (e: unknown) => (e as NodeJS.ErrnoException).code;
const read = (path: string) => readFile(path, 'utf8').catch(e => { if (code(e) === 'ENOENT') return undefined; throw e; });

/** Exclusive lock file holding the owner's PID. A lock whose process is gone was left by an
 * interrupted run and is taken over; `recovered` says so. A lock without a readable owner is
 * never touched (default deny), so a run that is starting or an older empty lock blocks. */
export async function acquireLock(path: string, label: string) {
  let recovered: LockHolder | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const holder: LockHolder = { pid: process.pid, startedAt: new Date().toISOString() };
    try {
      const file = await open(path, 'wx');
      try { await file.writeFile(JSON.stringify(holder)); } finally { await file.close(); }
      const release = async () => {
        const now = parse(await read(path) ?? '');
        if (now?.pid === holder.pid && now.startedAt === holder.startedAt) await rm(path, { force: true }); // only our own lock
      };
      return { release, recovered };
    } catch (error) { if (code(error) !== 'EEXIST') throw error; }
    const text = await read(path);
    if (text === undefined) continue; // released meanwhile
    const other = parse(text);
    if (!other) throw new Error(`${label} kører allerede, eller ${path} er uden proces-ID. Fjern kun ${path}, når ingen anden kørsel er i gang.`);
    if (recovered || alive(other.pid)) throw new Error(`${label} kører allerede (proces ${other.pid}, startet ${other.startedAt}).`);
    if (await read(path) === text) await rm(path, { force: true }); // still the same abandoned lock
    recovered = other;
  }
  throw new Error(`${label}: kunne ikke tage ${path}. Prøv igen.`);
}
