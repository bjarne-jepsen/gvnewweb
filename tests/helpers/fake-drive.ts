import { DriveAccessError, FOLDER, PDF, SHORTCUT, type DriveItem, type DriveSource } from '../../lib/sync/drive';

type Stored = DriveItem & { parent: string; bytes?: Uint8Array };
export const pdfBytes = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF\n`);

/** In-memory Drive with the same contract as GoogleReadClient. Failure switches mirror
 * the real cases: a failing listing, a 404/no access, and a broken download. */
export class FakeDrive implements DriveSource {
  readonly files = new Map<string, Stored>();
  readonly failList = new Set<string>(); readonly denied = new Set<string>(); readonly failDownload = new Set<string>();
  private add(item: Omit<Stored, 'modifiedTime' | 'trashed'> & Partial<Stored>) {
    this.files.set(item.id, { modifiedTime: '2026-10-21T08:00:00Z', trashed: false, ...item }); return item.id;
  }
  folder(id: string, name: string, parent: string) { return this.add({ id, name, parent, mimeType: FOLDER }); }
  pdf(id: string, name: string, parent: string, bytes = pdfBytes(id), modifiedTime?: string) {
    return this.add({ id, name, parent, mimeType: PDF, bytes, size: String(bytes.length), ...(modifiedTime ? { modifiedTime } : {}) });
  }
  file(id: string, name: string, parent: string, mimeType: string) { return this.add({ id, name, parent, mimeType }); }
  shortcut(id: string, name: string, parent: string, targetId: string, targetMimeType = PDF) {
    return this.add({ id, name, parent, mimeType: SHORTCUT, shortcutDetails: { targetId, targetMimeType } });
  }
  update(id: string, patch: Partial<Stored>) {
    const f = this.files.get(id)!; const next = { ...f, ...patch };
    if (patch.bytes) next.size = String(patch.bytes.length);
    this.files.set(id, next);
  }
  private public(f: Stored): DriveItem { const { parent: _p, bytes: _b, ...item } = f; return structuredClone(item); }
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
