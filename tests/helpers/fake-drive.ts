import { DriveAccessError, FOLDER, GDOC, PDF, SHORTCUT, type DriveItem, type DriveSource } from '../../lib/sync/drive';

type Stored = DriveItem & { parent: string; bytes?: Uint8Array; doc?: unknown };
export const pdfBytes = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF\n`);
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aiv8AAAAASUVORK5CYII=', 'base64');
type Para = { text: string; style?: string; bold?: boolean; href?: string; bullet?: boolean; image?: string };
/** A minimal Docs API response (PREVIEW_WITHOUT_SUGGESTIONS) built from simple paragraphs. */
export function docJson(id: string, paragraphs: Para[], images: Record<string, { uri: string; alt?: string }> = {}) {
  return {
    documentId: id, title: `intern titel ${id}`, suggestionsViewMode: 'PREVIEW_WITHOUT_SUGGESTIONS',
    tabs: [{ tabProperties: { tabId: 't.0', title: 'Fane 1' }, documentTab: {
      body: { content: [{ sectionBreak: {} }, ...paragraphs.map(p => ({ paragraph: {
        ...(p.style ? { paragraphStyle: { namedStyleType: p.style } } : {}), ...(p.bullet ? { bullet: { listId: 'kix.1' } } : {}),
        elements: p.image ? [{ inlineObjectElement: { inlineObjectId: p.image } }, { textRun: { content: '\n' } }]
          : [{ textRun: { content: `${p.text}\n`, textStyle: { ...(p.bold ? { bold: true } : {}), ...(p.href ? { link: { url: p.href } } : {}) } } }],
      } }))] },
      lists: { 'kix.1': { listProperties: { nestingLevels: [{ glyphSymbol: '●' }] } } },
      inlineObjects: Object.fromEntries(Object.entries(images).map(([key, img]) => [key, { inlineObjectProperties: { embeddedObject: {
        ...(img.alt ? { description: img.alt } : {}), imageProperties: { contentUri: img.uri } } } }])),
    } }],
  };
}

/** In-memory Drive with the same contract as GoogleReadClient. Failure switches mirror
 * the real cases: a failing listing, a 404/no access, and a broken download. */
export class FakeDrive implements DriveSource {
  readonly files = new Map<string, Stored>();
  readonly failList = new Set<string>(); readonly denied = new Set<string>(); readonly failDownload = new Set<string>();
  readonly images = new Map<string, Uint8Array>();
  private add(item: Omit<Stored, 'modifiedTime' | 'trashed'> & Partial<Stored>) {
    this.files.set(item.id, { modifiedTime: '2026-10-21T08:00:00Z', trashed: false, ...item }); return item.id;
  }
  folder(id: string, name: string, parent: string) { return this.add({ id, name, parent, mimeType: FOLDER }); }
  pdf(id: string, name: string, parent: string, bytes = pdfBytes(id), modifiedTime?: string) {
    return this.add({ id, name, parent, mimeType: PDF, bytes, size: String(bytes.length), ...(modifiedTime ? { modifiedTime } : {}) });
  }
  file(id: string, name: string, parent: string, mimeType: string) { return this.add({ id, name, parent, mimeType }); }
  gdoc(id: string, name: string, parent: string, doc: unknown) { return this.add({ id, name, parent, mimeType: GDOC, doc }); }
  shortcut(id: string, name: string, parent: string, targetId: string, targetMimeType = PDF) {
    return this.add({ id, name, parent, mimeType: SHORTCUT, shortcutDetails: { targetId, targetMimeType } });
  }
  update(id: string, patch: Partial<Stored>) {
    const f = this.files.get(id)!; const next = { ...f, ...patch };
    if (patch.bytes) next.size = String(patch.bytes.length);
    this.files.set(id, next);
  }
  private public(f: Stored): DriveItem { const { parent: _p, bytes: _b, doc: _d, ...item } = f; return structuredClone(item); }
  async readDocument(fileId: string) {
    const f = this.files.get(fileId);
    if (!f || this.denied.has(fileId)) throw new DriveAccessError('Google: ingen adgang');
    if (this.failDownload.has(fileId)) throw new Error('Google: netværksfejl eller timeout');
    if (f.doc === undefined) throw new Error('Google Docs: ikke et dokument');
    return structuredClone(f.doc);
  }
  async downloadImage(uri: string) {
    const bytes = this.images.get(uri);
    if (!bytes) throw new Error('Google: billedet kunne ikke hentes');
    return Buffer.from(bytes);
  }
  async listFolder(folderId: string) {
    if (this.failList.has(folderId)) throw new Error('Google: HTTP 500');
    return [...this.files.values()].filter(f => f.parent === folderId && !f.trashed).map(f => this.public(f));
  }
  async getFile(fileId: string) {
    const f = this.files.get(fileId);
    if (!f || this.denied.has(fileId)) throw new DriveAccessError('Google: filen findes ikke, eller synkroniseringskontoen har ikke adgang');
    return this.public(f);
  }
  async downloadPdf(fileId: string) {
    const f = this.files.get(fileId);
    if (!f || this.denied.has(fileId)) throw new DriveAccessError('Google: ingen adgang');
    if (this.failDownload.has(fileId)) throw new Error('Google: netværksfejl eller timeout');
    if (!f.bytes) throw new Error('Google: ikke en binær fil');
    return Buffer.from(f.bytes);
  }
}
