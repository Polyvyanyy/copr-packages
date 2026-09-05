import { connections } from './connections';
import { diagnosticQuestions, flashcards, lessons, sources } from './curriculum';
import type { Answer, Attempt, CardReview, Exercise, LearningState, Lesson } from './types';

export const STORAGE_KEY = 'university-in-a-box:japanese:learning:v1';
export const DIAGNOSTIC_SKIP_ANSWER_ID = 'skipped';

const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_DELAY_MS = 7 * DAY_MS;
const AGAIN_DELAY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 500;
const DIAGNOSTIC_TOTAL = 5;
const MAX_EXERCISES = 100;
const MAX_REVIEWS = 10_000;
const MAX_INTERVAL_DAYS = 365;
const MAX_ACTIVITY_DATES = 1_000;
const MAX_TEXT_LENGTH = 20_000;
const MAX_WRITING_HISTORY = 100;
const MAX_REFLECTIONS = 200;
const MAX_ID_LENGTH = 128;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LOCAL_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

interface Assessment {
  answers: Answer[];
  correct: number;
  total: number;
  assisted: boolean;
}

const lessonById = new Map<string, Lesson>();
for (const lesson of lessons) lessonById.set(lesson.id, lesson);

const flashcardIds = new Set(flashcards.map((card) => card.id));
const sourceIds = new Set(sources.map((source) => source.id));
const reflectionIds = new Set([
  ...lessonById.keys(),
  ...connections.map((connection) => connection.id),
]);
const MAX_STORED_ATTEMPTS = Math.max(MAX_ATTEMPTS, lessonById.size * 2 + 1);
const diagnosticQuestionIndexByLessonId = new Map<string, number>([
  ['hiragana-vowels', 0],
  ['hiragana-k', 1],
  ['first-words', 2],
  ['topic-wa', 3],
  ['self-introduction', 4],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function ownKeys(value: Record<string, unknown>, limit: number): string[] | null {
  try {
    const keys = Object.keys(value);
    if (keys.length > limit) return null;
    return keys.filter((key) => !DANGEROUS_KEYS.has(key));
  } catch {
    return null;
  }
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !DANGEROUS_KEYS.has(value)
  );
}

function isText(value: unknown, maximumLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length <= maximumLength;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
  );
}

function parseIsoInstant(value: unknown, maximumTime = Number.POSITIVE_INFINITY): Date | null {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds > maximumTime) return null;
  const date = new Date(milliseconds);
  return date.toISOString() === value ? date : null;
}

function usableNow(now?: Date): Date {
  if (now instanceof Date && Number.isFinite(now.getTime())) return new Date(now.getTime());
  return new Date();
}

let generatedAttemptSequence = 0;

function newAttemptId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  generatedAttemptSequence += 1;
  return `attempt-${Date.now()}-${generatedAttemptSequence}`;
}

function getExercises(lesson: Lesson): Exercise[] | null {
  if (!lesson || !Array.isArray(lesson.exercises) || lesson.exercises.length > MAX_EXERCISES)
    return null;

  const ids = new Set<string>();
  for (const exercise of lesson.exercises) {
    if (!isRecord(exercise) || !isSafeId(exercise.id) || ids.has(exercise.id)) return null;
    if (
      !Array.isArray(exercise.options) ||
      exercise.options.length === 0 ||
      exercise.options.length > MAX_EXERCISES
    )
      return null;
    if (
      !isSafeId(exercise.answerId) ||
      !exercise.options.some((option) => option.id === exercise.answerId)
    )
      return null;

    const optionIds = new Set<string>();
    for (const option of exercise.options) {
      if (!isRecord(option) || !isSafeId(option.id) || optionIds.has(option.id)) return null;
      optionIds.add(option.id);
    }
    ids.add(exercise.id);
  }

  return lesson.exercises;
}

