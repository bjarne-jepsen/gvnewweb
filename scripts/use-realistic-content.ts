// Explicit local fixture update; never invoked by normal build/dev.
import { readFile, writeFile } from 'node:fs/promises';
import { realisticGuides } from './mock-guides';
import { prepare } from '../lib/publication/store';

const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const save = (path: string, data: unknown) => writeFile(path, JSON.stringify(data, null, 2) + '\n');
const guides = await json('fixtures/candidates/guides.json');
const manifest = await json('fixtures/manifest.json');
const approvals = await json('fixtures/approvals.json');
for (const record of realisticGuides) {
  const index = guides.findIndex((r: {id: string}) => r.id === record.id);
  if (index < 0) guides.push(record); else guides[index] = record;
  const entry = await prepare(record, 'fixtures/assets', 'fixtures/snapshots');
  const selectedIndex = manifest.findIndex((r: {contentId: string}) => r.contentId === record.id);
  if (selectedIndex < 0) manifest.push(entry); else manifest[selectedIndex] = entry;
  if (!approvals.some((a: {contentId: string; approvedHash: string}) => a.contentId === record.id && a.approvedHash === record.contentHash)) {
    approvals.push({ ...entry, approvedAt: '2026-10-20T10:30:00Z', approvedBy: 'mock-editor-realistic-fixtures', decision: 'publish' });
  }
}
await save('fixtures/candidates/guides.json', guides);
await save('fixtures/manifest.json', manifest);
await save('fixtures/approvals.json', approvals);
console.log(`Tilføjet ${realisticGuides.length} kildebaserede mockvejledninger med versionsbundne prøvegodkendelser.`);
