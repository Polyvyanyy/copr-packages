import { describe, expect, it } from 'vitest';
import { connections } from './connections';
import { diagnosticQuestions, flashcards, lessons, sources } from './curriculum';
import {
  addAttempt,
  createAttempt,
  createInitialState,
  DIAGNOSTIC_SKIP_ANSWER_ID,
  getActivityDates,
  getCourseStats,
  getDiagnosticResult,
  getLessonStatus,
  getNextLesson,
  isLessonCompleted,
  mergeActivityDateLedger,
  parseLearningState,
  reviewWriting,
  scheduleReview,
} from './progress';
import type { Answer, Lesson } from './types';

const fixtureLesson = (questions = 5): Lesson => ({
  id: 'fixture-lesson',
  moduleId: 'fixture-module',
  title: 'Fixture',
  japaneseTitle: 'テスト',
  description: 'Test lesson',
  durationMinutes: 5,
  skill: 'grammar',
  objectives: [],
  blocks: [],
  exercises: Array.from({ length: questions }, (_, index) => ({
    id: `fixture-question-${index + 1}`,
    prompt: `Question ${index + 1}`,
    options: [
      { id: `fixture-question-${index + 1}-correct`, label: 'Correct' },
      { id: `fixture-question-${index + 1}-wrong`, label: 'Wrong' },
    ],
    answerId: `fixture-question-${index + 1}-correct`,
    explanation: 'Fixture explanation',
    hint: 'Fixture hint',
  })),
  sourceIds: [],
});

const practiceLesson = fixtureLesson();
const knownLesson = lessons.find((lesson) => lesson.exercises.length >= 5);
const anotherKnownLesson = lessons.find((lesson) => lesson.id !== knownLesson?.id);

if (!knownLesson || !anotherKnownLesson)
  throw new Error('The Japanese curriculum needs at least two lessons.');

function date(day: number, minute = 0): Date {
  return new Date(Date.UTC(2024, 0, day, 12, minute));
}

function answersFor(lesson: Lesson, correct = lesson.exercises.length, assisted = false): Answer[] {
  return lesson.exercises.map((exercise, index) => ({
    exerciseId: exercise.id,
    choiceId:
      index < correct
        ? exercise.answerId
        : (exercise.options.find((option) => option.id !== exercise.answerId)?.id ??
          exercise.answerId),
    assisted,
  }));
}

