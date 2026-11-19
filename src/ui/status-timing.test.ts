import { describe, expect, it } from 'vitest';
import { statusHoldMs } from './status-timing';

describe('statusHoldMs', () => {
  it('keeps errors up', () => {
    expect(statusHoldMs("Couldn't open the file", true)).toBeNull();
  });

  it('fades ordinary messages after a few seconds', () => {
    const short = statusHoldMs('Loaded.', false)!;
    expect(short).toBeGreaterThanOrEqual(3000);
    expect(short).toBeLessThan(4000);
  });

  it('gives longer messages longer, up to a limit', () => {
    expect(statusHoldMs('x'.repeat(60), false)!).toBeGreaterThan(statusHoldMs('x', false)!);
    expect(statusHoldMs('x'.repeat(500), false)).toBe(7000);
  });
});
