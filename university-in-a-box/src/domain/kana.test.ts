import { describe, expect, it } from 'vitest';
import { lessons } from './curriculum';
import { kanaRows } from './kana';

const baseHiragana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const baseKatakana = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

describe('kana chart', () => {
  it('exports the complete paired base chart', () => {
    const baseRows = kanaRows.filter((row) => row.id.startsWith('base-'));
    const hiragana = baseRows.flatMap((row) => row.hiragana).join('');
    const katakana = baseRows.flatMap((row) => row.katakana).join('');

    expect(baseRows).toHaveLength(10);
    expect(hiragana).toHaveLength(46);
    expect(katakana).toHaveLength(46);
    expect(hiragana).toBe(baseHiragana);
    expect(katakana).toBe(baseKatakana);
  });

  it('includes standard diacritics and documented small-form combinations', () => {
    const diacritics = kanaRows.filter((row) => row.id.startsWith('diacritic-'));
    const combinations = kanaRows.filter((row) => row.id.startsWith('combo-'));

    expect(diacritics.flatMap((row) => row.hiragana)).toHaveLength(25);
    expect(diacritics.flatMap((row) => row.katakana)).toHaveLength(25);
    expect(combinations).toHaveLength(11);
    expect(combinations.every((row) => row.hiragana.length === 3)).toBe(true);
    expect(kanaRows.map((row) => row.id)).toEqual(expect.arrayContaining(['small-tsu', 'long-vowel-mark']));
  });

  it('keeps rows internally aligned and links them to a published lesson', () => {
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));

    for (const row of kanaRows) {
      expect(row.hiragana.length).toBeGreaterThan(0);
      expect(row.hiragana.length).toBe(row.katakana.length);
      expect(row.hiragana.length).toBe(row.romanization.length);
      expect(lessonIds.has(row.lessonId)).toBe(true);
    }

    expect(new Set(kanaRows.map((row) => row.id)).size).toBe(kanaRows.length);
  });
});