function assessAnswers(lesson: Lesson, rawAnswers: unknown): Assessment | null {
  const exercises = getExercises(lesson);
  if (!exercises || !Array.isArray(rawAnswers) || rawAnswers.length !== exercises.length)
    return null;

  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const answersByExercise = new Map<string, Answer>();

  for (const rawAnswer of rawAnswers) {
    if (!isRecord(rawAnswer)) return null;
    const { exerciseId, choiceId, assisted } = rawAnswer;
    const exercise = isSafeId(exerciseId) ? exerciseById.get(exerciseId) : undefined;
    if (
      !exercise ||
      !isSafeId(choiceId) ||
      typeof assisted !== 'boolean' ||
      answersByExercise.has(exercise.id)
    )
      return null;
    if (!exercise.options.some((option) => option.id === choiceId)) return null;
    answersByExercise.set(exercise.id, { exerciseId: exercise.id, choiceId, assisted });
  }

  const answers = exercises.map((exercise) => answersByExercise.get(exercise.id));
  if (answers.some((answer) => !answer)) return null;

  const canonicalAnswers = answers as Answer[];
  return {
    answers: canonicalAnswers,
    correct: canonicalAnswers.filter(
      (answer) => exerciseById.get(answer.exerciseId)?.answerId === answer.choiceId,
    ).length,
    total: exercises.length,
    assisted: canonicalAnswers.some((answer) => answer.assisted),
  };
}

function hasAssistedAnswer(value: unknown): boolean {
  return (
    Array.isArray(value) && value.some((answer) => isRecord(answer) && answer.assisted === true)
  );
}

function canonicalAttemptForLesson(
  lesson: Lesson,
  value: unknown,
  maximumTime = Number.POSITIVE_INFINITY,
): Attempt | null {
  if (!isRecord(value) || !isSafeId(value.id) || value.lessonId !== lesson.id) return null;
  const completedAt = parseIsoInstant(value.completedAt, maximumTime);
  const assessment = assessAnswers(lesson, value.answers);
  if (!completedAt || !assessment) return null;

  return {
    id: value.id,
    lessonId: lesson.id,
    completedAt: completedAt.toISOString(),
    ...assessment,
    assisted: assessment.assisted || value.assisted === true,
  };
}

function isQualifyingAttempt(lesson: Lesson, value: unknown): boolean {
  const attempt = canonicalAttemptForLesson(lesson, value);
  return Boolean(
    attempt && attempt.total > 0 && !attempt.assisted && attempt.correct / attempt.total >= 0.8,
  );
}

function parseAttemptList(value: unknown, maximumTime: number): Attempt[] {
  if (!Array.isArray(value) || value.length > MAX_STORED_ATTEMPTS) return [];

  const attempts: Attempt[] = [];
  const ids = new Set<string>();
  for (const rawAttempt of value) {
    if (!isRecord(rawAttempt) || !isSafeId(rawAttempt.lessonId)) continue;
    const lesson = lessonById.get(rawAttempt.lessonId);
    if (!lesson) continue;
    const attempt = canonicalAttemptForLesson(lesson, rawAttempt, maximumTime);
    if (!attempt || ids.has(attempt.id)) continue;
    ids.add(attempt.id);
    attempts.push(attempt);
  }
  return attempts;
}

function parseCardReview(value: unknown, now: number): CardReview | null {
  if (!isRecord(value)) return null;
  if (
    !isIntegerInRange(value.intervalDays, 0, MAX_INTERVAL_DAYS) ||
    !isIntegerInRange(value.reviews, 1, MAX_REVIEWS)
  )
    return null;

  const lastReviewedAt = parseIsoInstant(value.lastReviewedAt, now);
  const dueAt = parseIsoInstant(value.dueAt, now + MAX_INTERVAL_DAYS * DAY_MS + DAY_MS);
  if (!lastReviewedAt || !dueAt || dueAt.getTime() < lastReviewedAt.getTime()) return null;
  if (dueAt.getTime() - lastReviewedAt.getTime() > MAX_INTERVAL_DAYS * DAY_MS + DAY_MS) return null;

  return {
    lastReviewedAt: lastReviewedAt.toISOString(),
    dueAt: dueAt.toISOString(),
    intervalDays: value.intervalDays,
    reviews: value.reviews,
  };
}

function parseCardReviews(value: unknown, now: number): Record<string, CardReview> {
  if (!isRecord(value)) return {};
  const keys = ownKeys(value, flashcardIds.size);
  if (!keys) return {};

  const reviews: Record<string, CardReview> = {};
  for (const id of keys) {
    if (!flashcardIds.has(id)) continue;
    const review = parseCardReview(value[id], now);
    if (review) reviews[id] = review;
  }
  return reviews;
}

