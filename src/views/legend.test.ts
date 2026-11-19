import { describe, expect, it } from 'vitest';
import { HAND_LEGEND_MIN_WIDTH, fingerLegendStyle } from './legend';

describe('fingerLegendStyle', () => {
  it('draws the hand on a wide board', () => {
    expect(fingerLegendStyle(1200)).toBe('hand');
    expect(fingerLegendStyle(HAND_LEGEND_MIN_WIDTH)).toBe('hand');
  });

  it('draws dots on a phone-sized board', () => {
    expect(fingerLegendStyle(343)).toBe('dots');
    expect(fingerLegendStyle(HAND_LEGEND_MIN_WIDTH - 1)).toBe('dots');
  });
});
