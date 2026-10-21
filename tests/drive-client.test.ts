import { expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { GoogleReadClient } from '../lib/google/client';
import { DriveAccessError } from '../lib/sync/drive';

const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `${id}.pdf`, mimeType: 'application/pdf', modifiedTime: '2026-10-21T08:00:00Z', trashed: false, ...extra });

test('listFolder paginerer med læseparametre for fællesdrev og sender kun GET', async () => {
  const calls: URL[] = [];
  const client = new GoogleReadClient('test-token', async (url, init) => {
    expect(init.method).toBe('GET'); expect(init.redirect).toBe('error');
    const parsed = new URL(url); calls.push(parsed);
    return Response.json(parsed.searchParams.get('pageToken') ? { files: [item('c')] } : { files: [item('a'), item('b', { mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: 't', targetMimeType: 'application/pdf' } })], nextPageToken: 'page-2' });
  });
  const items = await client.listFolder('folder_1');
  expect(items.map(i => i.id)).toEqual(['a', 'b', 'c']);
  expect(items[1]!.shortcutDetails?.targetId).toBe('t');
  expect(calls).toHaveLength(2);
  const params = calls[0]!.searchParams;
  expect(calls[0]!.origin + calls[0]!.pathname).toBe('https://www.googleapis.com/drive/v3/files');
  expect(params.get('q')).toBe(`'folder_1' in parents and trashed = false`);
  expect([params.get('corpora'), params.get('supportsAllDrives'), params.get('includeItemsFromAllDrives')]).toEqual(['allDrives', 'true', 'true']);
  expect(params.get('fields')).toContain('shortcutDetails(targetId,targetMimeType)');
  expect(calls[1]!.searchParams.get('pageToken')).toBe('page-2');
});

test('listFolder afviser ufuldstændige, gentagne og ugyldige listninger', async () => {
  await rejects(new GoogleReadClient('t', async () => Response.json({ files: [item('a')], incompleteSearch: true })).listFolder('f'), /ufuldstændig/);
  await rejects(new GoogleReadClient('t', async () => Response.json({ files: [], nextPageToken: 'same' })).listFolder('f'), /gentager/);
  await rejects(new GoogleReadClient('t', async () => Response.json({ files: [{ id: 'a' }] })).listFolder('f'), /ugyldigt svar/);
  let called = false;
  await rejects(new GoogleReadClient('t', async () => { called = true; return Response.json({ files: [] }); }).listFolder(`x' or name contains '`));
  expect(called).toBe(false);
});

test('404 bliver til DriveAccessError uden token; andre fejl afbryder', async () => {
  const secret = 'SENSITIVE_TOKEN_CANARY';
  const client = new GoogleReadClient(secret, async () => new Response(`private ${secret}`, { status: 404 }));
  for (const call of [() => client.getFile('abc'), () => client.downloadPdf('abc'), () => client.listFolder('abc')]) {
    await rejects(call(), error => { expect(error).toBeInstanceOf(DriveAccessError); expect(String(error)).not.toContain(secret); return true; });
  }
  await rejects(new GoogleReadClient(secret, async () => new Response('x', { status: 500 })).getFile('abc'), error => !(error instanceof DriveAccessError) && /HTTP 500/.test(String(error)));
});

test('readDocument henter altid uden forslag og med alle faner', async () => {
  let seen: URL | undefined;
  const client = new GoogleReadClient('t', async (url, init) => { expect(init.method).toBe('GET'); seen = new URL(url); return Response.json({ documentId: 'doc' }); });
  expect(await client.readDocument('doc')).toEqual({ documentId: 'doc' });
  expect(seen!.origin + seen!.pathname).toBe('https://docs.googleapis.com/v1/documents/doc');
  expect(seen!.searchParams.get('suggestionsViewMode')).toBe('PREVIEW_WITHOUT_SUGGESTIONS');
  expect(seen!.searchParams.get('includeTabsContent')).toBe('true');
  await rejects(new GoogleReadClient('t', async () => new Response('', { status: 404 })).readDocument('doc'), DriveAccessError);
  await rejects(client.readDocument('../x'));
});

test('readSheet henter grid data fra Sheets API med GET', async () => {
  let seen: URL | undefined;
  const client = new GoogleReadClient('t', async (url, init) => { expect(init.method).toBe('GET'); seen = new URL(url); return Response.json({ sheets: [] }); });
  expect(await client.readSheet('sheet_1')).toEqual({ sheets: [] });
  expect(seen!.origin + seen!.pathname).toBe('https://sheets.googleapis.com/v4/spreadsheets/sheet_1');
  expect(seen!.searchParams.get('includeGridData')).toBe('true');
  expect(seen!.searchParams.get('fields')).toContain('textFormatRuns');
  await rejects(new GoogleReadClient('t', async () => new Response('', { status: 404 })).readSheet('s'), DriveAccessError);
  await rejects(client.readSheet('../x'));
});

test('fejl viser hverken HTTP-svar, token eller rå netværksfejl', async () => {
  const secret = 'SENSITIVE_TOKEN_CANARY';
  for (const status of [401, 403, 404, 429, 500]) {
    const client = new GoogleReadClient(secret, async (_url, init) => {
      expect(init.method).toBe('GET'); expect(init.redirect).toBe('error'); expect(init.cache).toBe('no-store');
      expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${secret}`);
      return new Response(`private body ${secret}`, { status });
    });
    await rejects(client.readDocument('doc'), error => { expect(String(error)).not.toContain(secret); expect(String(error)).not.toContain('private body'); return true; });
  }
  await rejects(new GoogleReadClient(secret, async () => { throw new Error(secret); }).downloadPdf('pdf'), error => /netværksfejl/.test(String(error)) && !String(error).includes(secret));
});

test('ugyldigt JSON og for store svar afvises', async () => {
  await rejects(new GoogleReadClient('t', async () => new Response('not json')).readDocument('doc'), /JSON/);
  await rejects(new GoogleReadClient('t', async () => new Response('x', { headers: { 'content-length': String(21 * 1024 * 1024) } })).downloadPdf('pdf'), /størrelsesgrænsen/);
  await rejects(new GoogleReadClient('t', async () => new Response(new Uint8Array(6 * 1024 * 1024))).downloadImage('https://lh3.googleusercontent.com/x'), /for stort/);
});

test('billeder hentes uden API-token og kun fra Googles billedværter', async () => {
  const client = new GoogleReadClient('secret', async (_url, init) => {
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(init.redirect).toBe('error'); return new Response('image-bytes');
  });
  await client.downloadImage('https://docs.google.com/docs-images-rt/test');
  await client.downloadImage('https://lh3.googleusercontent.com/abc');
  for (const uri of ['http://docs.google.com/docs-images-rt/test', 'https://example.test/test', 'https://lh3.googleusercontent.com.evil.test/x', 'https://docs.google.com/other', 'https://user:pw@lh3.googleusercontent.com/x', 'https://localhost/x']) await rejects(client.downloadImage(uri));
});

test('getFile returnerer papirkurvsstatus og afviser forkert fil', async () => {
  const client = new GoogleReadClient('t', async url => Response.json(item(new URL(url).pathname.split('/').at(-1)!, { trashed: true })));
  expect((await client.getFile('abc')).trashed).toBe(true);
  await rejects(new GoogleReadClient('t', async () => Response.json(item('other'))).getFile('abc'), /forkert fil/);
});