function parseKnownIds(value: unknown, knownIds: Set<string>): string[] {
  if (!Array.isArray(value) || value.length > knownIds.size) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (isSafeId(id) && knownIds.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function parseWritingHistory(value: unknown, now: number): LearningState['writingHistory'] {
  if (!Array.isArray(value) || value.length > MAX_WRITING_HISTORY) return [];
  const history: LearningState['writingHistory'] = [];
  const ids = new Set<string>();

  for (const version of value) {
    if (!isRecord(version) || !isSafeId(version.id) || ids.has(version.id) || !isText(version.text))
      continue;
    const createdAt = parseIsoInstant(version.createdAt, now);
    if (!createdAt) continue;
    ids.add(version.id);
    history.push({ id: version.id, text: version.text, createdAt: createdAt.toISOString() });
  }
  return history;
}

function parseReflections(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const keys = ownKeys(value, Math.min(MAX_REFLECTIONS, reflectionIds.size));
  if (!keys) return {};

  const reflections: Record<string, string> = {};
  for (const reflectionId of keys) {
    if (reflectionIds.has(reflectionId) && isText(value[reflectionId], 5_000))
      reflections[reflectionId] = value[reflectionId];
  }
  return reflections;
}

function parseGoal(value: unknown): LearningState['goal'] {
  const initial = createInitialState().goal;
  if (!isRecord(value)) return initial;
  return {
    minutesPerDay: isIntegerInRange(value.minutesPerDay, 5, 240)
      ? value.minutesPerDay
      : initial.minutesPerDay,
    daysPerWeek: isIntegerInRange(value.daysPerWeek, 1, 7)
      ? value.daysPerWeek
      : initial.daysPerWeek,
    purpose:
      value.purpose === 'reading' || value.purpose === 'writing' || value.purpose === 'foundation'
        ? value.purpose
        : initial.purpose,
  };
}

function firstLessonId(): string {
  return lessons[0]?.id ?? '';
}

function parseDiagnosticAnswerIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== DIAGNOSTIC_TOTAL) return null;
  const answerIds: string[] = [];

  for (let index = 0; index < DIAGNOSTIC_TOTAL; index += 1) {
    const answerId = value[index];
    const question = diagnosticQuestions[index];
    if (!question || !isSafeId(answerId)) return null;
    if (
      answerId !== DIAGNOSTIC_SKIP_ANSWER_ID &&
      !question.options.some((option) => option.id === answerId)
    )
      return null;
    answerIds.push(answerId);
  }
  return answerIds;
}

export function getDiagnosticResult(answerIds: readonly string[]): {
  correct: number;
  total: number;
  recommendedLessonId: string;
} {
  const correct = diagnosticQuestions
    .slice(0, DIAGNOSTIC_TOTAL)
    .filter((question, index) => answerIds[index] === question.answerId).length;

  // Do not infer an untested prerequisite from answers to later questions.
  const recommendedLessonId =
    lessons.find((lesson) => {
      const questionIndex = diagnosticQuestionIndexByLessonId.get(lesson.id);
      return (
        questionIndex === undefined ||
        answerIds[questionIndex] !== diagnosticQuestions[questionIndex]?.answerId
      );
    })?.id ?? firstLessonId();

  return { correct, total: DIAGNOSTIC_TOTAL, recommendedLessonId };
}

function parseDiagnostic(value: unknown, now: number): LearningState['diagnostic'] {
  if (value === null) return null;
  if (!isRecord(value) || value.total !== DIAGNOSTIC_TOTAL) return null;
  const completedAt = parseIsoInstant(value.completedAt, now);
  if (!completedAt) return null;

  if (value.answerIds === undefined) {
    if (!isIntegerInRange(value.correct, 0, DIAGNOSTIC_TOTAL)) return null;
    return {
      correct: 0,
      total: DIAGNOSTIC_TOTAL,
      completedAt: completedAt.toISOString(),
      recommendedLessonId: firstLessonId(),
    };
  }

  const answerIds = parseDiagnosticAnswerIds(value.answerIds);
  if (!answerIds) return null;
  const result = getDiagnosticResult(answerIds);
  return {
    ...result,
    completedAt: completedAt.toISOString(),
    answerIds,
  };
}

function safeStateAttempts(state: LearningState): Attempt[] {
  const value = state as unknown as { attempts?: unknown };
  return Array.isArray(value.attempts) && value.attempts.length <= MAX_STORED_ATTEMPTS
    ? (value.attempts as Attempt[])
    : [];
}

function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !LOCAL_DATE_KEY.test(value) || value > localDateKey(new Date()))
    return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return localDateKey(date) === value;
}

function normaliseActivityDateLedger(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(isLocalDateKey))].sort().slice(-MAX_ACTIVITY_DATES);
}

function parseActivityDateLedger(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_ACTIVITY_DATES) return [];
  return normaliseActivityDateLedger(value.filter(isLocalDateKey));
}

