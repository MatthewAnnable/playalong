export type ActionId =
  | 'playPause'
  | 'barBack'
  | 'barForward'
  | 'loopStart'
  | 'loopEnd'
  | 'loopToggle'
  | 'speedDown'
  | 'speedUp'
  | 'speedReset'
  | 'delayDown'
  | 'delayUp'
  | 'guitarToggle'
  | 'viewHighway'
  | 'viewScore'
  | 'presentationToggle'
  | 'nextTrack'
  | 'copyLink';

export const ACTION_LABELS: Record<ActionId, string> = {
  playPause: 'Play / pause',
  barBack: 'Back one bar',
  barForward: 'Forward one bar',
  loopStart: 'Set loop start at current bar',
  loopEnd: 'Set loop end at current bar',
  loopToggle: 'Loop on / off',
  speedDown: 'Speed −5%',
  speedUp: 'Speed +5%',
  speedReset: 'Speed 100%',
  delayDown: 'Audio delay −10ms (notes earlier)',
  delayUp: 'Audio delay +10ms (notes later)',
  guitarToggle: 'Guitar on / off',
  viewHighway: 'Highway view',
  viewScore: 'Score view',
  presentationToggle: 'Presentation on / off',
  nextTrack: 'Next track',
  copyLink: 'Copy practice link',
};

const DEFAULT_KEYS: Record<ActionId, string> = {
  playPause: ' ',
  barBack: 'arrowleft',
  barForward: 'arrowright',
  loopStart: '[',
  loopEnd: ']',
  loopToggle: 'l',
  speedDown: '-',
  speedUp: '=',
  speedReset: '0',
  delayDown: ',',
  delayUp: '.',
  guitarToggle: 'g',
  viewHighway: 'h',
  viewScore: 's',
  presentationToggle: 'p',
  nextTrack: 't',
  copyLink: 'c',
};

const STORAGE_KEY = 'playalong.shortcuts';

const handlers = new Map<ActionId, () => void>();
let keyMap: Record<ActionId, string> = { ...DEFAULT_KEYS };
let learningAction: ActionId | null = null;
const changeListeners = new Set<() => void>();

export function registerAction(id: ActionId, handler: () => void): void {
  handlers.set(id, handler);
}

export function onShortcutsChanged(listener: () => void): void {
  changeListeners.add(listener);
}

function notifyChanged(): void {
  for (const listener of changeListeners) listener();
}

/**
 * A stable signature for a key press, including modifiers — Matthew's foot
 * pedals send whatever elfkey was already programmed with (often modifier
 * combinations for Zoom push-to-mute), and the app adapts to the pedals
 * rather than the other way round (build plan 5.10).
 */
export function keySignature(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (e.metaKey) parts.push('meta');
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  parts.push(key);
  return parts.join('+');
}

export function describeKey(signature: string): string {
  if (signature === ' ') return 'Space';
  return signature
    .split('+')
    .map((part) => {
      if (part === ' ') return 'Space';
      if (part === 'arrowleft') return '←';
      if (part === 'arrowright') return '→';
      if (part === 'arrowup') return '↑';
      if (part === 'arrowdown') return '↓';
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' + ');
}

export function getKeyMap(): Readonly<Record<ActionId, string>> {
  return keyMap;
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keyMap));
  } catch {
    // Private browsing or blocked storage — the map still works this session.
  }
}

function load(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Record<ActionId, string>>;
    keyMap = { ...DEFAULT_KEYS, ...parsed };
  } catch {
    keyMap = { ...DEFAULT_KEYS };
  }
}

export function startLearning(action: ActionId): void {
  learningAction = action;
  notifyChanged();
}

export function getLearningAction(): ActionId | null {
  return learningAction;
}

export function cancelLearning(): void {
  learningAction = null;
  notifyChanged();
}

export function resetToDefaults(): void {
  keyMap = { ...DEFAULT_KEYS };
  persist();
  notifyChanged();
}

export function exportKeyMap(): string {
  return JSON.stringify(keyMap, null, 2);
}

export function importKeyMap(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as Partial<Record<ActionId, string>>;
    keyMap = { ...DEFAULT_KEYS, ...parsed };
    persist();
    notifyChanged();
    return true;
  } catch {
    return false;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function initShortcuts(): void {
  load();

  window.addEventListener('keydown', (e) => {
    const signature = keySignature(e);

    if (learningAction) {
      e.preventDefault();
      if (e.key === 'Escape') {
        cancelLearning();
        return;
      }
      // Ignore bare modifier presses — wait for the actual key.
      if (['control', 'alt', 'shift', 'meta'].includes(e.key.toLowerCase())) return;
      // Whatever key already had this action loses it, so one key means one thing.
      for (const id of Object.keys(keyMap) as ActionId[]) {
        if (keyMap[id] === signature) keyMap[id] = '';
      }
      keyMap[learningAction] = signature;
      learningAction = null;
      persist();
      notifyChanged();
      return;
    }

    if (isTypingTarget(e.target)) return;

    for (const id of Object.keys(keyMap) as ActionId[]) {
      if (keyMap[id] && keyMap[id] === signature) {
        const handler = handlers.get(id);
        if (handler) {
          e.preventDefault();
          handler();
        }
        return;
      }
    }
  });
}
