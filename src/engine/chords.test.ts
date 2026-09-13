import { describe, expect, it } from 'vitest';
import { nameChord } from './chords';

// MIDI: C3 = 48, E3 = 52, G3 = 55, A2 = 45, D3 = 50, B2 = 47
describe('nameChord', () => {
  it('names open-position major and minor shapes', () => {
    expect(nameChord([48, 52, 55])).toBe('C');
    expect(nameChord([45, 48, 52])).toBe('Am');
    expect(nameChord([43, 47, 50, 55])).toBe('G');
  });

  it('names power chords, which is most of rock guitar', () => {
    expect(nameChord([40, 47])).toBe('E5');
    expect(nameChord([38, 45, 50])).toBe('D5');
  });

  it('names sevenths and suspensions', () => {
    expect(nameChord([43, 47, 50, 53])).toBe('G7');
    expect(nameChord([45, 48, 52, 55])).toBe('Am7');
    expect(nameChord([50, 55, 57])).toBe('Dsus4');
    expect(nameChord([50, 52, 57])).toBe('Dsus2');
  });

  it('writes a slash chord when the bass is not the root', () => {
    expect(nameChord([43, 48, 52])).toBe('C/G');
  });

  it('ignores octave doubling, which a six-string shape is full of', () => {
    expect(nameChord([48, 52, 55, 60, 64])).toBe('C');
  });

  it('returns null rather than guessing at a shape it does not know', () => {
    expect(nameChord([48, 49, 50])).toBeNull();
    expect(nameChord([60])).toBeNull();
    expect(nameChord([])).toBeNull();
  });
});
