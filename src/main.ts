import './style.css';
import { isGuitarProFile, readFileAsArrayBuffer } from './engine/loader';
import { openScore } from './engine/alphatab';

const dropZone = document.querySelector<HTMLDivElement>('#drop-zone')!;
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle('is-error', isError);
}

async function handleFile(file: File): Promise<void> {
  if (!isGuitarProFile(file)) {
    setStatus(`"${file.name}" isn't a Guitar Pro file. Drop a .gp file instead.`, true);
    return;
  }
  setStatus(`Loading "${file.name}"…`);
  try {
    const buffer = await readFileAsArrayBuffer(file);
    await openScore(buffer);
    setStatus(`Loaded "${file.name}".`);
  } catch (err) {
    console.error(err);
    setStatus(`Couldn't open "${file.name}" — ${(err as Error).message}`, true);
  }
}

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('is-dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('is-dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('is-dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
});