function localDay(value: Date): string {
  return `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

describe('learning state defaults', () => {
  it('starts with the requested goal and no progress', () => {
    expect(createInitialState()).toEqual({
      version: 1,
      goal: { minutesPerDay: 20, daysPerWeek: 4, purpose: 'foundation' },
      diagnostic: null,
      attempts: [],
      cardReviews: {},
      activityDateLedger: [],
      savedCardIds: [],
      savedSourceIds: [],
      writingDraft: '',
      writingHistory: [],
      reflections: {},
    });
  });
});

describe('attempt assessment', () => {
  it('derives correct and total from answer ids rather than caller fields', () => {
    const attempt = createAttempt(
      practiceLesson,
      answersFor(practiceLesson, 4),
      date(1),
      'derived-score',
    );

    expect(attempt).toMatchObject({ correct: 4, total: 5, assisted: false });
    expect(attempt.answers.map((answer) => answer.exerciseId)).toEqual(
      practiceLesson.exercises.map((exercise) => exercise.id),
    );
  });

  it('does not create a score from duplicate or invalid answers', () => {
    const valid = answersFor(practiceLesson);
    const duplicate = [valid[0], valid[0], ...valid.slice(2)];
    const invalidChoice = valid.map((answer, index) =>
      index === 0 ? { ...answer, choiceId: 'made-up-choice' } : answer,
    );
    const unknownExercise = valid.map((answer, index) =>
      index === 0 ? { ...answer, exerciseId: 'removed-question' } : answer,
    );

    expect(createAttempt(practiceLesson, duplicate, date(1), 'duplicate').correct).toBe(0);
    expect(createAttempt(practiceLesson, invalidChoice, date(1), 'invalid-choice').answers).toEqual(
      [],
    );
    expect(
      createAttempt(practiceLesson, unknownExercise, date(1), 'unknown-exercise').correct,
    ).toBe(0);
  });

  it('requires all questions exactly once before practice can count', () => {
    const incomplete = createAttempt(
      practiceLesson,
      answersFor(practiceLesson).slice(0, 4),
      date(1),
      'incomplete',
    );

    expect(incomplete.total).toBe(5);
    expect(isLessonCompleted(practiceLesson, [incomplete])).toBe(false);
  });

  it('does not count assisted practice as an unassisted passed lesson', () => {
    const assisted = createAttempt(
      practiceLesson,
      answersFor(practiceLesson, 5, true),
      date(1),
      'assisted',
    );
    const declaredAssisted = {
      ...createAttempt(practiceLesson, answersFor(practiceLesson), date(1), 'declared-assisted'),
      assisted: true,
    };

    expect(assisted).toMatchObject({ correct: 5, assisted: true });
    expect(isLessonCompleted(practiceLesson, [assisted])).toBe(false);
    expect(isLessonCompleted(practiceLesson, [declaredAssisted])).toBe(false);
  });

  it('uses an 80% unassisted threshold', () => {
    const exactlyEnough = createAttempt(
      practiceLesson,
      answersFor(practiceLesson, 4),
      date(1),
      'eighty',
    );
    const belowThreshold = createAttempt(
      practiceLesson,
      answersFor(practiceLesson, 3),
      date(1),
      'sixty',
    );

    expect(isLessonCompleted(practiceLesson, [exactlyEnough])).toBe(true);
    expect(isLessonCompleted(practiceLesson, [belowThreshold])).toBe(false);
  });

  it('cannot be completed by forging stored correct and total fields', () => {
    const forged = {
      ...createAttempt(practiceLesson, answersFor(practiceLesson, 0), date(1), 'forged'),
      correct: 5,
      total: 5,
      assisted: false,
    };

    expect(isLessonCompleted(practiceLesson, [forged])).toBe(false);
  });

  it('canonicalizes accepted known attempts in addAttempt', () => {
    const forged = {
      ...createAttempt(knownLesson, answersFor(knownLesson, 0), date(1), 'known-forged'),
      correct: 99,
      total: 1,
      assisted: false,
    };
    const state = addAttempt(createInitialState(), forged);

    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]).toMatchObject({ correct: 0, total: knownLesson.exercises.length });
    expect(isLessonCompleted(knownLesson, state.attempts)).toBe(false);
  });

  it('is idempotent for duplicate attempt ids', () => {
    const attempt = createAttempt(knownLesson, answersFor(knownLesson), date(1), 'same-attempt');
    const once = addAttempt(createInitialState(), attempt);
    const twice = addAttempt(once, { ...attempt, correct: 0 });

    expect(twice).toBe(once);
    expect(twice.attempts).toHaveLength(1);
  });

  it('compacts redundant history at capacity without losing retained evidence', () => {
    const first = createAttempt(
      knownLesson,
      answersFor(knownLesson),
      date(1),
      'retention-witness-one',
    );
    const second = createAttempt(
      knownLesson,
      answersFor(knownLesson),
      date(8),
      'retention-witness-two',
    );
    const redundant = Array.from({ length: 498 }, (_, index) =>
      createAttempt(
        knownLesson,
        answersFor(knownLesson, 0),
        new Date(Date.UTC(2024, 1, index + 1, 12)),
        `redundant-${index}`,
      ),
    );
    const incoming = createAttempt(
      anotherKnownLesson,
      answersFor(anotherKnownLesson),
      new Date(Date.now() - 1_000),
      'attempt-501',
    );
    const state = { ...createInitialState(), attempts: [first, second, ...redundant] };
    const compacted = addAttempt(state, incoming);

    expect(compacted.attempts).toHaveLength(500);
    expect(compacted.attempts.some((attempt) => attempt.id === incoming.id)).toBe(true);
    expect(isLessonCompleted(knownLesson, compacted.attempts)).toBe(true);
    expect(
      getLessonStatus(knownLesson, compacted.attempts, new Date('2026-01-01T00:00:00.000Z')),
    ).toBe('retained');
  });

  it('keeps a previous passed attempt when a retry fails', () => {
    const passed = createAttempt(knownLesson, answersFor(knownLesson), date(1), 'passed');
    const failed = createAttempt(knownLesson, answersFor(knownLesson, 0), date(2), 'failed');
    const state = addAttempt(addAttempt(createInitialState(), passed), failed);

    expect(state.attempts).toHaveLength(2);
    expect(isLessonCompleted(knownLesson, state.attempts)).toBe(true);
  });
});

describe('lesson progression', () => {
  it('distinguishes new, practising and completed lessons', () => {
    const failed = createAttempt(
      practiceLesson,
      answersFor(practiceLesson, 0),
      date(1),
      'status-failed',
    );
    const passed = createAttempt(
      practiceLesson,
      answersFor(practiceLesson),
      date(1),
      'status-passed',
    );

    expect(getLessonStatus(practiceLesson, [], date(1))).toBe('new');
    expect(getLessonStatus(practiceLesson, [failed], date(1))).toBe('practising');
    expect(getLessonStatus(practiceLesson, [passed], date(1))).toBe('completed');
  });

  it('makes a passed lesson review-due exactly seven days later', () => {
    const passed = createAttempt(practiceLesson, answersFor(practiceLesson), date(1), 'delayed');

    expect(getLessonStatus(practiceLesson, [passed], date(7))).toBe('completed');
    expect(getLessonStatus(practiceLesson, [passed], date(8))).toBe('review-due');
  });

  it('does not postpone a due review when a later retry fails', () => {
    const passed = createAttempt(
      practiceLesson,
      answersFor(practiceLesson),
      date(1),
      'passed-before-retry',
    );
    const failed = createAttempt(
      practiceLesson,
      answersFor(practiceLesson, 0),
      date(8),
      'failed-retry',
    );

    expect(getLessonStatus(practiceLesson, [passed, failed], date(8))).toBe('review-due');
  });

  it('marks a lesson retained only after distinct qualifying attempts seven days apart', () => {
    const first = createAttempt(
      practiceLesson,
      answersFor(practiceLesson),
      date(1),
      'retained-one',
    );
    const tooSoon = createAttempt(
      practiceLesson,
      answersFor(practiceLesson),
      date(7),
      'retained-soon',
    );
    const delayed = createAttempt(
      practiceLesson,
      answersFor(practiceLesson),
      date(8),
      'retained-two',
    );

    expect(getLessonStatus(practiceLesson, [first, tooSoon], date(7))).toBe('completed');
    expect(getLessonStatus(practiceLesson, [first, delayed], date(8))).toBe('retained');
  });

  it('prioritizes review-due lessons, then the first unfinished lesson', () => {
    const dueAttempt = createAttempt(
      knownLesson,
      answersFor(knownLesson),
      new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      'due-first',
    );
    const dueState = addAttempt(createInitialState(), dueAttempt);
    const completedNow = createAttempt(
      knownLesson,
      answersFor(knownLesson),
      new Date(),
      'complete-now',
    );
    const freshState = addAttempt(createInitialState(), completedNow);

    expect(getNextLesson([knownLesson, anotherKnownLesson], dueState)).toBe(knownLesson);
    expect(getNextLesson([knownLesson, anotherKnownLesson], freshState)).toBe(anotherKnownLesson);
  });
});

describe('card review scheduling and statistics', () => {
  it('uses the requested initial intervals for again, good and easy', () => {
    const now = date(1);

    expect(scheduleReview(undefined, 'again', now)).toMatchObject({
      intervalDays: 0,
      reviews: 1,
      dueAt: date(1, 10).toISOString(),
    });
    expect(scheduleReview(undefined, 'good', now)).toMatchObject({
      intervalDays: 1,
      reviews: 1,
      dueAt: date(2).toISOString(),
    });
    expect(scheduleReview(undefined, 'easy', now)).toMatchObject({
      intervalDays: 3,
      reviews: 1,
      dueAt: date(4).toISOString(),
    });
  });

  it('expands intervals and caps them while retaining the total review count', () => {
    let review = scheduleReview(undefined, 'easy', date(1));
    review = scheduleReview(review, 'good', date(2));
    expect(review.intervalDays).toBe(6);

    for (let index = 0; index < 10; index += 1)
      review = scheduleReview(review, 'easy', date(index + 3));
    expect(review.intervalDays).toBeLessThanOrEqual(365);
    expect(review.reviews).toBe(12);
  });

  it('keeps card review counts separate from lesson completion', () => {
    const review = scheduleReview(undefined, 'good', date(1));
    const state = { ...createInitialState(), cardReviews: { [flashcards[0].id]: review } };
    const stats = getCourseStats(state, [knownLesson, anotherKnownLesson]);

    expect(stats).toMatchObject({
      completed: 0,
      total: 2,
      reviewedCards: 1,
      totalReviews: 1,
      percentage: 0,
    });
  });

  it('counts repeated qualifying attempts as one completed lesson', () => {
    const first = createAttempt(knownLesson, answersFor(knownLesson), date(1), 'repeat-one');
    const second = createAttempt(knownLesson, answersFor(knownLesson), date(8), 'repeat-two');
    const state = addAttempt(addAttempt(createInitialState(), first), second);

    expect(getCourseStats(state, [knownLesson])).toMatchObject({
      completed: 1,
      total: 1,
      percentage: 100,
    });
  });
});

describe('storage validation', () => {
  it('returns a fresh state for corrupt JSON and a wrong version', () => {
    expect(parseLearningState('{not JSON')).toEqual(createInitialState());
    expect(parseLearningState({ ...createInitialState(), version: 2 })).toEqual(
      createInitialState(),
    );
  });

  it('rederives a parsed attempt score from valid stored answer ids', () => {
    const forged = {
      ...createAttempt(knownLesson, answersFor(knownLesson, 0), date(1), 'storage-forged'),
      correct: knownLesson.exercises.length,
      total: 1,
      assisted: false,
    };
    const state = parseLearningState({ ...createInitialState(), attempts: [forged] });

    expect(state.attempts[0]).toMatchObject({ correct: 0, total: knownLesson.exercises.length });
    expect(isLessonCompleted(knownLesson, state.attempts)).toBe(false);
  });

  it('drops stale lessons, invalid answers, duplicate ids and future attempts', () => {
    const valid = createAttempt(knownLesson, answersFor(knownLesson), date(1), 'valid-stored');
    const invalidAnswer = {
      ...valid,
      id: 'bad-answer',
      answers: [{ ...valid.answers[0], choiceId: 'unknown-option' }],
    };
    const staleLesson = { ...valid, id: 'stale-lesson', lessonId: 'removed-lesson' };
    const duplicate = { ...valid, correct: 0 };
    const future = { ...valid, id: 'future-attempt', completedAt: '2999-01-01T00:00:00.000Z' };
    const state = parseLearningState({
      ...createInitialState(),
      attempts: [valid, invalidAnswer, staleLesson, duplicate, future],
    });

    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0].id).toBe('valid-stored');
  });

  it('rejects oversized arrays and ignores dangerous or stale record keys', () => {
    const oversized = Array.from({ length: 501 }, () => ({ id: 'any' }));
    const review = scheduleReview(undefined, 'good', date(1));
    const state = parseLearningState(
      [
        '{"version":1,"attempts":',
        JSON.stringify(oversized),
        ',"cardReviews":{"__proto__":{"polluted":true},"removed-card":',
        JSON.stringify(review),
        '},"reflections":{"constructor":"nope","removed-lesson":"stale"}}',
      ].join(''),
    );

    expect(state.attempts).toEqual([]);
    expect(state.cardReviews).toEqual({});
    expect(state.reflections).toEqual({});
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('keeps only known saved references and bounded valid state values', () => {
    const state = parseLearningState({
      ...createInitialState(),
      goal: { minutesPerDay: 30, daysPerWeek: 5, purpose: 'reading' },
      savedCardIds: [flashcards[0].id, 'unknown-card', flashcards[0].id],
      savedSourceIds: [sources[0].id, 'unknown-source'],
      writingDraft: 'わたしはあきです。',
    });

    expect(state.goal).toEqual({ minutesPerDay: 30, daysPerWeek: 5, purpose: 'reading' });
    expect(state.savedCardIds).toEqual([flashcards[0].id]);
    expect(state.savedSourceIds).toEqual([sources[0].id]);
    expect(state.writingDraft).toBe('わたしはあきです。');
  });

  it('preserves known connection notes and legacy lesson reflections only', () => {
    const state = parseLearningState(
      `{"version":1,"reflections":{"${connections[0].id}":"Первая заметка","${connections[1].id}":"Вторая заметка","${connections[2].id}":"Третья заметка","${knownLesson.id}":"Старая заметка урока","unknown-reflection":"Не сохранять","__proto__":"Не сохранять","constructor":"Не сохранять"}}`,
    );

    expect(state.reflections).toEqual({
      [connections[0].id]: 'Первая заметка',
      [connections[1].id]: 'Вторая заметка',
      [connections[2].id]: 'Третья заметка',
      [knownLesson.id]: 'Старая заметка урока',
    });
  });
});

describe('diagnostic recommendation', () => {
  const correctAnswers = diagnosticQuestions.map((question) => question.answerId);

  it('uses the first uncovered prerequisite instead of an aggregate score', () => {
    const fourOfFive = [...correctAnswers];
    fourOfFive[0] = DIAGNOSTIC_SKIP_ANSWER_ID;
    const throughVowels = [...correctAnswers];
    throughVowels[1] = DIAGNOSTIC_SKIP_ANSWER_ID;
    const throughKRow = [...correctAnswers];
    throughKRow[2] = DIAGNOSTIC_SKIP_ANSWER_ID;

    expect(diagnosticQuestions).toHaveLength(5);
    expect(
      diagnosticQuestions[0].options.find((option) => option.id === diagnosticQuestions[0].answerId)
        ?.label,
    ).toBe('あいうえお');
    expect(
      diagnosticQuestions[1].options.find((option) => option.id === diagnosticQuestions[1].answerId)
        ?.label,
    ).toBe('かきくけこ');
    expect(getDiagnosticResult(fourOfFive)).toMatchObject({
      correct: 4,
      total: 5,
      recommendedLessonId: 'hiragana-vowels',
    });
    expect(getDiagnosticResult(throughVowels).recommendedLessonId).toBe('hiragana-k');
    expect(getDiagnosticResult(throughKRow).recommendedLessonId).toBe('hiragana-s');
    expect(getDiagnosticResult(correctAnswers).recommendedLessonId).toBe('hiragana-s');
  });

  it('does not treat the legacy five-question diagnostic as evidence for new kana rows', () => {
    expect(lessons.slice(0, 3).map((lesson) => lesson.id)).toEqual([
      'hiragana-vowels',
      'hiragana-k',
      'hiragana-s',
    ]);
    expect(getDiagnosticResult(correctAnswers)).toEqual({
      correct: 5,
      total: 5,
      recommendedLessonId: 'hiragana-s',
    });
  });

  it('rederives diagnostic score and recommendation from all five stored answers', () => {
    const completedAt = date(1).toISOString();
    const state = parseLearningState({
      ...createInitialState(),
      diagnostic: {
        correct: 0,
        total: 5,
        completedAt,
        recommendedLessonId: 'self-introduction',
        answerIds: correctAnswers,
      },
    });

    expect(state.diagnostic).toEqual({
      ...getDiagnosticResult(correctAnswers),
      completedAt,
      answerIds: correctAnswers,
    });
  });

  it('rejects malformed new diagnostics and safely migrates answerless legacy records', () => {
    const completedAt = date(1).toISOString();
    const malformed = parseLearningState({
      ...createInitialState(),
      diagnostic: {
        correct: 5,
        total: 4,
        completedAt,
        recommendedLessonId: 'self-introduction',
        answerIds: correctAnswers,
      },
    });
    const unknownAnswer = parseLearningState({
      ...createInitialState(),
      diagnostic: {
        correct: 5,
        total: 5,
        completedAt,
        recommendedLessonId: 'self-introduction',
        answerIds: ['not-an-option', ...correctAnswers.slice(1)],
      },
    });
    const legacy = parseLearningState({
      ...createInitialState(),
      diagnostic: { correct: 5, total: 5, completedAt, recommendedLessonId: 'self-introduction' },
    });

    expect(malformed.diagnostic).toBeNull();
    expect(unknownAnswer.diagnostic).toBeNull();
    expect(legacy.diagnostic).toEqual({
      correct: 0,
      total: 5,
      completedAt,
      recommendedLessonId: lessons[0].id,
    });
  });
});

describe('activity and writing feedback', () => {
  it('keeps earlier card-review days in the cumulative activity ledger', () => {
    const firstReview = scheduleReview(undefined, 'good', date(1));
    const parsed = parseLearningState({
      ...createInitialState(),
      cardReviews: { [flashcards[0].id]: firstReview },
    });
    const nextReview = scheduleReview(firstReview, 'good', date(2));
    const updated = mergeActivityDateLedger(parsed, {
      ...parsed,
      cardReviews: { [flashcards[0].id]: nextReview },
    });

    expect(updated.activityDateLedger).toEqual([localDay(date(1)), localDay(date(2))]);
    expect(getActivityDates(updated)).toEqual(new Set([localDay(date(1)), localDay(date(2))]));
  });

  it('does not record goal or draft edits as activity', () => {
    const initial = createInitialState();
    const withGoal = mergeActivityDateLedger(initial, {
      ...initial,
      goal: { ...initial.goal, minutesPerDay: 30 },
    });
    const withDraft = mergeActivityDateLedger(withGoal, {
      ...withGoal,
      writingDraft: 'わたしはあきです。',
    });

    expect(withGoal.activityDateLedger).toEqual([]);
    expect(withDraft.activityDateLedger).toEqual([]);
  });

  it('sanitizes duplicate, invalid, and future ledger entries without mixing a prior state', () => {
    const imported = parseLearningState({
      ...createInitialState(),
      activityDateLedger: ['2024-01-02', 'not-a-date', '2024-01-02', '2999-01-01'],
    });

    expect(imported.activityDateLedger).toEqual(['2024-01-02']);
  });

  it('uses local calendar days around a UTC boundary', () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      const localTime = new Date('2024-01-02T00:30:00.000Z');
      const attempt = createAttempt(knownLesson, answersFor(knownLesson), localTime, 'local-day');
      const state = addAttempt(createInitialState(), attempt);

      expect(getActivityDates(state)).toEqual(new Set([localDay(localTime)]));
      expect(localDay(localTime)).toBe('2024-01-01');
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });

  it('checks only explicit self-introduction task requirements', () => {
    const complete = reviewWriting('はじめまして。わたしはあきです。');
    const typo = reviewWriting('私わあきです。');

    expect(complete.checks.every((check) => check.passed)).toBe(true);
    expect(complete.notes).toContain(
      'Проверяются только явные условия задания, а не вся грамматика текста.',
    );
    expect(typo.notes).toContain('Исправьте «私わ» на «私は».');
    expect(typo.notes.some((note) => note.includes('грамматически вер'))).toBe(false);
  });
});
