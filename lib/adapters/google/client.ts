import { z } from 'zod';

export const googleIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(200);
const metadataSchema = z.object({
  id: googleIdSchema, mimeType: z.string(), modifiedTime: z.iso.datetime({ offset: true }),
  version: z.string().regex(/^\d+$/), trashed: z.boolean(),
  size: z.string().regex(/^\d+$/).optional(), sha256Checksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type FileMetadata = z.infer<typeof metadataSchema>;
export interface GoogleReader {
  metadata(id: string): Promise<FileMetadata>;
  document(id: string): Promise<unknown>;
  pdf(id: string): Promise<Uint8Array>;
  image(uri: string): Promise<Uint8Array>;
}
export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Fixed Google endpoints and GET only. No Drive listing or write APIs. */
export class GoogleReadClient implements GoogleReader {
  constructor(private token: string, private transport: HttpFetch = (url, init) => fetch(url, init)) {
    if (!token || /\s/.test(token)) throw new Error('Google: ugyldigt eller manglende adgangstoken');
  }
  private async get(url: string, limit: number, authenticated = true): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await this.transport(url, { method: 'GET', headers: authenticated ? { Authorization: `Bearer ${this.token}` } : {}, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    } catch { throw new Error('Google: netværksfejl eller timeout; ingen data er godkendt'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Google: HTTP ${response.status}; kontrollér adgang, token og de valgte fil-ID'er`);
    }
    if (Number(response.headers.get('content-length') ?? 0) > limit) { await response.body?.cancel(); throw new Error('Google: svar overskrider pilotens størrelsesgrænse'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Google: tomt svar');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error('Google: svar overskrider pilotens størrelsesgrænse'); }
        chunks.push(value);
      }
    } catch { throw new Error('Google: afbrudt eller for stort svar'); }
    return Buffer.concat(chunks);
  }
  private async json(url: string): Promise<unknown> {
    const bytes = await this.get(url, 2 * 1024 * 1024);
    try { return JSON.parse(Buffer.from(bytes).toString('utf8')); }
    catch { throw new Error('Google: ugyldigt JSON-svar'); }
  }
  async metadata(id: string) {
    googleIdSchema.parse(id);
    const query = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id,mimeType,modifiedTime,version,trashed,size,sha256Checksum' });
    let result: FileMetadata;
    try { result = metadataSchema.parse(await this.json(`https://www.googleapis.com/drive/v3/files/${id}?${query}`)); }
    catch (error) { if (error instanceof z.ZodError) throw new Error('Google: manglende eller ugyldige versionsmetadata'); throw error; }
    if (result.id !== id || result.trashed) throw new Error('Google: forkert fil eller fil i papirkurven');
    return result;
  }
  async document(id: string) {
    googleIdSchema.parse(id);
    const query = new URLSearchParams({ includeTabsContent: 'true', suggestionsViewMode: 'SUGGESTIONS_INLINE' });
    return this.json(`https://docs.googleapis.com/v1/documents/${id}?${query}`);
  }
  async image(uri: string) {
    const url = new URL(uri);
    const googleImage = url.hostname.endsWith('.googleusercontent.com') || (url.hostname === 'docs.google.com' && url.pathname.startsWith('/docs-images-rt/'));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !googleImage) throw new Error('Google: billed-URL er ikke en tilladt Google-billedkilde');
    // Ephemeral image URLs from Docs are fetched without forwarding the API bearer token.
    return this.get(uri, 5 * 1024 * 1024, false);
  }
  async pdf(id: string) {
    googleIdSchema.parse(id);
    return this.get(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, 20 * 1024 * 1024);
  }
}
