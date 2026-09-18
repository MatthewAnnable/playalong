import { existsSync, cpSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { alphaTab } from '@coderline/alphatab-vite';

/**
 * `songs/` lives at the project root, not under `public/`, so the manifest
 * fetch that works in dev (Vite's dev server serves the whole project tree)
 * 404s on a production build — `vite build` only copies `public/` verbatim.
 * Mirroring `songs/` into `dist/songs/` here is what makes a hosted-library
 * song actually reachable once deployed.
 */
function copySongsPlugin(): Plugin {
  return {
    name: 'copy-songs',
    closeBundle() {
      if (existsSync('songs')) cpSync('songs', 'dist/songs', { recursive: true });
    },
  };
}

// base is overridable so the same build can live at the domain root or under
// a project path (e.g. GitHub Pages at /playalong/, or a subfolder in the
// student portal later) — see section 5.11 of the build plan.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  plugins: [alphaTab(), copySongsPlugin()],
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
