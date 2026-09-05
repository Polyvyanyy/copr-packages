export interface Source {
  id: string;
  title: string;
  author: string;
  description: string;
  url: string;
  license: string;
  licenseUrl: string;
  usage: string;
  category: 'textbook' | 'dictionary' | 'original';
}

export interface Example {
  japanese: string;
  reading?: string;
  meaning: string;
}

export interface LessonBlock {
  title: string;
  body: string;
  examples?: Example[];
}

export interface Exercise {
  id: string;
  prompt: string;
  japanese?: string;
  options: { id: string; label: string }[];
  answerId: string;
  explanation: string;
  hint: string;
}

export interface Lesson {
  id: string;
  moduleId: string;
  title: string;
  japaneseTitle: string;
  description: string;
  durationMinutes: number;
  skill: 'hiragana' | 'katakana' | 'reading' | 'grammar';
  objectives: string[];
  blocks: LessonBlock[];
  exercises: Exercise[];
  sourceIds: string[];
}

export interface CourseModule {
  id: string;
  title: string;
  japaneseTitle: string;
  description: string;
  lessonIds: string[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  reading?: string;
  kind: 'hiragana' | 'katakana' | 'word';
}

export interface Answer {
  exerciseId: string;
  choiceId: string;
  assisted: boolean;
}

export interface Attempt {
  id: string;
  lessonId: string;
  completedAt: string;
  answers: Answer[];
  correct: number;
  total: number;
  assisted: boolean;
}

export interface CardReview {
  dueAt: string;
  lastReviewedAt: string;
  intervalDays: number;
  reviews: number;
}

export interface WritingVersion {
  id: string;
  text: string;
  createdAt: string;
}

export interface DiagnosticRecord {
  correct: number;
  total: number;
  completedAt: string;
  recommendedLessonId: string;
  answerIds?: string[];
}

export interface LearningState {
  version: 1;
  goal: {
    minutesPerDay: number;
    daysPerWeek: number;
    purpose: 'reading' | 'writing' | 'foundation';
  };
  diagnostic: DiagnosticRecord | null;
  attempts: Attempt[];
  cardReviews: Record<string, CardReview>;
  activityDateLedger: string[];
  savedCardIds: string[];
  savedSourceIds: string[];
  writingDraft: string;
  writingHistory: WritingVersion[];
  reflections: Record<string, string>;
}