export function createInitialState(): LearningState {
  return {
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
  };
}

export function parseLearningState(value: unknown): LearningState {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!isRecord(parsed) || parsed.version !== 1) return createInitialState();

    const now = Date.now();
    const state: LearningState = {
      ...createInitialState(),
      goal: parseGoal(parsed.goal),
      diagnostic: parseDiagnostic(parsed.diagnostic, now),
      attempts: parseAttemptList(parsed.attempts, now),
      cardReviews: parseCardReviews(parsed.cardReviews, now),
      activityDateLedger: parseActivityDateLedger(parsed.activityDateLedger),
      savedCardIds: parseKnownIds(parsed.savedCardIds, flashcardIds),
      savedSourceIds: parseKnownIds(parsed.savedSourceIds, sourceIds),
      writingDraft: isText(parsed.writingDraft) ? parsed.writingDraft : '',
      writingHistory: parseWritingHistory(parsed.writingHistory, now),
      reflections: parseReflections(parsed.reflections),
    };
    return mergeActivityDateLedger(createInitialState(), state);
  } catch {
    return createInitialState();
  }
}

export function createAttempt(lesson: Lesson, answers: Answer[], now?: Date, id?: string): Attempt {
  const assessment = assessAnswers(lesson, answers);
  const exercises = getExercises(lesson);
  const completedAt = usableNow(now).toISOString();

  return {
    id: isSafeId(id) ? id : newAttemptId(),
    lessonId: isSafeId(lesson?.id) ? lesson.id : '',
    completedAt,
    answers: assessment?.answers ?? [],
    correct: assessment?.correct ?? 0,
    total: assessment?.total ?? exercises?.length ?? 0,
    assisted: assessment?.assisted ?? hasAssistedAnswer(answers),
  };
}

function isQualifyingCanonicalAttempt(attempt: Attempt): boolean {
  return attempt.total > 0 && !attempt.assisted && attempt.correct / attempt.total >= 0.8;
}

function evidenceAttemptIds(attempts: Attempt[]): Set<string> {
  const attemptsByLesson = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    if (!lessonById.has(attempt.lessonId)) continue;
    const group = attemptsByLesson.get(attempt.lessonId) ?? [];
    group.push(attempt);
    attemptsByLesson.set(attempt.lessonId, group);
  }

  const evidenceIds = new Set<string>();
  for (const lessonAttempts of attemptsByLesson.values()) {
    const qualifying = lessonAttempts
      .filter(isQualifyingCanonicalAttempt)
      .sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt));
    if (qualifying.length === 0) {
      const latest = [...lessonAttempts].sort(
        (left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt),
      )[0];
      if (latest) evidenceIds.add(latest.id);
      continue;
    }

    const first = qualifying[0];
    const retainedBy = qualifying.find(
      (attempt) =>
        Date.parse(attempt.completedAt) - Date.parse(first.completedAt) >= REVIEW_DELAY_MS,
    );
    if (retainedBy) {
      evidenceIds.add(first.id);
      evidenceIds.add(retainedBy.id);
    } else {
      evidenceIds.add(qualifying[qualifying.length - 1].id);
    }
  }
  return evidenceIds;
}

function compactAttemptHistory(attempts: Attempt[], requiredAttemptId: string): Attempt[] {
  if (attempts.length <= MAX_STORED_ATTEMPTS) return attempts;

  // Keep the witnesses that support each lesson's visible status before pruning redundant history.
  const evidenceIds = evidenceAttemptIds(attempts);
  evidenceIds.add(requiredAttemptId);
  const remainingSlots = Math.max(0, MAX_STORED_ATTEMPTS - evidenceIds.size);
  const recentIds = attempts
    .filter((attempt) => !evidenceIds.has(attempt.id))
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
    .slice(0, remainingSlots)
    .map((attempt) => attempt.id);
  const keptIds = new Set([...evidenceIds, ...recentIds]);
  return attempts.filter((attempt) => keptIds.has(attempt.id));
}

export function addAttempt(state: LearningState, attempt: Attempt): LearningState {
  if (!isRecord(attempt) || !isSafeId(attempt.lessonId)) return state;
  const lesson = lessonById.get(attempt.lessonId);
  if (!lesson) return state;

  const canonicalAttempt = canonicalAttemptForLesson(lesson, attempt, Date.now());
  if (!canonicalAttempt) return state;

  const attempts = parseAttemptList(safeStateAttempts(state), Date.now());
  if (attempts.some((existing) => existing.id === canonicalAttempt.id)) return state;
  return {
    ...state,
    attempts: compactAttemptHistory([...attempts, canonicalAttempt], canonicalAttempt.id),
  };
}

