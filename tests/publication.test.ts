import { rejects } from 'node:assert/strict';
import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MockContentAdapter } from '../lib/adapters/mock';
import { sealRecord, digest } from '../lib/contracts/content';
import { prepare, selectPublic, snapshotDirectory, resolveManifest } from '../lib/publication/store';

const records = await new MockContentAdapter().listCandidates();
const manifest = JSON.parse(await readFile('fixtures/manifest.json', 'utf8'));
const approvals = JSON.parse(await readFile('fixtures/approvals.json', 'utf8'));
const at = new Date(Math.max(Date.parse('2026-10-20T12:00:00Z'), ...approvals.map((a: {approvedAt: string}) => Date.parse(a.approvedAt)))).toISOString();
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function temp() { const root = await mkdtemp(join(tmpdir(), 'gv-pub-')); roots.push(root); return root; }
const publish = (contentId: string, approvedHash: string, decision = 'publish') => ({ contentId, approvedHash, approvedAt: at, approvedBy: 'test-editor', decision });

test('kun godkendte offentlige snapshots, uden interne felter', async () => {
  const result = await selectPublic(manifest, approvals, 'fixtures/snapshots', at);
  expect(result.records.length).toBe(12); expect(result.assets.size).toBe(3);
  expect(JSON.stringify(result.records)).not.toMatch(/sourceId|assetPath|CANARY|mock-editor/);
});
test('ændret candidate bevarer offentlig tekst og download; ny godkendelse opdaterer begge', async () => {
  const root = await temp(); const doc = records.find(r => r.type === 'document' && r.visibility === 'public')!;
  if (doc.type !== 'document') throw new Error();
  const first = await prepare(doc, 'fixtures/assets', root);
  const before = await selectPublic([first], [publish(doc.id, doc.contentHash)], root, at);
  const bytes = Buffer.concat([await readFile(`fixtures/assets/${doc.file.assetPath}`), Buffer.from('\n% version 2\n')]);
  await mkdir(join(root, 'source')); await writeFile(join(root, 'source', 'new.pdf'), bytes);
  const next = sealRecord({ ...doc, title: 'Ny version', file: { ...doc.file, assetPath: 'source/new.pdf', assetHash: digest(bytes), sizeBytes: bytes.length } });
  const second = await prepare(next, root, root);
  const unchanged = await selectPublic([first], [publish(doc.id, doc.contentHash)], root, at);
  expect(unchanged).toEqual(before);
  expect(next.contentHash).not.toBe(doc.contentHash);
  await rejects(selectPublic([second], [publish(doc.id, doc.contentHash)], root, at), /præcis/);
  const updated = await selectPublic([second], [publish(doc.id, next.contentHash)], root, at);
  expect(updated.records[0]!.title).toBe('Ny version');
  expect([...updated.assets.values()][0]).toEqual(bytes);
});
test('tilbagekaldelse fjerner side og asset, uden fallback', async () => {
  const doc = manifest[0];
  const selected = await selectPublic([doc], [...approvals, publish(doc.contentId, doc.approvedHash, 'withdraw')], 'fixtures/snapshots', at);
  expect(selected.records).toEqual([]); expect(selected.assets.size).toBe(0);
});
test('asset- og snapshot-manipulation stopper publicering', async () => {
  const root = await temp(); const doc = records.find(r => r.type === 'document')!;
  const entry = await prepare(doc, 'fixtures/assets', root);
  const dir = snapshotDirectory(root, doc.id, doc.contentHash);
  await writeFile(join(dir, 'document.pdf'), 'changed');
  await rejects(selectPublic([entry], [publish(doc.id, doc.contentHash)], root, at), /bytes/);
  await rejects(prepare(doc, 'fixtures/assets', root), /bytes/);
  await writeFile(join(dir, 'record.json'), JSON.stringify({ ...doc, title: 'Changed' }));
  await rejects(selectPublic([entry], [publish(doc.id, doc.contentHash)], root, at), /contentHash/);
});
test('private godkendelser og private dokumentrelationer afvises', async () => {
  const root = await temp(); const privateDoc = records.find(r => r.visibility === 'members')!;
  const entry = await prepare(privateDoc, 'fixtures/assets', root);
  await rejects(selectPublic([entry], [publish(privateDoc.id, privateDoc.contentHash)], root, at), /ikke public/);
  const guide = records.find(r => r.type === 'guide')!;
  const changed = sealRecord({ ...guide, relatedDocumentIds: [privateDoc.id] });
  const g = await prepare(changed, 'fixtures/assets', root);
  await rejects(selectPublic([g], [publish(g.contentId, g.approvedHash)], root, at), /mangler/);
});
test('manglende snapshot, godkendelse, dubletter og tvetydige beslutninger stopper release', async () => {
  await rejects(selectPublic(manifest, [], 'fixtures/snapshots', at), /godkendelse/);
  await rejects(selectPublic(manifest, approvals, await temp(), at));
  expect(() => resolveManifest([...manifest, manifest[0]], approvals, at)).toThrow('Dubleret');
  expect(() => resolveManifest(manifest, [...approvals, approvals[0]], at)).toThrow('tvetydige');
});
test('notice-perioder bruger ét buildAt og eksklusivt expiresAt', async () => {
  const root = await temp(); const notice = records.find(r => r.type === 'notice')!;
  const expiresAt = new Date(Date.parse(at) + 86400000).toISOString();
  const n = sealRecord({ ...notice, publishFrom: at, expiresAt });
  const entry = await prepare(n, 'fixtures/assets', root);
  const approved = [{ ...publish(n.id, n.contentHash), approvedAt: new Date(Date.parse(at) - 7200000).toISOString() }];
  expect((await selectPublic([entry], approved, root, new Date(Date.parse(at) - 3600000).toISOString())).records).toHaveLength(0);
  expect((await selectPublic([entry], approved, root, at)).records).toHaveLength(1);
  expect((await selectPublic([entry], approved, root, n.type === 'notice' ? n.expiresAt! : at)).records).toHaveLength(0);
});
