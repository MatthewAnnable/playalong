/**
 * Harmony skin page. Plays a hand-written chord chart at its tempo and draws
 * the chord-song overlay.
 *
 *   harmony.html?chart=test           preview with controls
 *   harmony.html?chart=test&mode=obs  OBS browser source: transparent, no
 *                                      controls, starts on its own
 *
 * Other options: `click=all|countin|off`, `delay=2` (seconds before an OBS
 * start). Charts live in public/harmony/charts/<name>.txt; in the preview a
 * chart, photo or video can also be dropped on the page.
 */

import './harmony.css';
import { parseChart, type Chart } from './chart';
import { Overlay } from './overlay';
import { Transport, type ClickMode } from './transport';

const params = new URLSearchParams(location.search);
const obs = params.get('mode') === 'obs';
const clickParam = params.get('click');
const click: ClickMode = clickParam === 'off' || clickParam === 'countin' ? clickParam : 'all';
const chartName = params.get('chart') ?? 'test';
const delaySeconds = Math.max(0, Number(params.get('delay') ?? 2) || 0);

document.documentElement.classList.toggle('obs', obs);
document.body.classList.toggle('obs', obs);

const viewport = document.querySelector<HTMLElement>('#viewport')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const titleEl = document.querySelector<HTMLElement>('#hc-title')!;
const subEl = document.querySelector<HTMLElement>('#hc-sub')!;
const posEl = document.querySelector<HTMLElement>('#hc-pos')!;
const playButton = document.querySelector<HTMLButtonElement>('#hc-play')!;
const restartButton = document.querySelector<HTMLButtonElement>('#hc-restart')!;
const clickSelect = document.querySelector<HTMLSelectElement>('#hc-click')!;
const bgSelect = document.querySelector<HTMLSelectElement>('#hc-bg')!;
const fileInput = document.querySelector<HTMLInputElement>('#hc-file')!;

const overlay = new Overlay(stage);
const transport = new Transport(90, 4, 0, click);
clickSelect.value = click;
let chart: Chart | null = null;
let media: HTMLImageElement | HTMLVideoElement | null = null;

function fit(): void {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  const scale = Math.min(w / 1920, h / 1080);
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${(w - 1920 * scale) / 2}px`;
  stage.style.top = `${(h - 1080 * scale) / 2}px`;
}
window.addEventListener('resize', fit);
fit();

function useChart(text: string): void {
  transport.stop();
  chart = parseChart(text);
  transport.setSong(chart.tempo, chart.beatsPerBar, chart.totalBeats);
  overlay.setChart(chart);
  document.title = `${chart.title} — Harmony skin`;
  titleEl.textContent = chart.title;
  const facts = [chart.artist, `${chart.tempo} bpm`].filter(Boolean).join('  ·  ');
  subEl.textContent = chart.warnings.length ? chart.warnings[0] : facts;
  subEl.classList.toggle('hc-warn', chart.warnings.length > 0);
  if (chart.warnings.length) console.warn('Chart warnings:', chart.warnings);
}

async function loadNamedChart(name: string): Promise<void> {
  const url = `${import.meta.env.BASE_URL}harmony/charts/${encodeURIComponent(name)}.txt`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    titleEl.textContent = `No chart called "${name}"`;
    subEl.textContent = `Looked for ${url}`;
    return;
  }
  useChart(await res.text());
}

function togglePlay(): void {
  if (!chart) return;
  if (transport.isPlaying) {
    transport.stop();
  } else {
    const pos = transport.position();
    void transport.play(pos >= chart.totalBeats ? 0 : pos, chart.countInBars);
  }
}

function restart(): void {
  transport.stop();
  transport.seek(0);
}

function seekBars(direction: number): void {
  if (!chart) return;
  const bpb = chart.beatsPerBar;
  const bar = Math.floor(Math.max(0, transport.position()) / bpb);
  transport.seek((bar + direction) * bpb);
}

function setBackground(mode: string): void {
  document.body.classList.remove('bg-board', 'bg-transparent', 'bg-media');
  document.body.classList.add(`bg-${mode}`);
  bgSelect.value = mode;
  if (media) media.style.display = mode === 'media' ? '' : 'none';
}

function useMedia(file: File): void {
  media?.remove();
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('video/')) {
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    void v.play();
    media = v;
  } else {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    media = img;
  }
  media.className = 'hx-media';
  stage.prepend(media);
  bgSelect.querySelector<HTMLOptionElement>('option[value="media"]')!.disabled = false;
  setBackground('media');
}

async function openFile(file: File): Promise<void> {
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) useMedia(file);
  else useChart(await file.text());
}

playButton.addEventListener('click', togglePlay);
restartButton.addEventListener('click', restart);
clickSelect.addEventListener('change', () => {
  transport.click = clickSelect.value as ClickMode;
});
bgSelect.addEventListener('change', () => setBackground(bgSelect.value));
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void openFile(file);
  fileInput.value = '';
});

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file) void openFile(file);
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'r' || e.key === 'R' || e.key === 'Home') {
    restart();
  } else if (e.key === 'ArrowLeft') {
    seekBars(-1);
  } else if (e.key === 'ArrowRight') {
    seekBars(1);
  } else if (e.key === 'c' || e.key === 'C') {
    const order: ClickMode[] = ['all', 'countin', 'off'];
    transport.click = order[(order.indexOf(transport.click) + 1) % order.length];
    clickSelect.value = transport.click;
  }
});

let lastPosText = '';
function frame(): void {
  const pos = transport.position();
  overlay.render(pos);
  if (chart && !obs) {
    const bpb = chart.beatsPerBar;
    const bars = Math.ceil(chart.totalBeats / bpb);
    const text = pos < 0 ? 'Count-in' : `Bar ${Math.min(bars, Math.floor(pos / bpb) + 1)} of ${bars}`;
    if (text !== lastPosText) posEl.textContent = lastPosText = text;
    const label = transport.isPlaying ? 'Pause' : 'Play';
    if (playButton.textContent !== label) playButton.textContent = label;
  }
  requestAnimationFrame(frame);
}

void loadNamedChart(chartName).then(() => {
  requestAnimationFrame(frame);
  if (obs && chart) {
    const c = chart;
    window.setTimeout(() => void transport.play(0, c.countInBars), delaySeconds * 1000);
  }
});
