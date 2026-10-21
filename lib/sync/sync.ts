import { cp, mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { googleDocsBlocks } from '../adapters/google/blocks';
import { digest } from '../contracts/content';
import { imageFormat } from '../publication/assets';
import type { SiteConfig } from './config';
import { documentMetaSchema, guideMetaSchema, imageNamePattern, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_PDF_BYTES, serializeMeta } from './content';
import { DriveAccessError, FOLDER, GDOC, PDF, SHORTCUT, type DriveItem, type DriveSource } from './drive';
import { assertRoundTrip, blocksToMarkdown, splitFrontmatter, summaryOf, validateMarkdown, withFrontmatter, type SerializableBlock } from './markdown';
import { emptyReport, type ReportEntry, type SyncReport } from './report';
import { pathOf, serializeSlugs, slugify, slugsSchema, takenPaths, type Slugs } from './slugs';

export interface SyncOptions { config: SiteConfig; drive: DriveSource; contentDir: string; allowMassRemoval?: boolean; now?: Date }
type Kind = 'pdf' | 'gdoc';
interface Candidate { section: string; kind: Kind; id: string; title: string; item: DriveItem }
/** Everything one published item consists of, as files relative to its section folder. */
interface Entry { section: string; id: string; title: string; updatedAt: string; fingerprint: string; files: Map<string, Uint8Array> }
interface Fetched { fingerprint: string; build(updatedAt: string): Map<string, Uint8Array> }

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const utf8 = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
const localImage = (id: string) => (url: string) => url.startsWith(`./${id}/`) && imageNamePattern.test(url.slice(id.length + 3));

async function readJson(path: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (isMissing(error)) return undefined; throw error; }
}
async function list(dir: string) {
  try { return await readdir(dir, { withFileTypes: true }); } catch (error) { if (isMissing(error)) return []; throw error; }
}
/** Reads and re-validates what an earlier run wrote. Anything unexpected aborts the run. */
async function readSection(dir: string, section: string, kind: Kind, into: Map<string, Entry>) {
  const where = (name: string) => `content/${section}/${name}`;
  const add = (entry: Entry) => { if (into.has(entry.id)) throw new Error(`${where(entry.id)}: ID findes i flere sektioner`); into.set(entry.id, entry); };
  const entries = await list(dir);
  for (const e of entries) {
    if (kind === 'pdf' && e.isFile() && e.name.endsWith('.json')) {
      const raw = await readFile(join(dir, e.name)), meta = documentMetaSchema.parse(JSON.parse(raw.toString('utf8')));
      const pdf = await readFile(join(dir, `${meta.id}.pdf`));
      if (e.name !== `${meta.id}.json` || digest(pdf) !== meta.sha256) throw new Error(`${where(e.name)}: passer ikke med sin PDF`);
      add({ section, id: meta.id, title: meta.title, updatedAt: meta.updatedAt, fingerprint: meta.sha256, files: new Map([[`${meta.id}.pdf`, pdf], [e.name, raw]]) });
    } else if (kind === 'gdoc' && e.isFile() && e.name.endsWith('.md')) {
      const raw = await readFile(join(dir, e.name)), { meta: front, body } = splitFrontmatter(raw.toString('utf8'));
      const meta = guideMetaSchema.parse(front);
      if (e.name !== `${meta.id}.md`) throw new Error(`${where(e.name)}: ID passer ikke til filnavnet`);
      const tree = validateMarkdown(body, localImage(meta.id));
      const files = new Map([[e.name, raw]]), used = new Set<string>();
      const walk = (n: { type: string; url?: string; children?: unknown[] }) => { if (n.type === 'image') used.add(n.url!.slice(meta.id.length + 3)); (n.children as typeof n[] | undefined)?.forEach(walk); };
      walk(tree);
      for (const img of await list(join(dir, meta.id))) {
        if (!img.isFile() || !used.has(img.name)) throw new Error(`${where(`${meta.id}/${img.name}`)}: billedet bruges ikke`);
        files.set(`${meta.id}/${img.name}`, await readFile(join(dir, meta.id, img.name)));
      }
      for (const name of used) if (!files.has(`${meta.id}/${name}`)) throw new Error(`${where(meta.id)}: billedet ${name} mangler`);
      add({ section, id: meta.id, title: meta.title, updatedAt: meta.updatedAt, fingerprint: digest(body), files });
    } else if (!(kind === 'pdf' && e.isFile() && e.name.endsWith('.pdf')) && !(kind === 'gdoc' && e.isDirectory())) {
      throw new Error(`${where(e.name)}: uventet fil; content/ må kun skrives af sync`);
    }
  }
}
function verifyPdf(item: DriveItem, bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) throw new Error('PDF er tom eller over 20 MB');
  if (!Buffer.from(bytes).subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Filen er ikke en PDF');
  if (item.size !== undefined && BigInt(item.size) !== BigInt(bytes.length)) throw new Error('Størrelsen passer ikke med Drive');
  if (item.sha256Checksum && digest(bytes) !== `sha256:${item.sha256Checksum}`) throw new Error('Checksum passer ikke med Drive');
}
async function fetchPdf(drive: DriveSource, c: Candidate): Promise<Fetched> {
  const bytes = await drive.downloadPdf(c.id);
  verifyPdf(c.item, bytes);
  const sha256 = digest(bytes);
  return { fingerprint: sha256, build: updatedAt => new Map([[`${c.id}.pdf`, bytes], [`${c.id}.json`, utf8(serializeMeta({ id: c.id, title: c.title, updatedAt, sizeBytes: bytes.length, sha256 }))]]) };
}
/** Docs API (accepted text only) → existing block parser → own Markdown, validated and round-tripped. */
async function fetchGuide(drive: DriveSource, c: Candidate): Promise<Fetched> {
  const images = new Map<string, Uint8Array>();
  const { bodyBlocks } = await googleDocsBlocks(await drive.readDocument(c.id), c.id, async (_objectId, embedded) => {
    const alt = [embedded.description, embedded.title].find(v => typeof v === 'string' && v.trim()) as string | undefined;
    if (!alt) throw new Error('Et billede mangler alternativ tekst (højreklik på billedet → Alternativ tekst)');
    const uri = z.string().parse(z.record(z.string(), z.unknown()).parse(embedded.imageProperties).contentUri);
    const bytes = await drive.downloadImage(uri), format = imageFormat(bytes);
    const name = `${digest(bytes).slice(7, 23)}.${format.extension}`;
    images.set(name, bytes);
    if (images.size > MAX_IMAGES || [...images.values()].reduce((n, b) => n + b.length, 0) > MAX_IMAGE_BYTES) throw new Error('For mange eller for store billeder');
    return { type: 'image', alt, file: { assetPath: `${c.id}/${name}`, assetHash: digest(bytes), sizeBytes: bytes.length, mimeType: format.mimeType, originalFilename: name } };
  });
  const blocks: SerializableBlock[] = bodyBlocks.map(b => b.type === 'image' ? { type: 'image', alt: b.alt, name: b.file.originalFilename } : b);
  const body = blocksToMarkdown(blocks, name => `./${c.id}/${name}`);
  assertRoundTrip(blocks, validateMarkdown(body, localImage(c.id)));
  const summary = summaryOf(blocks);
  return { fingerprint: digest(body), build: updatedAt => new Map([
    [`${c.id}.md`, utf8(withFrontmatter({ id: c.id, title: c.title, updatedAt, summary }, body))],
    ...[...images].map(([name, bytes]) => [`${c.id}/${name}`, bytes] as [string, Uint8Array])]) };
}