export function isLessonCompleted(lesson: Lesson, attempts: Attempt[]): boolean {
  if (!Array.isArray(attempts)) return false;
  return attempts
    .slice(0, MAX_STORED_ATTEMPTS)
    .some((attempt) => isQualifyingAttempt(lesson, attempt));
}

export function getLessonStatus(
  lesson: Lesson,
  attempts: Attempt[],
  now?: Date,
): 'new' | 'practising' | 'completed' | 'review-due' | 'retained' {
  const currentTime = usableNow(now).getTime();
  const lessonAttempts = Array.isArray(attempts)
    ? attempts
        .slice(0, MAX_STORED_ATTEMPTS)
        .map((attempt) => canonicalAttemptForLesson(lesson, attempt, currentTime))
        .filter((attempt): attempt is Attempt => Boolean(attempt))
    : [];

  if (lessonAttempts.length === 0) return 'new';

  const qualifying = lessonAttempts
    .filter(
      (attempt) => attempt.total > 0 && !attempt.assisted && attempt.correct / attempt.total >= 0.8,
    )
    .sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt));
  if (qualifying.length === 0) return 'practising';

  const distinctQualifying = qualifying.filter(
    (attempt, index) => qualifying.findIndex((other) => other.id === attempt.id) === index,
  );
  const first = distinctQualifying[0];
  const latest = distinctQualifying[distinctQualifying.length - 1];
  if (
    distinctQualifying.length >= 2 &&
    Date.parse(latest.completedAt) - Date.parse(first.completedAt) >= REVIEW_DELAY_MS
  )
    return 'retained';
  return currentTime - Date.parse(latest.completedAt) >= REVIEW_DELAY_MS
    ? 'review-due'
    : 'completed';
}

