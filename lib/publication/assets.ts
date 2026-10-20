import { digest, type ContentRecord } from '../contracts/content';
export interface Asset { assetPath: string; assetHash: string; sizeBytes: number; mimeType: string; originalFilename: string; }
export function imageFormat(bytes: Uint8Array): { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; extension: 'png' | 'jpg' | 'webp' } {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { mimeType: 'image/png', extension: 'png' };
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mimeType: 'image/webp', extension: 'webp' };
  throw new Error('Billede skal være PNG, JPEG eller WebP; SVG/HTML understøttes ikke');
}
export function verifyFile(file: Asset, bytes: Uint8Array) {
  if (bytes.length !== file.sizeBytes || digest(bytes) !== file.assetHash) throw new Error('Filens bytes matcher ikke assetHash/sizeBytes');
  if (file.mimeType === 'application/pdf') {
    if (!Buffer.from(bytes).subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Forventede PDF');
  } else if (imageFormat(bytes).mimeType !== file.mimeType) throw new Error('Billedets signatur matcher ikke MIME-type');
}
export const mediaUrl = (file: Pick<Asset, 'assetHash' | 'mimeType'>) => `/media/${file.assetHash.slice(7)}.${({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as Record<string, string>)[file.mimeType]}`;
export function recordAssets(record: ContentRecord) {
  if (record.type === 'document') return [{ file: record.file, snapshotPath: 'document.pdf', publicUrl: `/downloads/${record.file.assetHash.slice(7)}.pdf` }];
  if (record.type !== 'guide' || !record.bodyBlocks) return [];
  return record.bodyBlocks.flatMap(block => block.type === 'image' ? [{ file: block.file, snapshotPath: mediaUrl(block.file).slice(1), publicUrl: mediaUrl(block.file) }] : []);
}
