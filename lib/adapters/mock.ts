import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeRecord, validateSet } from '../contracts/content';
import type { ContentAdapter } from './content-adapter';

export class MockContentAdapter implements ContentAdapter {
  constructor(private directory = 'fixtures/candidates') {}
  async listCandidates() {
    const records = await Promise.all(['documents', 'guides', 'notices', 'events'].map(async name => {
      const raw: unknown = JSON.parse(await readFile(join(this.directory, `${name}.json`), 'utf8'));
      if (!Array.isArray(raw)) throw new Error(`${name}: forventede en liste`);
      return raw.map((item, index) => {
        try { return normalizeRecord(item); }
        catch (error) { throw new Error(`${name}[${index}] (${item?.id ?? 'ukendt ID'}): ${String(error)}`); }
      });
    }));
    return validateSet(records.flat());
  }
}
