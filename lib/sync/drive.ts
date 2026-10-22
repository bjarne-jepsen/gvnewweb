import { z } from 'zod';

export const driveIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(200);
export const FOLDER = 'application/vnd.google-apps.folder';
export const SHORTCUT = 'application/vnd.google-apps.shortcut';
export const GDOC = 'application/vnd.google-apps.document';
export const SHEET = 'application/vnd.google-apps.spreadsheet';

export const driveItemSchema = z.object({
  id: driveIdSchema, name: z.string().min(1), mimeType: z.string().min(1),
  modifiedTime: z.iso.datetime({ offset: true }), trashed: z.boolean().default(false),
  size: z.string().regex(/^\d+$/).optional(), sha256Checksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  shortcutDetails: z.object({ targetId: driveIdSchema, targetMimeType: z.string().optional() }).optional(),
});
export type DriveItem = z.infer<typeof driveItemSchema>;

/** The file is missing or the sync identity may not read it; Drive answers 404 for both. */
export class DriveAccessError extends Error {}

/** Shared contract for the real Drive client and the in-memory test Drive.
 * listFolder must return the complete listing or throw; a partial list is never acceptable. */
export interface DriveSource {
  listFolder(folderId: string): Promise<DriveItem[]>;
  getFile(fileId: string): Promise<DriveItem>;
  /** Docs API JSON rendered without suggestions (PREVIEW_WITHOUT_SUGGESTIONS), all tabs included. */
  readDocument(fileId: string): Promise<unknown>;
  /** Short-lived image URL from a Docs response; fetched without credentials. */
  downloadImage(uri: string): Promise<Uint8Array>;
  /** Sheets API grid data (values, links) of a spreadsheet; parsed by lib/google/sheets.ts. */
  readSheet(fileId: string): Promise<unknown>;
}
