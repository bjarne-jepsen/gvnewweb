// Explicit fixture maintenance only. Never run as part of build or dev.
import { mkdir, writeFile } from 'node:fs/promises';
import { digest, sealRecord } from '../lib/contracts/content';
import { realisticGuides } from './mock-guides';
const json = (path: string, data: unknown) => writeFile(path, JSON.stringify(data, null, 2) + '\n');
function pdf(label: string) {
  const stream = `BT /F1 18 Tf 50 760 Td (${label}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let body = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(body)); body += `${i+1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
await mkdir('fixtures/assets/source', { recursive: true });
const base = (id: string, title: string, visibility = 'public') => ({ schemaVersion: 1, id, title, summary: 'Illustrativt indhold til den lokale prototype.', slug: id, category: 'Foreningen', visibility, updatedAt: '2026-10-20T08:00:00Z', source: { provider: 'mock', sourceId: `internal-${id}` } });
const documents = [];
for (const [id, title, visibility] of [['doc-eksempel', 'Eksempeldokument', 'public'], ['doc-medlem', 'MEMBERS_ONLY_CANARY', 'members'], ['doc-bestyrelse', 'BOARD_ONLY_CANARY', 'board']]) {
  const bytes = pdf(`${title} - MOCK DATA ONLY`), name = `${id}.pdf`;
  await writeFile(`fixtures/assets/source/${name}`, bytes);
  documents.push(sealRecord({ ...base(id!, title!, visibility!), type: 'document', documentKind: 'vejledning', file: { assetPath: `source/${name}`, assetHash: digest(bytes), sizeBytes: bytes.length, mimeType: 'application/pdf', originalFilename: name } }));
}
const guides = [sealRecord({ ...base('guide-dokumenter', 'Find foreningens dokumenter'), type: 'guide', bodyMarkdown: '## Find det, du skal bruge\n\nHer samles dokumenter og vejledninger fra foreningen. Indholdet på denne side er et eksempel.\n\n- Åbn dokumentoversigten.\n- Vælg dokumentet, du vil læse.\n- Hent en PDF, som du kan gemme.\n\n## Om prototypen\n\nDokumentet nedenfor er en prøvefil og indeholder ingen gældende regler.', relatedDocumentIds: ['doc-eksempel'] })];
const notices = [sealRecord({ ...base('notice-velkommen', 'Velkommen til prototypen'), type: 'notice', bodyMarkdown: 'Her afprøver vi en ny måde at samle foreningens offentlige information på. Alle tekster og dokumenter er mockdata.', priority: 'normal' }), sealRecord({ ...base('notice-kladde', 'UNAPPROVED_CANARY'), type: 'notice', bodyMarkdown: 'UNAPPROVED_BODY_CANARY', priority: 'normal' })];
const events = [sealRecord({ ...base('event-eksempel', 'Eksempel på fælles arbejdsdag'), type: 'event', startsAt: '2027-04-10T10:00:00+02:00', endsAt: '2027-04-10T13:00:00+02:00', timeZone: 'Europe/Copenhagen', locationText: 'Illustrativt arrangement — ikke en invitation' })];
guides.push(...realisticGuides);
for (const [name, records] of Object.entries({ documents, guides, notices, events })) await json(`fixtures/candidates/${name}.json`, records);
const { prepare } = await import('../lib/publication/store');
const manifest = [];
for (const r of [...documents, ...guides, notices[0]!, ...events]) {
  const entry = await prepare(r, 'fixtures/assets', 'fixtures/snapshots');
  if (r.visibility === 'public') manifest.push(entry);
}
await json('fixtures/manifest.json', manifest);
await json('fixtures/approvals.json', manifest.map(x => ({ ...x, approvedAt: '2026-10-20T10:30:00Z', approvedBy: 'mock-editor', decision: 'publish' })));
