import { describe, expect, it } from 'vitest';
import { analyse, diatonicChords, parseKey, pretty } from './analysis';
import { parseChart } from './chart';

const G = parseKey('G major')!;
const Em = parseKey('Em')!;
const Bb = parseKey('Bb')!;

const pick = (symbol: string, key = G) => {
  const a = analyse(symbol, key);
  return [a.numeral, a.fn, a.outside];
};

describe('parseKey', () => {
  it('reads major and minor in the usual spellings', () => {
    expect(parseKey('G')).toMatchObject({ tonic: 7, mode: 'major' });
    expect(parseKey('E minor')).toMatchObject({ tonic: 4, mode: 'minor' });
    expect(parseKey('F# min')).toMatchObject({ tonic: 6, mode: 'minor' });
    expect(parseKey('Bb major')).toMatchObject({ tonic: 10, mode: 'major' });
    expect(parseKey('H')).toBeNull();
  });
});

describe('analyse in a major key', () => {
  it('names the seven chords of the key and their families', () => {
    expect(pick('G')).toEqual(['I', 'T', false]);
    expect(pick('Am')).toEqual(['ii', 'S', false]);
    expect(pick('Bm')).toEqual(['iii', 'T', false]);
    expect(pick('C')).toEqual(['IV', 'S', false]);
    expect(pick('D')).toEqual(['V', 'D', false]);
    expect(pick('Em')).toEqual(['vi', 'T', false]);
    expect(pick('F#dim')).toEqual(['vii°', 'D', false]);
  });

  it('keeps sevenths, extensions and slash chords in the key', () => {
    expect(pick('D7')).toEqual(['V7', 'D', false]);
    expect(pick('Cmaj7')).toEqual(['IVmaj7', 'S', false]);
    expect(pick('Am7')).toEqual(['ii7', 'S', false]);
    expect(pick('F#m7b5')).toEqual(['viiø7', 'D', false]);
    expect(pick('Cadd9')).toEqual(['IV', 'S', false]);
    expect(pick('G/B')).toEqual(['I', 'T', false]);
    expect(pick('Dsus4')).toEqual(['V', 'D', false]);
    expect(pick('E5')).toEqual(['vi', 'T', false]);
  });

  it('marks chords borrowed from the parallel minor', () => {
    expect(pick('Cm')).toEqual(['iv', 'S', true]);
    expect(pick('F')).toEqual(['♭VII', 'S', true]);
    expect(pick('Eb')).toEqual(['♭VI', 'S', true]);
    expect(pick('Bb')).toEqual(['♭III', 'T', true]);
    expect(analyse('Cm', G).note).toBe('borrowed from G minor');
  });

  it('names secondary dominants', () => {
    expect(pick('A')).toEqual(['V/V', 'D', true]);
    expect(pick('E7')).toEqual(['V7/ii', 'D', true]);
    expect(pick('B7')).toEqual(['V7/vi', 'D', true]);
    expect(pick('G7')).toEqual(['V7/IV', 'D', true]);
  });

  it('leaves anything it cannot place without a family', () => {
    expect(pick('C#')).toEqual(['♯IV', null, true]);
  });

  it('works in flat keys', () => {
    expect(pick('Eb', Bb)).toEqual(['IV', 'S', false]);
    expect(pick('F7', Bb)).toEqual(['V7', 'D', false]);
    expect(pick('Ab', Bb)).toEqual(['♭VII', 'S', true]);
  });
});

describe('analyse in a minor key', () => {
  it('uses natural minor plus the harmonic-minor dominant', () => {
    expect(pick('Em', Em)).toEqual(['i', 'T', false]);
    expect(pick('G', Em)).toEqual(['III', 'T', false]);
    expect(pick('Am', Em)).toEqual(['iv', 'S', false]);
    expect(pick('C', Em)).toEqual(['VI', 'S', false]);
    expect(pick('D', Em)).toEqual(['VII', 'D', false]);
    expect(pick('B7', Em)).toEqual(['V7', 'D', false]);
    expect(pick('Bm', Em)).toEqual(['v', 'D', false]);
    expect(pick('D#dim', Em)).toEqual(['vii°', 'D', false]);
  });

  it('reads a major IV as borrowed, not a secondary dominant', () => {
    expect(pick('A', Em)).toEqual(['IV', 'S', true]);
    expect(analyse('A', Em).note).toBe('borrowed from E major');
  });
});

describe('diatonicChords', () => {
  it('spells the chords of the key with the right letters', () => {
    expect(diatonicChords(G).map((c) => c.name)).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F♯°']);
    expect(diatonicChords(Bb).map((c) => c.name)).toEqual(['B♭', 'Cm', 'Dm', 'E♭', 'F', 'Gm', 'A°']);
    expect(diatonicChords(Em).map((c) => c.numeral)).toEqual(['i', 'ii°', 'III', 'iv', 'V', 'VI', 'VII']);
  });
});

describe('pretty', () => {
  it('sets sharps and flats properly', () => {
    expect(pretty('Bb')).toBe('B♭');
    expect(pretty('F#m7b5')).toBe('F♯m7♭5');
  });
});

describe('parseChart', () => {
  const chart = parseChart(`
title: Test progression
key: G major
tempo: 96
count-in: 1

[Verse]
| G | Em | C | Cm |   # a comment
| G C | D . . G | % |
| F#m7b5 | A{V/V:D} | N.C. |
`);

  it('reads the header', () => {
    expect(chart).toMatchObject({ title: 'Test progression', tempo: 96, beatsPerBar: 4, countInBars: 1 });
    expect(chart.key).toMatchObject({ tonic: 7, mode: 'major' });
    expect(chart.warnings).toEqual([]);
  });

  it('times the chords', () => {
    const spans = chart.chords.map((c) => [c.symbol, c.startBeat, c.beats]);
    expect(spans).toEqual([
      ['G', 0, 4],
      ['Em', 4, 4],
      ['C', 8, 4],
      ['Cm', 12, 4],
      ['G', 16, 2],
      ['C', 18, 2],
      ['D', 20, 3],
      ['G', 23, 1],
      // % repeats "D . . G", and the G carries straight on from the bar before
      ['D', 24, 3],
      ['G', 27, 1],
      ['F#m7b5', 28, 4],
      ['A', 32, 4],
      ['N.C.', 36, 4],
    ]);
    expect(chart.totalBeats).toBe(40);
    expect(chart.chords[0].section).toBe('Verse');
  });

  it('merges a chord held across bars into one block', () => {
    const held = parseChart('key: C\n| C | C | F |');
    expect(held.chords.map((c) => [c.symbol, c.beats])).toEqual([['C', 8], ['F', 4]]);
  });

  it('applies overrides', () => {
    const a = chart.chords.find((c) => c.symbol === 'A')!;
    expect(a.analysis).toMatchObject({ numeral: 'V/V', fn: 'D' });
    const famOnly = parseChart('key: G\n| Em{:S} |').chords[0].analysis;
    expect(famOnly).toMatchObject({ numeral: 'vi', fn: 'S' });
  });

  it('follows a key change', () => {
    const c = parseChart('key: C\n| G |\nkey: G\n| G |');
    expect(c.chords.map((x) => x.analysis.numeral)).toEqual(['V', 'I']);
  });
});
