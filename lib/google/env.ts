import { readFile } from 'node:fs/promises';
import type { DriveSource } from '../sync/drive';
import { GoogleReadClient } from './client';

const readToken = async (file: string | undefined) => file ? (await readFile(file, 'utf8')).trim() : undefined;
/** The Drive source for CLI runs. Tokens come from local files outside Git; never from arguments. */
export async function driveFromEnv(env = process.env): Promise<DriveSource> {
  const token = env.GOOGLE_ACCESS_TOKEN ?? await readToken(env.GOOGLE_ACCESS_TOKEN_FILE);
  if (!token) throw new Error('Mangler Google-adgang: angiv GOOGLE_ACCESS_TOKEN_FILE med et kortlivet token. Læg aldrig tokens i Git eller chat.');
  // Optional separate token with documents.readonly; one token with both scopes is enough.
  const docsToken = await readToken(env.GOOGLE_DOCS_ACCESS_TOKEN_FILE);
  const client = new GoogleReadClient(token), docsClient = docsToken ? new GoogleReadClient(docsToken) : client;
  return {
    listFolder: id => client.listFolder(id), getFile: id => client.getFile(id), downloadPdf: id => client.downloadPdf(id),
    readDocument: id => docsClient.readDocument(id), downloadImage: uri => client.downloadImage(uri), readSheet: id => client.readSheet(id),
  };
}
