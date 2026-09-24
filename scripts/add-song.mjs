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

// A variable-bitrate MP3 can't be seeked accurately in a browser: after any
// scrub, loop or start from a bar, the audio lands a couple of hundred ms
// from where the player thinks it is, and the highway and score drift out of
// step with what you hear. R U Mine's recording was one. A VBR file carries a
// "Xing" header; a constant-bitrate one says "Info" or nothing.
const audio = score.backingTrack?.rawAudioFile;
if (audio && isVariableBitrateMp3(audio)) {
  console.warn('');
  console.warn('WARNING: the audio in this file is a variable-bitrate MP3, so it will drift out');
  console.warn('of sync after seeking. Re-encode it at a constant bitrate (for example');
  console.warn('`ffmpeg -i in.mp3 -c:a libmp3lame -b:a 256k out.mp3`) and put it back into the');
  console.warn('.gp file (or re-import it in Guitar Pro) before using this song.');
}

function isVariableBitrateMp3(bytes) {
  let start = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    start = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
  }
  const head = Buffer.from(bytes.subarray(start, start + 2000)).toString('latin1');
  return head.includes('Xing') || head.includes('VBRI');
}
console.log(`Practice links can now use ?song=${slug}`);
