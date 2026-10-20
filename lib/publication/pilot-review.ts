import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicationPayload, type ContentRecord } from '../contracts/content';
import { recordAssets } from './assets';
import { renderBlocks } from '../site/blocks';
import { renderMarkdown } from '../site/markdown';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
/** Standalone local review of the exact prepared version; never in public dist. */
export async function writePilotReview(directory: string, records: ContentRecord[]) {
  let body = '<h1>Google-pilot: klar til gennemgang</h1><p>Ikke godkendt til publicering. Tekst, tabeller og billeder nedenfor kommer fra de fastfrosne snapshots.</p>';
  for (const record of records) {
    const payload = publicationPayload(record);
    body += `<article><h2>${esc(record.title)}</h2><p>ID: <code>${esc(record.id)}</code><br>Hash: <code>${record.contentHash}</code></p>`;
    if (payload.type === 'guide') {
      let html = payload.bodyBlocks ? renderBlocks(payload.bodyBlocks) : renderMarkdown(payload.bodyMarkdown!);
      for (const asset of recordAssets(record)) html = html.replaceAll(`"${asset.publicUrl}"`, `"snapshots/${record.id}/${record.contentHash.slice(7)}/${asset.snapshotPath}"`);
      body += html;
    }
    if (record.type === 'document') body += `<p><a href="snapshots/${record.id}/${record.contentHash.slice(7)}/document.pdf">Gennemgå den fastholdte PDF</a></p>`;
    body += '</article>';
  }
  const html = `<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Gennemgå Google-pilot</title><style>body{font:18px/1.6 Georgia,serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#213b30;background:#faf9f4}article{border-top:1px solid #ccd3c9;margin-top:3rem;padding-top:1rem}h1,h2,h3{line-height:1.2}code{overflow-wrap:anywhere}img{max-width:100%;height:auto}figure{margin:2rem 0}table{border-collapse:collapse;width:100%}td{border:1px solid #ccd3c9;padding:.6rem;vertical-align:top}td p{margin:0 0 .5rem}.table-scroll{overflow:auto}.rich-text{white-space:pre-line}a{color:#28573e}</style><body>${body}</body></html>`;
  await writeFile(join(directory, 'review.html'), html, { flag: 'wx', mode: 0o600 });
}
