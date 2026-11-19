/**
 * The "More" menu in the top rail: the controls used now and then (Tab only,
 * Chord names, Audio from OBS, Shortcuts, Song list, Open a file) kept out
 * of the way of the ones used every lesson.
 */

const button = document.querySelector<HTMLButtonElement>('#menu-button')!;
const panel = document.querySelector<HTMLDivElement>('#menu-panel')!;

function setOpen(open: boolean): void {
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}

export function initMenu(): void {
  button.addEventListener('click', () => setOpen(panel.hidden === true));

  // A press anywhere else closes it.
  document.addEventListener('pointerdown', (e) => {
    if (panel.hidden) return;
    const target = e.target as Node;
    if (!panel.contains(target) && !button.contains(target)) setOpen(false);
  });

  // The actions that open something else close the menu behind them; the
  // switches leave it open so several can be changed in one go.
  panel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button.menu-item')) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      button.focus();
    }
  });
}
