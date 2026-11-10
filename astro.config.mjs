import { defineConfig } from 'astro/config';
export default defineConfig({
  output: 'static',
  outDir: './.build/staging',
  publicDir: './.build/assets',
  build: { format: 'directory', inlineStylesheets: 'never' },
  // Scripts are always separate files under /_astro/, never inline; the output check allows only those.
  vite: { build: { assetsInlineLimit: 0 } },
});
