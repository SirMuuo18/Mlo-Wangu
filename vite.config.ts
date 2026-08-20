import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // data/mlo_database.json is the JSON-mode runtime database — it's rewritten
      // on nearly every API mutation (meal plan generation, expenses, etc). Without
      // this ignore, Vite's watcher treats each write as a source change and forces
      // a full page reload, wiping in-memory UI state right after the action that
      // triggered the write (e.g. "Generate New Plan" appears to silently fail).
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/data/**'] },
    },
  };
});
