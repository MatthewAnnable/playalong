import {
  ACTION_LABELS,
  cancelLearning,
  describeKey,
  exportKeyMap,
  getKeyMap,
  getLearningAction,
  importKeyMap,
  onShortcutsChanged,
  resetToDefaults,
  startLearning,
  type ActionId,
} from './shortcuts';

const modal = document.querySelector<HTMLDivElement>('#shortcuts-modal')!;
const list = document.querySelector<HTMLUListElement>('#shortcuts-list')!;
const openButton = document.querySelector<HTMLButtonElement>('#shortcuts-button')!;
const closeButton = document.querySelector<HTMLButtonElement>('#shortcuts-close')!;
const resetButton = document.querySelector<HTMLButtonElement>('#shortcuts-reset')!;
const exportButton = document.querySelector<HTMLButtonElement>('#shortcuts-export')!;
const importButton = document.querySelector<HTMLButtonElement>('#shortcuts-import')!;
const importFile = document.querySelector<HTMLInputElement>('#shortcuts-import-file')!;

function render(): void {
  const keyMap = getKeyMap();
  const learning = getLearningAction();
  list.innerHTML = '';

  for (const id of Object.keys(ACTION_LABELS) as ActionId[]) {
    const row = document.createElement('li');
    row.className = 'shortcut-row';
    if (learning === id) row.classList.add('is-learning');

    const label = document.createElement('span');
    label.textContent = ACTION_LABELS[id];

    const key = document.createElement('span');
    key.className = 'shortcut-key';
    key.textContent = learning === id ? 'Press a key…' : keyMap[id] ? describeKey(keyMap[id]) : 'Not set';

    const setButton = document.createElement('button');
    setButton.type = 'button';
    setButton.className = 'shortcut-set';
    setButton.textContent = learning === id ? 'Cancel' : 'Set';
    setButton.addEventListener('click', () => {
      if (getLearningAction() === id) cancelLearning();
      else startLearning(id);
    });

    row.append(label, key, setButton);
    list.appendChild(row);
  }
}

function downloadKeyMap(): void {
  const blob = new Blob([exportKeyMap()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'playalong-shortcuts.json';
  link.click();
  URL.revokeObjectURL(url);
}

export function initShortcutsPanel(): void {
  onShortcutsChanged(render);
  render();

  openButton.addEventListener('click', () => {
    modal.hidden = false;
    render();
  });
  closeButton.addEventListener('click', () => {
    cancelLearning();
    modal.hidden = true;
  });
  resetButton.addEventListener('click', resetToDefaults);
  exportButton.addEventListener('click', downloadKeyMap);
  importButton.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    importKeyMap(await file.text());
    importFile.value = '';
  });
}
