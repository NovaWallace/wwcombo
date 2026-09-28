import { build } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, unlink } from 'node:fs/promises';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const siteRoot = resolve(projectRoot, 'scripts/community/site');
const assetRoot = resolve(siteRoot, 'assets');

for (const file of await readdir(assetRoot)) {
  if (/^wiki-(?:runtime|[^/]+)-[A-Za-z0-9_-]+\.min\.js$/u.test(file)) await unlink(resolve(assetRoot, file));
}

await build({
  configFile: false,
  root: siteRoot,
  publicDir: false,
  build: {
    outDir: assetRoot,
    emptyOutDir: false,
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(siteRoot, 'community-entry.js'),
      output: {
        format: 'es',
        entryFileNames: 'wiki-runtime.min.js',
        chunkFileNames: 'wiki-[name]-[hash].min.js',
        assetFileNames: '[name][extname]',
      }
    }
  }
});

console.log('Built community Wiki runtime: scripts/community/site/assets/wiki-runtime.min.js');
