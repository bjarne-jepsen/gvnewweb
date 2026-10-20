import { describe, expect, test } from 'bun:test';
import { expectAdapterContract } from './helpers/adapter-contract';
import { MockContentAdapter } from '../lib/adapters/mock';
import { canonical, contentHash, normalizeRecord, sealRecord, validateSet } from '../lib/contracts/content';

const records = await new MockContentAdapter().listCandidates();
const guide = records.find(r => r.type === 'guide')!;
describe('fælles adapterkontrakt', () => {
  test('alle fire typer og tre synlighedsklasser', async () => {
    await expectAdapterContract(new MockContentAdapter());
    expect(new Set(records.map(r => r.type)).size).toBe(4);
    expect(new Set(records.map(r => r.visibility)).size).toBe(3);
    records.forEach(r => expect(normalizeRecord(r)).toEqual(r));
  });
  test('kanonisk hash er uafhængig af nøgleorden og provenance', () => {
    expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
    expect(contentHash({ ...guide, source: { provider: 'google', sourceId: 'another' } })).toBe(guide.contentHash);
    expect(contentHash({ ...guide, title: 'Ændret' })).not.toBe(guide.contentHash);
  });
  test('normaliserer linjeskift og tidszoneoffset', () => {
    const a = sealRecord({ ...guide, summary: 'a\r\nb', updatedAt: '2026-10-20T10:00:00+02:00' });
    const b = sealRecord({ ...guide, summary: 'a\nb', updatedAt: '2026-10-20T08:00:00Z' });
    expect(a.contentHash).toBe(b.contentHash);
  });
  test.each([
    { schemaVersion: 2 }, { visibility: 'unknown' }, { slug: '../private' },
    { updatedAt: '2026-02-30T10:00:00Z' }, { guests: ['private@example.test'] },
    { bodyMarkdown: '<script>alert(1)</script>' }, { bodyMarkdown: '[klik](javascript:alert)' },
  ])('afviser ugyldig record: %j', patch => expect(() => sealRecord({ ...guide, ...patch })).toThrow());
  test('dubletter og ugyldige dokumentreferencer afvises', () => {
    expect(() => validateSet([...records, guide])).toThrow('dubleret');
    expect(() => validateSet([guide])).toThrow('mangler');
  });
  test('kalender og publiceringsperiode skal have korrekt rækkefølge', () => {
    const event = records.find(r => r.type === 'event')!;
    expect(() => sealRecord({ ...event, endsAt: '2026-01-01T00:00:00Z' })).toThrow();
    const notice = records.find(r => r.type === 'notice')!;
    expect(() => sealRecord({ ...notice, publishFrom: '2026-12-01T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z' })).toThrow();
  });
});
