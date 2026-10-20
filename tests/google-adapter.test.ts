import { afterEach, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { readFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest } from '../lib/contracts/content';
import { GoogleContentAdapter } from '../lib/adapters/google';
import { GoogleReadClient, type FileMetadata, type GoogleReader } from '../lib/adapters/google/client';
import { googleDocsBlocks } from '../lib/adapters/google/blocks';
import { prepare, selectPublic } from '../lib/publication/store';
import { expectAdapterContract } from './helpers/adapter-contract';
const raw = JSON.parse(await readFile('tests/fixtures/google-document.json', 'utf8'));
const bytes = await readFile('fixtures/assets/source/doc-eksempel.pdf');
const config = {
  guide: { id: 'guide-test', slug: 'test', summary: 'Pilotguide', category: 'Foreningen', visibility: 'public', googleFileId: 'test-doc-id' },
  document: { id: 'doc-test', slug: 'test', title: 'Pilotbilag', summary: 'Pilot-PDF', category: 'Foreningen', visibility: 'public', googleFileId: 'test-pdf-id', documentKind: 'vejledning', originalFilename: 'pilot.pdf' },
};
const metadata = (id: string): FileMetadata => ({ id, mimeType: id === 'test-doc-id' ? 'application/vnd.google-apps.document' : 'application/pdf', modifiedTime: '2026-10-20T08:00:00Z', version: '4', trashed: false,
  ...(id === 'test-pdf-id' ? { size: String(bytes.length), sha256Checksum: digest(bytes).slice(7) } : {}) });
function fake(patch: Partial<GoogleReader> = {}): GoogleReader { return { metadata: async id => metadata(id), document: async () => structuredClone(raw), pdf: async () => bytes, image: async () => { throw new Error('Ukendt billede'); }, ...patch }; }
const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), 'gv-google-')); roots.push(path); return path; }
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });

