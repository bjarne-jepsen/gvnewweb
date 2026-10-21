import { cp, mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { digest } from '../contracts/content';
import type { SiteConfig } from './config';
import { documentMetaSchema, MAX_PDF_BYTES, serializeMeta, type DocumentMeta } from './content';
import { DriveAccessError, FOLDER, PDF, SHORTCUT, type DriveItem, type DriveSource } from './drive';
import { emptyReport, type ReportEntry, type SyncReport } from './report';
import { pathOf, serializeSlugs, slugify, slugsSchema, takenPaths, type Slugs } from './slugs';

export interface SyncOptions { config: SiteConfig; drive: DriveSource; contentDir: string; allowMassRemoval?: boolean; now?: Date }
interface Candidate { section: string; id: string; title: string; item: DriveItem }
interface Existing { section: string; meta: DocumentMeta }
type Output = { section: string; meta: DocumentMeta; bytes?: Uint8Array };

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

async function readJson(path: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (isMissing(error)) return undefined; throw error; }
}
async function readExisting(contentDir: string, sections: string[]) {
  const existing = new Map<string, Existing>();
  for (const section of sections) {
    let names: string[];
    try { names = await readdir(join(contentDir, section)); } catch (error) { if (isMissing(error)) continue; throw error; }
    for (const name of names.filter(n => n.endsWith('.json'))) {
      const meta = documentMetaSchema.parse(await readJson(join(contentDir, section, name)));
      if (`${meta.id}.json` !== name || existing.has(meta.id)) throw new Error(`content/${section}/${name}: ID passer ikke til filnavnet eller findes to gange`);
      existing.set(meta.id, { section, meta });
    }
  }
  return existing;
}
function verifyPdf(item: DriveItem, bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) throw new Error('PDF er tom eller over 20 MB');
  if (!Buffer.from(bytes).subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Filen er ikke en PDF');
  if (item.size !== undefined && BigInt(item.size) !== BigInt(bytes.length)) throw new Error('Størrelsen passer ikke med Drive');
  if (item.sha256Checksum && digest(bytes) !== `sha256:${item.sha256Checksum}`) throw new Error('Checksum passer ikke med Drive');
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
    const documentSections = Object.entries(config.sections).filter(([, s]) => s.type === 'document').map(([key]) => key);
    report.skippedSections = Object.keys(config.sections).filter(key => !documentSections.includes(key));
    const listings = new Map<string, DriveItem[]>();
    for (const key of documentSections) listings.set(key, await drive.listFolder(folders.get(key)!.id));

    const slugs: Slugs = slugsSchema.parse(await readJson(join(contentDir, '_slugs.json')) ?? {});
    const existing = await readExisting(contentDir, documentSections);
    const keep = new Set<string>();

    // 2. Resolve shortcuts and filter by type. Only direct children of a section are considered.
    const candidates: Candidate[] = [];
    for (const [section, items] of listings) for (const item of items) {
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
      if (target.mimeType !== PDF) { warn({ section, id: target.id, title: item.name, message: `Filtypen ${target.mimeType} accepteres ikke i ${section}` }); continue; }
      const title = item.name.normalize('NFC').replace(/\.pdf$/i, '').trim();
      if (!title) { fail({ section, id: target.id, title: item.name, message: 'Tom titel' }); keep.add(target.id); continue; }
      candidates.push({ section, id: target.id, title, item: target });
    }
    const byId = Map.groupBy(candidates, c => c.id), byLower = Map.groupBy([...new Set([...byId.keys(), ...existing.keys()])], id => id.toLowerCase());
    const unique = candidates.filter(c => {
      const clash = byId.get(c.id)!.length > 1 || byLower.get(c.id.toLowerCase())!.length > 1;
      if (clash) { keep.add(c.id); fail({ section: c.section, id: c.id, title: c.title, message: 'Samme fil optræder flere gange, eller ID kolliderer med et andet ID' }); }
      return !clash;
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); // newcomers claim slugs in a stable order

    // 3. Download, verify and assign slugs. Failures keep the last valid version.
    const output = new Map<string, Output>();
    for (const id of keep) { const prior = existing.get(id); if (prior) output.set(id, { ...prior }); }
    for (const c of unique) {
      let bytes: Uint8Array;
      try { bytes = await drive.downloadPdf(c.id); verifyPdf(c.item, bytes); }
      catch (error) {
        const prior = existing.get(c.id); if (prior) output.set(c.id, { ...prior });
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
          const prior = existing.get(c.id); if (prior) output.set(c.id, { ...prior });
          fail({ section: c.section, id: c.id, title: c.title, message: `Adressen ${path} bruges allerede; publiceres ikke` });
          continue;
        }
        if (!entry) slugs[c.id] = { section: c.section, slug, previousPaths: [] };
        else if (entry.section !== c.section) slugs[c.id] = { section: c.section, slug, previousPaths: [...new Set([...entry.previousPaths, pathOf(entry)])] };
      }
      const sha256 = digest(bytes), prior = existing.get(c.id);
      const same = prior && prior.section === c.section && prior.meta.sha256 === sha256 && prior.meta.title === c.title;
      const meta = { id: c.id, title: c.title, sizeBytes: bytes.length, sha256, updatedAt: same ? prior.meta.updatedAt : new Date(c.item.modifiedTime).toISOString() };
      output.set(c.id, { section: c.section, meta, bytes });
      if (same) report.unchanged++; else (prior ? report.changed : report.added).push({ section: c.section, id: c.id, title: c.title });
    }
    for (const [id, prior] of existing) if (!output.has(id)) report.removed.push({ section: prior.section, id, title: prior.meta.title });
    // A hand-edited _slugs.json must not let two live pages, or a page and a redirect, share a path.
    for (const id of output.keys()) {
      const entry = slugs[id];
      if (!entry || takenPaths(slugs, output.keys(), id).has(pathOf(entry))) throw new Error(`_slugs.json: ${id} mangler eller deler adresse med en anden side`);
    }

    for (const section of documentSections) {
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
    for (const section of documentSections) {
      await rm(join(staging, section), { recursive: true, force: true }); await mkdir(join(staging, section), { recursive: true });
    }
    for (const [id, out] of output) {
      const bytes = out.bytes ?? await readFile(join(contentDir, existing.get(id)!.section, `${id}.pdf`));
      if (digest(bytes) !== out.meta.sha256) throw new Error(`content/${out.section}/${id}.pdf passer ikke med metadata`);
      await writeFile(join(staging, out.section, `${id}.pdf`), bytes);
      await writeFile(join(staging, out.section, `${id}.json`), serializeMeta(out.meta));
    }
    await writeFile(join(staging, '_slugs.json'), serializeSlugs(slugsSchema.parse(slugs)));
    const check = await readExisting(staging, documentSections);
    if (check.size !== output.size) throw new Error('Intern fejl: staging afviger fra planen');
    let moved = false;
    try { await rename(contentDir, previous); moved = true; } catch (error) { if (!isMissing(error)) throw error; }
    try { await rename(staging, contentDir); } catch (error) { if (moved) await rename(previous, contentDir); throw error; }
    await rm(previous, { recursive: true, force: true });
    return report;
  } finally {
    await lock.close(); await rm(join(workDir, 'lock'), { force: true });
  }
}
