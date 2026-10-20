import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContentRecord } from '../contracts/content';
import type { Asset } from './assets';
import { materializeGoogleAssets } from '../adapters/google';
import { prepare } from './store';
import { writePilotReview } from './pilot-review';
/** Not an approval function: never touches the public register, manifest or dist. */
export async function preparePilot(records: ContentRecord[], assets: {file: Asset; bytes: Uint8Array}[], base = '.local/google-pilot') {
  await mkdir(base, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(base, 'prepared-'));
  try {
    const assetRoot = join(directory, 'assets'), snapshots = join(directory, 'snapshots');
    await materializeGoogleAssets(assetRoot, assets);
    const manifest = [];
    for (const record of records) manifest.push(await prepare(record, assetRoot, snapshots));
    for (const [name, value] of Object.entries({ 'candidates.json': records, 'prepared-manifest.json': manifest })) {
      await writeFile(join(directory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    }
    await writePilotReview(directory, records);
    return directory;
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
