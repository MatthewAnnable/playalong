/**
 * Below this board width (CSS px) the hand picture is too small to read, so
 * the board shows four numbered finger dots instead: phones and iPads held
 * upright get the dots; a laptop or an iPad on its side gets the hand.
 */
export const HAND_LEGEND_MIN_WIDTH = 900;

export function fingerLegendStyle(boardWidth: number): 'hand' | 'dots' {
  return boardWidth >= HAND_LEGEND_MIN_WIDTH ? 'hand' : 'dots';
}
