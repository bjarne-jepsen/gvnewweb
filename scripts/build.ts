import { mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { acquireLock } from '../lib/lock';
import { htaccess } from '../lib/site/htaccess';
import { loadSite } from '../lib/site/load';
import { verifyOutput } from './verify-output';

const dev = process.argv.includes('--dev');
await mkdir('.build', { recursive: true });
const lock = await acquireLock('.build/lock', 'Build/dev');
if (lock.recovered) console.warn(`Advarsel: fjernede .build/lock efterladt af proces ${lock.recovered.pid} (startet ${lock.recovered.startedAt}), som ikke kører længere.`);
try {
  // content/ is the only source. Invalid content stops here, before dist is touched.
  // One build instant for this script and Astro, so news filtering cannot differ between them.
  process.env.BUILD_AT ??= new Date().toISOString();
  const site = await loadSite('.');
  for (const warning of site.warnings) console.warn(`Advarsel: ${warning}`);
  await rm('.build/assets', { recursive: true, force: true });
  await rm('.build/staging', { recursive: true, force: true });
  await mkdir('.build/assets', { recursive: true });
  for (const [url, bytes] of site.assets) {
    const target = join('.build/assets', url.slice(1));
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
  }
  const command = dev ? ['node', 'node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1'] : ['node', 'node_modules/astro/bin/astro.mjs', 'build'];
  const processResult = Bun.spawn(command, { stdout: 'inherit', stderr: 'inherit', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  const exit = await processResult.exited;
  if (exit !== 0) throw new Error(`Astro fejlede med exit ${exit}; dist er bevaret`);
  if (!dev) {
    await writeFile('.build/staging/.htaccess', htaccess(site));
    await verifyOutput('.build/staging', site);
    await rm('.build/previous', { recursive: true, force: true });
    let previous = false;
    try { await rename('dist', '.build/previous'); previous = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await rename('.build/staging', 'dist'); }
    catch (error) { if (previous) await rename('.build/previous', 'dist'); throw error; }
    await rm('.build/previous', { recursive: true, force: true });
    console.log(`Outputkontrol bestået: ${site.items.length} sider, ${site.redirects.length} redirects, ${site.assets.size} billeder. Dato: ${site.buildDay}.`);
  }
} finally {
  await lock.release();
}