/** One complete run: list everything first, abort on any listing error, then write a full
 * new content tree in staging and swap it in. A failing file keeps its last valid version. */
export async function syncContent(o: SyncOptions): Promise<SyncReport> {
  const { config, drive, contentDir } = o;
  const report = emptyReport((o.now ?? new Date()).toISOString());
  const warn = (e: ReportEntry) => report.warnings.push(e), fail = (e: ReportEntry) => report.errors.push(e);
  const workDir = join(dirname(contentDir), '.sync');
  await mkdir(workDir, { recursive: true });
  const lock = await open(join(workDir, 'lock'), 'wx').catch(() => { throw new Error('Sync kører allerede. Fjern kun .sync/lock efter et afbrudt forløb.'); });
  try {
    // 1. Complete listings. Any error here aborts before anything is written.
    const folders = new Map<string, DriveItem>();
    for (const item of await drive.listFolder(config.rootFolderId)) {
      if (item.mimeType === FOLDER && item.name in config.sections) {
        if (folders.has(item.name)) throw new Error(`To mapper i roden hedder "${item.name}"`);
        folders.set(item.name, item);
      } else if (!(item.mimeType === FOLDER && config.ignoredFolders.includes(item.name))) {
        warn({ section: '(rod)', title: item.name, message: item.mimeType === FOLDER ? 'Ukendt mappe i roden; læses ikke' : 'Fil direkte i roden; publiceres ikke' });
      }
    }
    for (const key of Object.keys(config.sections)) if (!folders.has(key)) throw new Error(`Sektionsmappen "${key}" mangler i roden`);
    const kinds = new Map<string, Kind>();
    for (const [key, s] of Object.entries(config.sections)) {
      if (s.type === 'document') kinds.set(key, 'pdf'); else if (s.type === 'guide') kinds.set(key, 'gdoc'); else report.skippedSections.push(key);
    }
    const listings = new Map<string, DriveItem[]>();
    for (const key of kinds.keys()) listings.set(key, await drive.listFolder(folders.get(key)!.id));

    const slugs: Slugs = slugsSchema.parse(await readJson(join(contentDir, '_slugs.json')) ?? {});
    const existing = new Map<string, Entry>();
    for (const [section, kind] of kinds) await readSection(join(contentDir, section), section, kind, existing);
    const keep = new Set<string>();

    // 2. Resolve shortcuts and filter by type. Only direct children of a section are considered.
    const candidates: Candidate[] = [];
    for (const [section, items] of listings) for (const item of items) {
      const kind = kinds.get(section)!;
      if (item.mimeType === FOLDER) { warn({ section, title: item.name, message: 'Undermappe; indholdet publiceres ikke' }); continue; }
      let target = item;
      if (item.mimeType === SHORTCUT) {
        const details = item.shortcutDetails;
        if (!details) { fail({ section, title: item.name, message: 'Genvej uden mål' }); continue; }
        if (details.targetMimeType === FOLDER) { warn({ section, title: item.name, message: 'Genvej til en mappe; publiceres ikke' }); continue; }
        try { target = await drive.getFile(details.targetId); }
        catch (error) {
          keep.add(details.targetId);
          fail({ section, id: details.targetId, title: item.name, message: error instanceof DriveAccessError ? 'Synkroniseringskontoen kan ikke læse målfilen' : `Målfilen kunne ikke hentes: ${message(error)}` });
          continue;
        }
        if (target.trashed) { warn({ section, id: target.id, title: item.name, message: 'Målfilen ligger i papirkurven; siden fjernes' }); continue; }
      }
      if (target.mimeType !== (kind === 'pdf' ? PDF : GDOC)) { warn({ section, id: target.id, title: item.name, message: `Filtypen ${target.mimeType} accepteres ikke i ${section}` }); continue; }
      const title = (kind === 'pdf' ? item.name.replace(/\.pdf$/i, '') : item.name).normalize('NFC').trim();
      if (!title) { fail({ section, id: target.id, title: item.name, message: 'Tom titel' }); keep.add(target.id); continue; }
      candidates.push({ section, kind, id: target.id, title, item: target });
    }
    const byId = Map.groupBy(candidates, c => c.id), byLower = Map.groupBy([...new Set([...byId.keys(), ...existing.keys()])], id => id.toLowerCase());
    const unique = candidates.filter(c => {
      const clash = byId.get(c.id)!.length > 1 || byLower.get(c.id.toLowerCase())!.length > 1;
      if (clash) { keep.add(c.id); fail({ section: c.section, id: c.id, title: c.title, message: 'Samme fil optræder flere gange, eller ID kolliderer med et andet ID' }); }
      return !clash;
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); // newcomers claim slugs in a stable order

    // 3. Fetch, convert, verify and assign slugs. Failures keep the last valid version.
    const output = new Map<string, Entry>();
    const keepPrior = (id: string) => { const prior = existing.get(id); if (prior) output.set(id, prior); };
    keep.forEach(keepPrior);
    for (const c of unique) {
      let fetched: Fetched;
      try { fetched = await (c.kind === 'pdf' ? fetchPdf : fetchGuide)(drive, c); }
      catch (error) {
        keepPrior(c.id);
        fail({ section: c.section, id: c.id, title: c.title, message: `${error instanceof DriveAccessError ? 'Ingen adgang til filen' : message(error)}; sidste gyldige version beholdes` });
        continue;
      }
      const active = new Set([...output.keys(), ...unique.map(u => u.id)]);
      const entry = slugs[c.id];
      // New, returning and moved files must claim their path; a page already live there keeps it.
      if (!entry || entry.section !== c.section || existing.get(c.id)?.section !== c.section) {
        const slug = entry?.slug ?? slugify(c.title, c.id);
        const path = pathOf({ section: c.section, slug });
        if (takenPaths(slugs, active, c.id).has(path)) {
          keepPrior(c.id);
          fail({ section: c.section, id: c.id, title: c.title, message: `Adressen ${path} bruges allerede; publiceres ikke` });
          continue;
        }
        if (!entry) slugs[c.id] = { section: c.section, slug, previousPaths: [] };
        else if (entry.section !== c.section) slugs[c.id] = { section: c.section, slug, previousPaths: [...new Set([...entry.previousPaths, pathOf(entry)])] };
      }
      const prior = existing.get(c.id);
      const same = prior && prior.section === c.section && prior.fingerprint === fetched.fingerprint && prior.title === c.title;
      const updatedAt = same ? prior.updatedAt : new Date(c.item.modifiedTime).toISOString();
      output.set(c.id, { section: c.section, id: c.id, title: c.title, updatedAt, fingerprint: fetched.fingerprint, files: fetched.build(updatedAt) });
      if (same) report.unchanged++; else (prior ? report.changed : report.added).push({ section: c.section, id: c.id, title: c.title });
    }
    for (const [id, prior] of existing) if (!output.has(id)) report.removed.push({ section: prior.section, id, title: prior.title });
    // A hand-edited _slugs.json must not let two live pages, or a page and a redirect, share a path.
    for (const id of output.keys()) {
      const entry = slugs[id];
      if (!entry || takenPaths(slugs, output.keys(), id).has(pathOf(entry))) throw new Error(`_slugs.json: ${id} mangler eller deler adresse med en anden side`);
    }
    for (const section of kinds.keys()) {
      const before = [...existing.values()].filter(e => e.section === section).length;
      const removed = report.removed.filter(r => r.section === section).length;
      if (!o.allowMassRemoval && removed >= 2 && removed * 2 > before) throw new Error(`${section}: ${removed} af ${before} filer ville blive fjernet. Kør igen med --allow-mass-removal, hvis det er meningen`);
    }

    // 4. Build the complete new tree in staging, validate it, then swap it in.
    const staging = join(workDir, 'staging'), previous = join(workDir, 'previous');
    await rm(staging, { recursive: true, force: true }); await rm(previous, { recursive: true, force: true });
    // Other sections, _redirects.json etc. are carried over byte for byte.
    try { await cp(contentDir, staging, { recursive: true, errorOnExist: true }); }
    catch (error) { if (!isMissing(error)) throw error; await mkdir(staging, { recursive: true }); }
    for (const section of kinds.keys()) {
      await rm(join(staging, section), { recursive: true, force: true }); await mkdir(join(staging, section), { recursive: true });
    }
    for (const entry of output.values()) for (const [name, bytes] of entry.files) {
      const target = join(staging, entry.section, name);
      await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
    }
    await writeFile(join(staging, '_slugs.json'), serializeSlugs(slugsSchema.parse(slugs)));
    const check = new Map<string, Entry>();
    for (const [section, kind] of kinds) await readSection(join(staging, section), section, kind, check);
    if (check.size !== output.size || [...output.values()].some(e => check.get(e.id)?.fingerprint !== e.fingerprint)) throw new Error('Intern fejl: staging afviger fra planen');
    let moved = false;
    try { await rename(contentDir, previous); moved = true; } catch (error) { if (!isMissing(error)) throw error; }
    try { await rename(staging, contentDir); } catch (error) { if (moved) await rename(previous, contentDir); throw error; }
    await rm(previous, { recursive: true, force: true });
    return report;
  } finally {
    await lock.close(); await rm(join(workDir, 'lock'), { force: true });
  }
}
