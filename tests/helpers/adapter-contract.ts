import { expect } from 'bun:test';
import type { ContentAdapter } from '../../lib/adapters/content-adapter';
import { contentHash, normalizeRecord, validateSet } from '../../lib/contracts/content';

/** Shared conformance check: use for mock and every future adapter. */
export async function expectAdapterContract(adapter: ContentAdapter) {
  const records = await adapter.listCandidates();
  expect(records.length).toBeGreaterThan(0);
  expect(validateSet(records)).toEqual(records);
  for (const record of records) {
    expect(normalizeRecord(record)).toEqual(record);
    expect(contentHash({ ...record, source: { provider: 'mock', sourceId: 'contract-provenance' } })).toBe(record.contentHash);
  }
  return records;
}
