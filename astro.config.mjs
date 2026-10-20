import { defineConfig } from 'astro/config';
export default defineConfig({
  output: 'static',
  outDir: './.build/staging',
  publicDir: './.build/assets',
  build: { format: 'directory', inlineStylesheets: 'never' },
});
