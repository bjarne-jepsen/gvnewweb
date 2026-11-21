import { readFile } from 'node:fs/promises';

/** Interactive models an editor can place on a page by writing "[model: <navn>]" as a paragraph of its own.
 * Each model is three files in modeller/ (<navn>.html, .css, .js), written and reviewed in the repo, never
 * synced from Drive. The page shows the model in an iframe with sandbox="allow-scripts", so its script
 * runs in its own origin and cannot touch the page, cookies or other pages. */
export interface ModelInfo { title: string; caption: string }
export const MODELS: Record<string, ModelInfo> = {
  'hus-1918': {
    title: 'Interaktiv papmodel af et Grøndalsvænge-hus fra 1918',
    caption: 'Cardboard model baseret på Poul Holsøe & Jesper Tvede (1918) tegninger.',
  },
};

export { modelMarker } from '../sync/markdown';
export const modelPath = (name: string, ext: 'html' | 'css' | 'js') => `/modeller/${name}.${ext}`;

const MODEL_DIR = new URL('../../modeller/', import.meta.url);

/** Problems that would let a model reach outside its frame or load code from elsewhere. Empty when safe. */
export function modelProblems(name: string, files: { html: string; css: string; js: string }): string[] {
  const problems: string[] = [];
  const scripts = [...files.html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map(m => m[0]);
  if (scripts.length !== 1 || scripts[0] !== `<script src="${name}.js"></script>`) problems.push(`HTML må kun have <script src="${name}.js"></script>`);
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(files.html)) problems.push('HTML har en event-attribut (on…=)');
  if (!files.html.includes(`http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self';`)) problems.push('HTML mangler den faste Content-Security-Policy');
  // The SVG namespace is a name, not an address that is fetched.
  const remote = /(?:https?:)?\/\/(?!www\.w3\.org\/2000\/svg\b)[a-z0-9.-]+\.[a-z]{2,}/i;
  for (const [ext, text] of Object.entries(files)) if (remote.test(text)) problems.push(`${ext.toUpperCase()} henviser til en anden server`);
  if (/@import|url\(\s*['"]?\s*(?!#|data:)/i.test(files.css)) problems.push('CSS henter andre filer');
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|eval|Function)\s*\(|\bimport\s*\(|\b(?:parent|top|opener)\s*\./.test(files.js)) problems.push('JS henter data, kører tekst som kode eller rækker ud af rammen');
  return problems;
}

/** Reads every model in MODELS. Throws when a file is missing or a model fails modelProblems. */
export async function loadModels(dir: URL = MODEL_DIR): Promise<Map<string, Uint8Array>> {
  const assets = new Map<string, Uint8Array>();
  for (const name of Object.keys(MODELS)) {
    const read = (ext: 'html' | 'css' | 'js') => readFile(new URL(`${name}.${ext}`, dir), 'utf8');
    const files = { html: await read('html'), css: await read('css'), js: await read('js') };
    const problems = modelProblems(name, files);
    if (problems.length) throw new Error(`modeller/${name}: ${problems.join('; ')}`);
    for (const ext of ['html', 'css', 'js'] as const) assets.set(modelPath(name, ext), new TextEncoder().encode(files[ext]));
  }
  return assets;
}
