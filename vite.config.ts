import { defineConfig } from 'vite';
import { alphaTab } from '@coderline/alphatab-vite';

// base is overridable so the same build can live at the domain root or under
// a project path (e.g. GitHub Pages at /playalong/, or a subfolder in the
// student portal later) — see section 5.11 of the build plan.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  plugins: [alphaTab()],
  build: {
    rollupOptions: {
      // remote.html is the OBS control page (build plan 5.9).
      input: {
        main: 'index.html',
        remote: 'remote.html',
      },
    },
  },
  // alphaTab locates its font/soundfont assets relative to its own module
  // URL at runtime. If esbuild pre-bundles it into node_modules/.vite/deps/,
  // that relative lookup breaks (assets get requested from the deps cache
  // path, which doesn't exist) — so it must be excluded from pre-bundling.
  optimizeDeps: {
    exclude: ['@coderline/alphatab'],
  },
});