test('Google og mock bruger samme adapterkontrakt; PDF fastholdes og rådata lækker ikke', async () => {
  const dir = await root();
  const records = await expectAdapterContract(new GoogleContentAdapter(config, fake(), dir));
  expect(records.map(r => r.type)).toEqual(['document', 'guide']);
  const snapshots = join(dir, 'snapshots');
  const manifest = await Promise.all(records.map(r => prepare(r, dir, snapshots)));
  const approvals = manifest.map(m => ({ ...m, approvedBy: 'test-editor', approvedAt: '2026-10-20T10:00:00Z', decision: 'publish' }));
  const selected = await selectPublic(manifest, approvals, snapshots, '2026-10-20T12:00:00Z');
  expect([...selected.assets.values()][0]).toEqual(bytes);
  expect(JSON.stringify(selected.records)).not.toMatch(/googleFileId|sourceId|sourceRevision|documentStyle|tabProperties/);
  const guide = records.find(r => r.type === 'guide')!;
  if (guide.type !== 'guide') throw new Error();
  expect(guide.schemaVersion).toBe(2);
  expect(guide.bodyBlocks?.some(b => b.type === 'list' && b.items.length === 2)).toBe(true);
  expect(JSON.stringify(guide.bodyBlocks)).toContain('https://example.test/vejledning');
});
test('ændret Google-kilde giver ny candidate, men ændrer ikke eksisterende godkendt snapshot', async () => {
  const dir = await root(); const snapshots = join(dir, 'snapshots');
  const records = await new GoogleContentAdapter(config, fake(), dir).listCandidates();
  const manifest = await Promise.all(records.map(r => prepare(r, dir, snapshots)));
  const approvals = manifest.map(m => ({ ...m, approvedBy: 'editor', approvedAt: '2026-10-20T10:00:00Z', decision: 'publish' }));
  const before = await selectPublic(manifest, approvals, snapshots, '2026-10-20T12:00:00Z');
  const next = structuredClone(raw); next.title = 'Ny kildeudgave';
  const changed = await new GoogleContentAdapter(config, fake({ document: async () => next }), dir).listCandidates();
  expect(changed[1]!.contentHash).not.toBe(records[1]!.contentHash);
  const candidate = await prepare(changed[1]!, dir, snapshots);
  await rejects(selectPublic([manifest[0], candidate], approvals, snapshots, '2026-10-20T12:00:00Z'), /præcis godkendelse/);
  expect(await selectPublic(manifest, approvals, snapshots, '2026-10-20T12:00:00Z')).toEqual(before);
});
test.each(['test-doc-id', 'test-pdf-id'])('ændring under hentning af %s afviser hele importen før assets skrives', async id => {
  const dir = await root(); const calls = new Map<string, number>();
  const client = fake({ metadata: async fileId => { const count = (calls.get(fileId) ?? 0) + 1; calls.set(fileId, count); return { ...metadata(fileId), version: fileId === id && count > 1 ? '5' : '4' }; } });
  await rejects(new GoogleContentAdapter(config, client, dir).listCandidates(), /ændret under hentning/);
  expect(await readdir(dir)).toEqual([]);
});
test.each([
  { trashed: true }, { mimeType: 'application/vnd.google-apps.shortcut' }, { size: '0' }, { sha256Checksum: '0'.repeat(64) },
])('afviser forkert PDF-metadata: %j', async patch => {
  await rejects(new GoogleContentAdapter(config, fake({ metadata: async id => ({ ...metadata(id), ...(id === 'test-pdf-id' ? patch : {}) }) }), await root()).listCandidates());
});
test('konfiguration kræver eksplicit public og særskilte kilder', async () => {
  const dir = await root();
  expect(() => new GoogleContentAdapter({ ...config, guide: { ...config.guide, visibility: 'members' } }, fake(), dir)).toThrow();
  expect(() => new GoogleContentAdapter({ ...config, guide: { ...config.guide, googleFileId: config.document.googleFileId } }, fake(), dir)).toThrow();
});
test('viser ikke HTTP-fejlsvar, token eller rå netværksfejl', async () => {
  const secret = 'SENSITIVE_TOKEN_CANARY';
  for (const status of [401, 403, 404, 429, 500]) {
    const client = new GoogleReadClient(secret, async (_url, init) => {
      expect(init.method).toBe('GET'); expect(init.redirect).toBe('error');
      expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${secret}`);
      return new Response(`private body ${secret}`, { status });
    });
    await rejects(client.document('test-doc-id'), error => { expect(String(error)).toContain(`HTTP ${status}`); expect(String(error)).not.toContain(secret); expect(String(error)).not.toContain('private body'); return true; });
  }
  await rejects(new GoogleReadClient(secret, async () => { throw new Error(secret); }).pdf('test-pdf-id'), /netværksfejl/);
});
test('HTTP-klienten begrænser endpoints, fil-IDer, faner og forslag', async () => {
  const client = new GoogleReadClient('test-token', async (url, init) => {
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://docs.googleapis.com'); expect(parsed.searchParams.get('includeTabsContent')).toBe('true'); expect(parsed.searchParams.get('suggestionsViewMode')).toBe('SUGGESTIONS_INLINE');
    expect(init.cache).toBe('no-store');
    return Response.json(raw);
  });
  expect(await client.document('test-doc-id')).toEqual(raw);
  await rejects(client.document('https://other.test/'));
});
test('HTTP-klienten afviser ugyldigt JSON, forkert metadata og for store svar', async () => {
  await rejects(new GoogleReadClient('test', async () => new Response('not json')).document('test-doc-id'), /JSON/);
  await rejects(new GoogleReadClient('test', async () => Response.json({ ...metadata('wrong') })).metadata('test-doc-id'), /forkert fil/);
  await rejects(new GoogleReadClient('test', async () => new Response('x', { headers: { 'content-length': String(21 * 1024 * 1024) } })).pdf('test-pdf-id'), /størrelsesgrænse/);
});
test.each(['malformedTable', 'tabs', 'suggestions', 'inlineObject', 'numberedList', 'unsafeLink', 'headers'])('Docs afviser ikke-understøttet indhold: %s', async kind => {
  const doc = structuredClone(raw); const tab = doc.tabs[0].documentTab;
  if (kind === 'malformedTable') tab.body.content.push({ table: { rows: 1 } });
  if (kind === 'tabs') doc.tabs.push(structuredClone(doc.tabs[0]));
  if (kind === 'suggestions') tab.body.content[1].paragraph.elements[0].textRun.suggestedInsertionIds = ['suggestion-id'];
  if (kind === 'inlineObject') tab.body.content[1].paragraph.elements.push({ inlineObjectElement: { inlineObjectId: 'private-image' } });
  if (kind === 'numberedList') tab.lists['kix.1'].listProperties.nestingLevels[0].glyphType = 'DECIMAL';
  if (kind === 'unsafeLink') tab.body.content[5].paragraph.elements[0].textRun.textStyle.link.url = 'javascript:alert(1)';
  if (kind === 'headers') tab.headers = { private: { content: [] } };
  await rejects(googleDocsBlocks(doc, 'test-doc-id', async () => { throw new Error('Billede mangler'); }));
});

test('billedhentning videresender aldrig API-token og afviser andre værter', async () => {
  const client = new GoogleReadClient('secret', async (_url, init) => {
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(init.redirect).toBe('error'); return new Response('image-bytes');
  });
  await client.image('https://docs.google.com/docs-images-rt/test');
  for (const uri of ['http://docs.google.com/docs-images-rt/test','https://example.test/test','https://lh3.googleusercontent.com.evil.test/x','https://docs.google.com/other','https://localhost/x']) await rejects(client.image(uri));
});

test('Google v2 bevarer tabelceller og fastfryser billeder; ændring og tilbagekaldelse er versionsbundet', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aiv8AAAAASUVORK5CYII=', 'base64');
  const doc = structuredClone(raw), tab = doc.tabs[0].documentTab;
  tab.body.content.push({ table: { tableRows: [{ tableCells: ['Kolonne A','Kolonne B'].map(text => ({ tableCellStyle: {rowSpan:1,columnSpan:1}, content: [{paragraph:{elements:[{textRun:{content:text+'\n'}}]}}] })) }] } });
  tab.inlineObjects = { image: { inlineObjectProperties: { embeddedObject: { description: 'Et prøvebillede', imageProperties: {contentUri:'https://docs.google.com/docs-images-rt/test'} } } } };
  tab.body.content.push({paragraph:{elements:[{inlineObjectElement:{inlineObjectId:'image'}},{textRun:{content:'\n'}}]}});
  const dir = await root(), snapshots = join(dir, 'snapshots');
  const client = fake({ document: async () => doc, image: async () => png });
  const records = await expectAdapterContract(new GoogleContentAdapter(config, client, dir));
  const manifest = await Promise.all(records.map(r => prepare(r, dir, snapshots)));
  const approvals = manifest.map(m => ({ ...m, approvedBy: 'test-editor', approvedAt: '2026-10-20T10:00:00Z', decision: 'publish' }));
  const selected = await selectPublic(manifest, approvals, snapshots, '2026-10-20T12:00:00Z');
  expect(selected.assets.size).toBe(2);
  expect(JSON.stringify(selected.records)).not.toMatch(/assetPath|contentUri|docs-images-rt|inlineObjectId/);
  const guide = selected.records.find(r=>r.type==='guide')!;
  if (guide.type !== 'guide' || !guide.bodyBlocks) throw new Error();
  const { renderBlocks } = await import('../lib/site/blocks');
  const html = renderBlocks(guide.bodyBlocks);
  expect(html).toContain('<table>'); expect(html).toContain('Kolonne A'); expect(html).toContain('Kolonne B');
  expect(html).toContain('alt="Et prøvebillede"'); expect(html).not.toContain('docs.google.com');
  const changed = await new GoogleContentAdapter(config, fake({document:async()=>doc,image:async()=>Buffer.concat([png,Buffer.from('changed')])}), dir).listCandidates();
  expect(changed[1]!.contentHash).not.toBe(records[1]!.contentHash);
  expect(await selectPublic(manifest, approvals, snapshots, '2026-10-20T12:00:00Z')).toEqual(selected);
  const withdrawn = await selectPublic(manifest, [...approvals, {...manifest[1],approvedBy:'test-editor',approvedAt:'2026-10-20T11:00:00Z',decision:'withdraw'}], snapshots, '2026-10-20T12:00:00Z');
  expect(withdrawn.records).toHaveLength(1); expect(withdrawn.assets.size).toBe(1);
  const { recordAssets } = await import('../lib/publication/assets');
  const { snapshotDirectory } = await import('../lib/publication/store');
  const image = recordAssets(records[1]!)[0]!;
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(snapshotDirectory(snapshots, records[1]!.id, records[1]!.contentHash), image.snapshotPath), 'tampered');
  await rejects(selectPublic(manifest, approvals, snapshots, '2026-10-20T12:00:00Z'), /bytes/);
});
