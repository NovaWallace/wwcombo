import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const excludeLocalPublicArtifacts = () => ({
  name: 'exclude-local-public-artifacts',
  closeBundle() {
    rmSync(resolve(process.cwd(), 'dist', 'hifi'), { recursive: true, force: true });
  }
});

export default defineConfig({
  plugins: [react(), excludeLocalPublicArtifacts()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      ignored: ['**/src-tauri/target/**', '**/target/**']
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        overlay: 'overlay.html',
        rhythmFeedback: 'rhythm-feedback.html',
        keyMapping: 'key-mapping.html',
        recordingIndicator: 'recording-indicator.html'
      }
    }
  }
});
