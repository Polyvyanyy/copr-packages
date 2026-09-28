import { describe, expect, it } from 'vitest';
import { lessons } from './curriculum';
import {
  createInitialState,
  getActivityDates,
  getWritingDraft,
  getWritingHistory,
  parseLearningState,
  reviewWriting,
  reviewWritingAssignment,
  updateWritingDraft,
} from './progress';
import type { WritingAssignmentId, WritingVersion } from './types';
import { getWritingAssignment, writingAssignments } from './writing-assignments';

function assignment(id: string) {
  const result = writingAssignments.find((item) => item.id === id);
  if (!result) throw new Error(`Missing writing assignment: ${id}`);
  return result;
}

function checkResults(id: string, text: string) {
  return assignment(id).checks.map((check) => check.pattern.test(text));
}

describe('controlled writing assignments', () => {
  it('publishes four controlled tasks linked to known lessons', () => {
    expect(writingAssignments.map((item) => item.id)).toEqual([
      'introduction',
      'question',
      'location-existence',
      'reading-writing-action',
    ]);
    expect(new Set(writingAssignments.map((item) => item.id)).size).toBe(writingAssignments.length);

    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    for (const item of writingAssignments) {
      expect(lessonIds.has(item.lessonId)).toBe(true);
      expect(item.checks.length).toBeGreaterThanOrEqual(2);
      expect(item.checks.length).toBeLessThanOrEqual(3);
      expect(item.description).toContain('Проверяются только');
      expect(item.checks.every((check) => check.pattern instanceof RegExp)).toBe(true);
      expect(item.checks.every((check) => !check.pattern.global)).toBe(true);
    }

    expect(Object.fromEntries(writingAssignments.map((item) => [item.id, item.lessonId]))).toEqual({
      introduction: 'self-introduction',
      question: 'copula-questions',
      'location-existence': 'place-and-existence',
      'reading-writing-action': 'verb-forms',
    });
  });

  it('keeps the introduction conditions aligned with the legacy checker', () => {
    const introduction = assignment('introduction');
    expect(introduction.checks.map((check) => check.id)).toEqual(['topic', 'introduction']);
    expect(checkResults('introduction', 'はじめまして。わたしはあきです。')).toEqual([true, true]);
    expect(checkResults('introduction', 'わたしあきです。')).toEqual([false, false]);
    expect(
      reviewWriting('はじめまして。わたしはあきです。').checks.every((check) => check.passed),
    ).toBe(true);
  });

  it('matches only the shown copula-question form', () => {
    expect(checkResults('question', 'これはほんですか。')).toEqual([true, true, true]);
    expect(checkResults('question', 'これはほんです。')).toEqual([true, true, false]);
  });

  it('matches only the shown place-and-existence form', () => {
    expect(checkResults('location-existence', 'ここにほんがあります。')).toEqual([
      true,
      true,
      true,
    ]);
    expect(checkResults('location-existence', 'ここにほんがいます。')).toEqual([true, true, false]);
  });

  it('matches only the shown reading or writing actions', () => {
    expect(checkResults('reading-writing-action', 'ほんをよみます。')).toEqual([true, true, true]);
    expect(checkResults('reading-writing-action', 'てがみをかきます。')).toEqual([
      true,
      true,
      true,
    ]);
    expect(checkResults('reading-writing-action', 'ほんよみます。')).toEqual([false, true, false]);
  });

  it('uses deterministic task-specific checks without changing legacy introduction rules', () => {
    for (const text of [
      'はじめまして。わたしはあきです。',
      '私わあきです。',
      'わ た し は あ き で す 。',
      '私は学生です。',
      '',
    ]) {
      expect(reviewWritingAssignment(text, 'introduction')).toEqual(reviewWriting(text));
    }
    for (const item of writingAssignments) {
      const first = reviewWritingAssignment(item.example, item.id);
      expect(first.checks.map((check) => check.id)).toEqual(item.checks.map((check) => check.id));
      expect(first.checks.every((check) => check.passed)).toBe(true);
      expect(reviewWritingAssignment(item.example, item.id)).toEqual(first);
      expect(first.notes).toContain(
        'Проверяются только явные условия задания, а не вся грамматика текста.',
      );
    }
    expect(
      reviewWritingAssignment('これはほんです。', 'question').checks.map((check) => check.passed),
    ).toEqual([true, true, false]);
    expect(
      reviewWritingAssignment('ここにほんがいます。', 'location-existence').checks.map(
        (check) => check.passed,
      ),
    ).toEqual([true, true, false]);
    expect(
      reviewWritingAssignment('てがみをよみます。', 'reading-writing-action').checks.map(
        (check) => check.passed,
      ),
    ).toEqual([true, true, false]);
  });

  it('does not resolve unknown assignment ids to the introduction', () => {
    for (const id of ['unknown', '__proto__', 'constructor', 'prototype', '', null, undefined]) {
      expect(getWritingAssignment(id)).toBeUndefined();
    }
    expect(
      reviewWritingAssignment('わたしはあきです。', 'unknown' as WritingAssignmentId).checks,
    ).toEqual([]);
  });
});

