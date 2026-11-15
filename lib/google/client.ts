import { z } from 'zod';
import { DriveAccessError, driveIdSchema, driveItemSchema, type DriveItem, type DriveSource } from '../sync/drive';

export class GoogleHttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const itemFields = 'id,name,mimeType,modifiedTime,trashed,size,sha256Checksum,shortcutDetails(targetId,targetMimeType)';
const listSchema = z.object({ files: z.array(driveItemSchema), nextPageToken: z.string().min(1).optional(), incompleteSearch: z.boolean().optional() });
export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);
function assertGoogleImage(uri: string) {
  const url = new URL(uri);
  const googleImage = url.hostname.endsWith('.googleusercontent.com') || (url.hostname === 'docs.google.com' && url.pathname.startsWith('/docs-images-rt/'));
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !googleImage) throw new Error('Google: billed-URL er ikke en tilladt Google-billedkilde');
}

/** Fixed Google endpoints and GET only: read-only listing, metadata, Docs and images. */
export class GoogleReadClient implements DriveSource {
  constructor(private token: string, private transport: HttpFetch = (url, init) => fetch(url, init)) {
    if (!token || /\s/.test(token)) throw new Error('Google: ugyldigt eller manglende adgangstoken');
  }
  private async get(url: string, limit: number, authenticated = true): Promise<Uint8Array> {
    let response = await this.send(url, authenticated);
    // Docs image URLs answer with a redirect to the actual image. Each hop is followed by hand and
    // must stay on a Google image host; API calls (with the token) never follow redirects.
    for (let hop = 0; !authenticated && isRedirect(response.status); hop++) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (hop >= 3 || !location) throw new Error('Google: billedet kunne ikke hentes (for mange eller ugyldige omdirigeringer)');
      const next = new URL(location, url).href;
      assertGoogleImage(next);
      response = await this.send(url = next, false);
    }
    if (!response.ok) {
      // Neither the response body nor the token is ever part of an error.
      await response.body?.cancel();
      throw new GoogleHttpError(response.status, `Google: HTTP ${response.status}; kontrollér adgang og token`);
    }
    if (Number(response.headers.get('content-length') ?? 0) > limit) { await response.body?.cancel(); throw new Error('Google: svaret overskrider størrelsesgrænsen'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Google: tomt svar');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error('Google: svaret overskrider størrelsesgrænsen'); }
        chunks.push(value);
      }
    } catch { throw new Error('Google: afbrudt eller for stort svar'); }
    return Buffer.concat(chunks);
  }
  private async send(url: string, authenticated: boolean): Promise<Response> {
    try {
      return await this.transport(url, { method: 'GET', headers: authenticated ? { Authorization: `Bearer ${this.token}` } : {}, redirect: authenticated ? 'error' : 'manual', cache: 'no-store', signal: AbortSignal.timeout(authenticated ? 15000 : 30000) });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new Error(timeout ? 'Google: timeout; Google svarede ikke i tide' : 'Google: netværksfejl eller timeout');
    }
  }
  private async json(url: string): Promise<unknown> {
    const bytes = await this.get(url, 2 * 1024 * 1024);
    try { return JSON.parse(Buffer.from(bytes).toString('utf8')); }
    catch { throw new Error('Google: ugyldigt JSON-svar'); }
  }
  private async access<T>(call: () => Promise<T>): Promise<T> {
    try { return await call(); }
    catch (error) {
      if (error instanceof GoogleHttpError && error.status === 404) throw new DriveAccessError('Google: filen findes ikke, eller synkroniseringskontoen har ikke adgang');
      if (error instanceof z.ZodError) throw new Error('Google: ugyldigt svar fra Drive');
      throw error;
    }
  }
  async listFolder(folderId: string): Promise<DriveItem[]> {
    driveIdSchema.parse(folderId);
    const items = new Map<string, DriveItem>(), tokens = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < 100; page++) {
      // The ID is validated above, so it cannot break out of the quoted query value.
      const query = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false`, fields: `nextPageToken,incompleteSearch,files(${itemFields})`,
        pageSize: '1000', corpora: 'allDrives', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(pageToken ? { pageToken } : {}) });
      const result = await this.access(async () => listSchema.parse(await this.json(`https://www.googleapis.com/drive/v3/files?${query}`)));
      if (result.incompleteSearch) throw new Error('Google: Drive returnerede en ufuldstændig mappelistning');
      for (const item of result.files) items.set(item.id, item);
      if (!result.nextPageToken) return [...items.values()];
      if (tokens.has(result.nextPageToken)) throw new Error('Google: mappelistningen gentager en side');
      tokens.add(pageToken = result.nextPageToken);
    }
    throw new Error('Google: mappelistningen har for mange sider');
  }
  async getFile(fileId: string) {
    driveIdSchema.parse(fileId);
    const query = new URLSearchParams({ supportsAllDrives: 'true', fields: itemFields });
    const item = await this.access(async () => driveItemSchema.parse(await this.json(`https://www.googleapis.com/drive/v3/files/${fileId}?${query}`)));
    if (item.id !== fileId) throw new Error('Google: forkert fil i svaret');
    return item;
  }
  async readDocument(fileId: string) {
    driveIdSchema.parse(fileId);
    // Unaccepted suggestions must never reach the website; this mode is the accepted text only.
    const query = new URLSearchParams({ includeTabsContent: 'true', suggestionsViewMode: 'PREVIEW_WITHOUT_SUGGESTIONS' });
    return this.access(() => this.json(`https://docs.googleapis.com/v1/documents/${fileId}?${query}`));
  }
  async downloadImage(uri: string) {
    assertGoogleImage(uri);
    // Ephemeral image URLs from Docs are fetched without forwarding the API bearer token.
    return this.get(uri, 5 * 1024 * 1024, false);
  }
}
