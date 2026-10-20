import { mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { MockContentAdapter } from '../lib/adapters/mock';
import { selectPublic } from '../lib/publication/store';
import { verifyOutput } from './verify-output';

const dev = process.argv.includes('--dev');
await mkdir('.build', { recursive: true });
let lock;
try { lock = await Bun.file('.build/lock').exists() ? null : await import('node:fs/promises').then(fs => fs.open('.build/lock', 'wx')); }
catch { throw new Error('Build/dev kører allerede. Fjern kun .build/lock efter et afbrudt forløb.'); }
if (!lock) throw new Error('Build/dev kører allerede (.build/lock).');
try {
  const buildAt = process.env.BUILD_AT ?? new Date().toISOString();
  const candidates = await new MockContentAdapter().listCandidates();
  const manifest = JSON.parse(await readFile('fixtures/manifest.json', 'utf8'));
  const approvals = JSON.parse(await readFile('fixtures/approvals.json', 'utf8'));
  const selected = await selectPublic(manifest, approvals, 'fixtures/snapshots', buildAt);
  await rm('.build/assets', { recursive: true, force: true });
  await rm('.build/staging', { recursive: true, force: true });
  await mkdir('.build/assets/downloads', { recursive: true });
  await writeFile('.build/content.json', JSON.stringify(selected.records));
  for (const [url, bytes] of selected.assets) {
    const target = join('.build/assets', url.slice(1));
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
  }
  const command = dev ? ['node', 'node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1'] : ['node', 'node_modules/astro/bin/astro.mjs', 'build'];
  const processResult = Bun.spawn(command, { stdout: 'inherit', stderr: 'inherit', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  const exit = await processResult.exited;
  if (exit !== 0) throw new Error(`Astro fejlede med exit ${exit}; dist er bevaret`);
  if (!dev) {
    await verifyOutput('.build/staging', selected.records, selected.assets, candidates);
    await rm('.build/previous', { recursive: true, force: true });
    let previous = false;
    try { await rename('dist', '.build/previous'); previous = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await rename('.build/staging', 'dist'); }
    catch (error) { if (previous) await rename('.build/previous', 'dist'); throw error; }
    await rm('.build/previous', { recursive: true, force: true });
    console.log(`Outputkontrol bestået: ${selected.records.length} offentlige snapshots, ${selected.assets.size} PDF. buildAt=${buildAt}`);
  }
} finally {
  await lock.close(); await rm('.build/lock', { force: true });
}
