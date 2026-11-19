import { describe, expect, it } from 'vitest';
import { readCountIn, writeCountIn } from './prefs';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('count-in preference', () => {
  it('is on by default', () => {
    expect(readCountIn(memoryStorage())).toBe(true);
    expect(readCountIn(null)).toBe(true);
  });

  it('remembers off and on', () => {
    const storage = memoryStorage();
    writeCountIn(false, storage);
    expect(readCountIn(storage)).toBe(false);
    writeCountIn(true, storage);
    expect(readCountIn(storage)).toBe(true);
  });

  it('falls back to on when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeCountIn(false, broken)).not.toThrow();
    expect(readCountIn(broken)).toBe(true);
  });
});