describe('version-one writing storage', () => {
  const createdAt = '2024-01-02T12:00:00.000Z';
  const legacyVersion: WritingVersion = {
    id: 'legacy-introduction',
    text: 'わたしはあきです。',
    createdAt,
  };

  it('preserves legacy drafts and untagged history without expanding the initial state', () => {
    expect(createInitialState()).not.toHaveProperty('writingDrafts');
    expect(parseLearningState(JSON.stringify(createInitialState()))).toEqual(createInitialState());
    const parsed = parseLearningState({
      ...createInitialState(),
      writingDraft: 'わたしはみきです。',
      writingHistory: [legacyVersion],
    });

    expect(parsed.version).toBe(1);
    expect(parsed.writingDraft).toBe('わたしはみきです。');
    expect(parsed).not.toHaveProperty('writingDrafts');
    expect(parsed.writingHistory).toEqual([legacyVersion]);
    expect(getWritingHistory(parsed, 'introduction')).toEqual([legacyVersion]);
    expect(getWritingHistory(parsed, 'question')).toEqual([]);
    expect(parseLearningState(JSON.stringify(parsed))).toEqual(parsed);
  });

  it('round-trips separate drafts and versions for all four tasks', () => {
    const withDrafts = writingAssignments.reduce(
      (state, item) => updateWritingDraft(state, item.id, item.example),
      createInitialState(),
    );
    const writingHistory = writingAssignments.map((item) => ({
      id: `saved-${item.id}`,
      text: item.example,
      createdAt,
      ...(item.id === 'introduction' ? {} : { assignmentId: item.id }),
    }));
    const parsed = parseLearningState(JSON.stringify({ ...withDrafts, writingHistory }));

    expect(parsed.writingDraft).toBe(assignment('introduction').example);
    expect(parsed.writingDrafts).toEqual({
      question: assignment('question').example,
      'location-existence': assignment('location-existence').example,
      'reading-writing-action': assignment('reading-writing-action').example,
    });
    expect(parsed.writingHistory).toEqual(writingHistory);
    for (const item of writingAssignments) {
      expect(getWritingDraft(parsed, item.id)).toBe(item.example);
      expect(getWritingHistory(parsed, item.id)).toEqual([
        writingHistory.find((version) => version.id === `saved-${item.id}`),
      ]);
    }
    expect(parseLearningState(JSON.stringify(parsed))).toEqual(parsed);
  });

  it('updates only the selected draft without mutating existing state and omits an empty map', () => {
    const original = {
      ...createInitialState(),
      writingDraft: 'исходное представление',
      writingDrafts: { question: 'исходный вопрос' },
      writingHistory: [legacyVersion],
    };
    Object.freeze(original.writingDrafts);
    Object.freeze(original);
    const changed = updateWritingDraft(original, 'location-existence', 'новый текст');
    const changedIntroduction = updateWritingDraft(changed, 'introduction', 'новое представление');

    expect(original.writingDrafts).toEqual({ question: 'исходный вопрос' });
    expect(changedIntroduction.writingDrafts).toEqual({
      question: 'исходный вопрос',
      'location-existence': 'новый текст',
    });
    expect(changedIntroduction.writingDraft).toBe('новое представление');
    expect(changedIntroduction.writingHistory).toBe(original.writingHistory);
    const clearedQuestion = updateWritingDraft(changedIntroduction, 'question', '');
    expect(clearedQuestion.writingDrafts).toEqual({ 'location-existence': 'новый текст' });
    const cleared = updateWritingDraft(clearedQuestion, 'location-existence', '');
    expect(cleared).not.toHaveProperty('writingDrafts');
    expect(cleared.writingDraft).toBe('новое представление');
    expect(getActivityDates(cleared)).toEqual(getActivityDates(original));
    expect(updateWritingDraft(original, '__proto__' as WritingAssignmentId, 'unsafe')).toBe(
      original,
    );
    expect(getWritingDraft(original, 'unknown' as WritingAssignmentId)).toBe('');
    expect(getWritingHistory(original, 'unknown' as WritingAssignmentId)).toEqual([]);
  });

  it('imports only bounded known non-introduction drafts and drops unsafe keys', () => {
    const writingDrafts = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"unsafe","prototype":"unsafe","question":"これはほんですか。","introduction":"must not replace legacy","unknown":"discard"}',
    );
    writingDrafts['location-existence'] = 'あ'.repeat(20_001);
    writingDrafts['reading-writing-action'] = 123;
    for (let index = 0; index < 1_000; index++) writingDrafts[`unknown-${index}`] = 'discard';
    const parsed = parseLearningState({
      ...createInitialState(),
      writingDraft: 'legacy',
      writingDrafts,
    });

    expect(parsed.writingDraft).toBe('legacy');
    expect(parsed.writingDrafts).toEqual({ question: 'これはほんですか。' });
    expect(Object.getPrototypeOf(parsed.writingDrafts)).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(Object.hasOwn(parsed.writingDrafts!, '__proto__')).toBe(false);
    expect(parseLearningState(JSON.stringify(parsed))).toEqual(parsed);
  });

  it.each([null, [], 'invalid', {}, { question: '' }, { introduction: 'ignored' }])(
    'omits absent or empty additional draft maps: %j',
    (writingDrafts) => {
      expect(parseLearningState({ ...createInitialState(), writingDrafts })).toEqual(
        createInitialState(),
      );
    },
  );

  it('retains the existing text bounds, including legacy texts longer than the editor limit', () => {
    const text = 'あ'.repeat(20_000);
    const parsed = parseLearningState({
      ...createInitialState(),
      writingDraft: text,
      writingDrafts: { question: text },
      writingHistory: [{ ...legacyVersion, text }],
    });
    expect(parsed.writingDraft).toBe(text);
    expect(parsed.writingDrafts?.question).toBe(text);
    expect(parsed.writingHistory[0].text).toBe(text);
    const oversized = parseLearningState({
      ...createInitialState(),
      writingDraft: `${text}あ`,
      writingDrafts: { question: `${text}あ` },
      writingHistory: [{ ...legacyVersion, text: `${text}あ` }],
    });
    expect(oversized).toEqual(createInitialState());
    expect(updateWritingDraft(parsed, 'question', `${text}あ`)).toBe(parsed);
  });

  it('never reclassifies a malformed or unknown version assignment as an introduction', () => {
    const invalidVersions = [
      'future-task',
      '__proto__',
      'constructor',
      'prototype',
      '',
      null,
      undefined,
      123,
    ].map((assignmentId, index) => ({
      ...legacyVersion,
      id: `invalid-${index}`,
      assignmentId,
    }));
    const explicitIntroduction = {
      ...legacyVersion,
      id: 'explicit-introduction',
      assignmentId: 'introduction',
    };
    const parsed = parseLearningState({
      ...createInitialState(),
      writingHistory: [...invalidVersions, legacyVersion, explicitIntroduction],
    });

    expect(parsed.writingHistory).toEqual([legacyVersion, explicitIntroduction]);
    expect(getWritingHistory(parsed, 'introduction')).toEqual([
      legacyVersion,
      explicitIntroduction,
    ]);
    expect(
      parseLearningState({ ...createInitialState(), writingHistory: invalidVersions }),
    ).toEqual(createInitialState());
    expect(
      parseLearningState(
        JSON.stringify({
          ...createInitialState(),
          writingHistory: [{ ...legacyVersion, assignmentId: 'future-task' }],
        }),
      ),
    ).toEqual(createInitialState());
  });

  it('bounds shared history at 100 versions and rejects duplicate or invalid records', () => {
    const versions = Array.from({ length: 100 }, (_, index) => ({
      ...legacyVersion,
      id: `question-${index}`,
      assignmentId: 'question',
    }));
    expect(
      parseLearningState({ ...createInitialState(), writingHistory: versions }).writingHistory,
    ).toEqual(versions);
    expect(
      parseLearningState({ ...createInitialState(), writingHistory: [...versions, legacyVersion] }),
    ).toEqual(createInitialState());
    expect(
      parseLearningState({
        ...createInitialState(),
        writingHistory: [
          versions[0],
          versions[0],
          { ...legacyVersion, id: '__proto__' },
          { ...legacyVersion, createdAt: '2999-01-01T00:00:00.000Z' },
        ],
      }).writingHistory,
    ).toEqual([versions[0]]);
  });
});
