#!/usr/bin/env node
/**
 * Adds a Guitar Pro file to the hosted library: copies it into
 * songs/<slug>/song.gp and adds an entry to songs/index.json, reading the
 * title and artist out of the file itself (build plan 5.7).
 *
 *   npm run add-song path/to/file.gp
 *
 * Only needed once the hosted library is switched on. The public repo has
 * no songs in it, so songs/ stays git-ignored.
 */
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as alphaTab from '@coderline/alphatab';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const songsDir = join(projectRoot, 'songs');
const manifestPath = join(songsDir, 'index.json');

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run add-song path/to/file.gp');
  process.exit(1);
}

const inputPath = resolve(process.cwd(), input);
if (!existsSync(inputPath)) {
  console.error(`Can't find "${input}".`);
  process.exit(1);
}

const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(inputPath)));
const title = score.title || input.replace(/\.[^.]+$/, '');
const artist = score.artist || '';
const slug = slugify(title);

mkdirSync(join(songsDir, slug), { recursive: true });
copyFileSync(inputPath, join(songsDir, slug, 'song.gp'));

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { songs: [] };
manifest.songs = manifest.songs.filter((song) => song.slug !== slug);
manifest.songs.push({
  slug,
  title,
  artist,
  file: `songs/${slug}/song.gp`,
  defaultTrack: 0,
  audioOffsetSeconds: 0,
  theme: 'default',
  tags: [],
});
manifest.songs.sort((a, b) => a.title.localeCompare(b.title));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Added "${title}"${artist ? ` by ${artist}` : ''} as "${slug}".`);
console.log(`Practice links can now use ?song=${slug}`);
