import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import packageMetadata from './package.json';

const buffTimerEnabled = process.env.WWCOMBO_INCLUDE_BUFF_TIMER !== '0';
const simulatedInputEnabled = process.env.WWCOMBO_INCLUDE_SIMULATED_INPUT !== '0';
const simulatedInputDlcRequired = process.env.WWCOMBO_SIMULATED_INPUT_DLC_REQUIRED === '1';
const buildInputs: Record<string, string> = {
  main: 'index.html',
  overlay: 'overlay.html',
  overlayNotes: 'overlay-notes.html',
  rhythmFeedback: 'rhythm-feedback.html',
  keyMapping: 'key-mapping.html',
  recordingIndicator: 'recording-indicator.html'
};
if (buffTimerEnabled) buildInputs.realtimeVision = 'realtime-vision.html';

const excludeLocalPublicArtifacts = () => ({
  name: 'exclude-local-public-artifacts',
  closeBundle() {
    rmSync(resolve(process.cwd(), 'dist', 'hifi'), { recursive: true, force: true });
  }
});

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageMetadata.version),
    __EXPERIMENTAL_ANALYSIS_LABS__: JSON.stringify(false),
    __BUFF_TIMER_ENABLED__: JSON.stringify(buffTimerEnabled),
    __SIMULATED_INPUT_ENABLED__: JSON.stringify(simulatedInputEnabled),
    __SIMULATED_INPUT_DLC_REQUIRED__: JSON.stringify(simulatedInputDlcRequired)
  },
  plugins: [react(), excludeLocalPublicArtifacts()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      // Release archives and build output can be locked by Windows or an
      // antivirus scanner while packaging; they are never source inputs.
      ignored: ['**/src-tauri/target/**', '**/target/**', '**/release-packages/**', '**/dist/**']
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: buildInputs
    }
  }
});