export function getCourseStats(
  state: LearningState,
  courseLessons: Lesson[],
): {
  completed: number;
  total: number;
  reviewedCards: number;
  totalReviews: number;
  activeDays: number;
  percentage: number;
} {
  const uniqueLessons: Lesson[] = [];
  const lessonIds = new Set<string>();
  for (const lesson of Array.isArray(courseLessons) ? courseLessons.slice(0, MAX_ATTEMPTS) : []) {
    if (isSafeId(lesson?.id) && !lessonIds.has(lesson.id)) {
      lessonIds.add(lesson.id);
      uniqueLessons.push(lesson);
    }
  }

  const attempts = safeStateAttempts(state);
  const completed = uniqueLessons.filter((lesson) => isLessonCompleted(lesson, attempts)).length;
  let reviewedCards = 0;
  let totalReviews = 0;
  const cardReviewState = state as unknown as { cardReviews?: unknown };
  if (isRecord(cardReviewState.cardReviews)) {
    const keys = ownKeys(cardReviewState.cardReviews, flashcardIds.size);
    if (keys) {
      for (const cardId of keys) {
        if (!flashcardIds.has(cardId)) continue;
        const review = parseCardReview(cardReviewState.cardReviews[cardId], Date.now());
        if (!review) continue;
        reviewedCards += 1;
        totalReviews += review.reviews;
      }
    }
  }

  const total = uniqueLessons.length;
  return {
    completed,
    total,
    reviewedCards,
    totalReviews,
    activeDays: getActivityDates(state).size,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function getNextLesson(courseLessons: Lesson[], state: LearningState): Lesson {
  const available = Array.isArray(courseLessons)
    ? courseLessons.slice(0, MAX_ATTEMPTS).filter((lesson) => isSafeId(lesson?.id))
    : [];
  if (available.length === 0) throw new Error('No lessons available');

  const attempts = safeStateAttempts(state);
  const now = new Date();
  const due = available.find((lesson) => getLessonStatus(lesson, attempts, now) === 'review-due');
  if (due) return due;

  const unfinished = available.find((lesson) => !isLessonCompleted(lesson, attempts));
  return unfinished ?? available[0];
}

export function scheduleReview(
  previous: CardReview | undefined,
  rating: 'again' | 'good' | 'easy',
  now?: Date,
): CardReview {
  const previousInterval =
    previous && isIntegerInRange(previous.intervalDays, 0, MAX_INTERVAL_DAYS)
      ? previous.intervalDays
      : 0;
  const previousReviews =
    previous && isIntegerInRange(previous.reviews, 0, MAX_REVIEWS) ? previous.reviews : 0;
  const actualRating = rating === 'good' || rating === 'easy' ? rating : 'again';
  const intervalDays =
    actualRating === 'again'
      ? 0
      : actualRating === 'good'
        ? Math.min(
            MAX_INTERVAL_DAYS,
            Math.max(1, Math.ceil(previousInterval > 0 ? previousInterval * 2 : 1)),
          )
        : Math.min(
            MAX_INTERVAL_DAYS,
            Math.max(3, Math.ceil(previousInterval > 0 ? previousInterval * 3 : 3)),
          );
  const reviewedAt = usableNow(now);
  const dueAt = new Date(
    reviewedAt.getTime() + (intervalDays === 0 ? AGAIN_DELAY_MS : intervalDays * DAY_MS),
  );

  return {
    lastReviewedAt: reviewedAt.toISOString(),
    dueAt: dueAt.toISOString(),
    intervalDays,
    reviews: Math.min(MAX_REVIEWS, previousReviews + 1),
  };
}

function getEvidenceActivityDates(state: LearningState): Set<string> {
  const dates = new Set<string>();
  const now = Date.now();
  const addDate = (value: unknown) => {
    const date = parseIsoInstant(value, now);
    if (date) dates.add(localDateKey(date));
  };

  for (const rawAttempt of safeStateAttempts(state)) {
    if (!isRecord(rawAttempt) || !isSafeId(rawAttempt.lessonId)) continue;
    const lesson = lessonById.get(rawAttempt.lessonId);
    const attempt = lesson ? canonicalAttemptForLesson(lesson, rawAttempt, now) : null;
    if (attempt) addDate(attempt.completedAt);
  }

  const cardReviewState = state as unknown as { cardReviews?: unknown };
  if (isRecord(cardReviewState.cardReviews)) {
    const keys = ownKeys(cardReviewState.cardReviews, flashcardIds.size);
    if (keys) {
      for (const cardId of keys) {
        if (!flashcardIds.has(cardId)) continue;
        const review = parseCardReview(cardReviewState.cardReviews[cardId], now);
        if (review) addDate(review.lastReviewedAt);
      }
    }
  }

  const diagnostic = parseDiagnostic(
    (state as unknown as { diagnostic?: unknown }).diagnostic,
    now,
  );
  if (diagnostic) addDate(diagnostic.completedAt);
  for (const version of parseWritingHistory(
    (state as unknown as { writingHistory?: unknown }).writingHistory,
    now,
  ))
    addDate(version.createdAt);

  return dates;
}

export function getActivityDates(state: LearningState): Set<string> {
  const ledgerState = state as unknown as { activityDateLedger?: unknown };
  const dates = new Set(parseActivityDateLedger(ledgerState.activityDateLedger));
  for (const date of getEvidenceActivityDates(state)) dates.add(date);
  return dates;
}

export function mergeActivityDateLedger(
  previous: LearningState,
  next: LearningState,
): LearningState {
  const previousLedger = parseActivityDateLedger(
    (previous as unknown as { activityDateLedger?: unknown }).activityDateLedger,
  );
  const nextLedger = parseActivityDateLedger(
    (next as unknown as { activityDateLedger?: unknown }).activityDateLedger,
  );
  const activityDateLedger = normaliseActivityDateLedger([
    ...previousLedger,
    ...nextLedger,
    ...getEvidenceActivityDates(previous),
    ...getEvidenceActivityDates(next),
  ]);
  return { ...next, activityDateLedger };
}

export function reviewWriting(text: string): {
  checks: { id: string; label: string; passed: boolean }[];
  notes: string[];
} {
  const compact = (typeof text === 'string' ? text : '').replace(/\s+/gu, '');
  const checks = [
    {
      id: 'topic',
      label: 'Есть тема «わたしは» или «私は»',
      passed: compact.includes('わたしは') || compact.includes('私は'),
    },
    {
      id: 'introduction',
      label: 'Есть модель «わたしは [имя] です»',
      passed: /(?:私|わたし)は[^。！？.!?]{1,24}です/u.test(compact),
    },
  ];
  const notes = checks
    .filter((check) => !check.passed)
    .map((check) => `Условие задания не найдено: ${check.label}.`);
  if (/私\s*わ/u.test(text)) notes.unshift('Исправьте «私わ» на «私は».');
  notes.push('Проверяются только явные условия задания, а не вся грамматика текста.');
  return { checks, notes };
}
