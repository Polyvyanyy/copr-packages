import type { WritingAssignmentId } from './types';

export interface WritingAssignment {
  id: WritingAssignmentId;
  title: string;
  description: string;
  lessonId: string;
  model: string;
  example: string;
  exampleMeaning: string;
  checks: {
    id: string;
    label: string;
    pattern: RegExp;
  }[];
}

export const writingAssignments: WritingAssignment[] = [
  {
    id: 'introduction',
    title: 'Короткое представление',
    description:
      'Напишите одну строку по показанной модели, используя あき или みき. Проверяются только два явных условия; имя, смысл и остальная грамматика не оцениваются.',
    lessonId: 'self-introduction',
    model: 'わたしは … です。',
    example: 'わたしはあきです。',
    exampleMeaning: 'Я — Аки.',
    checks: [
      {
        id: 'topic',
        label: 'Есть тема «わたしは» или «私は»',
        pattern: /(?:わたし|私)\s*は/u,
      },
      {
        id: 'introduction',
        label: 'Есть модель «わたしは [имя] です»',
        pattern: /(?:私|わたし)\s*は\s*[^\s。！？.!?](?:[^。！？.!?]{0,23})\s*で\s*す/u,
      },
    ],
  },
  {
    id: 'question',
    title: 'Вопрос о книге',
    description:
      'Соберите показанный вопрос о книге. Проверяются только начало, слово ほん и концовка ですか。; смысл и остальные правила не оцениваются.',
    lessonId: 'copula-questions',
    model: 'X は Y ですか。',
    example: 'これはほんですか。',
    exampleMeaning: 'Это книга?',
    checks: [
      { id: 'topic', label: 'Строка начинается с «これは»', pattern: /^\s*これ\s*は/u },
      { id: 'book', label: 'Есть показанное слово «ほん»', pattern: /ほん/u },
      {
        id: 'question-form',
        label: 'Собрана показанная форма «これはほんですか。»',
        pattern: /^\s*これ\s*は\s*ほん\s*で\s*す\s*か\s*。\s*$/u,
      },
    ],
  },
  {
    id: 'location-existence',
    title: 'Предмет в показанном месте',
    description:
      'Соберите показанную строку о предмете в месте. Проверяются только ここに, слово ほん и готовая концовка; смысл и остальные правила не оцениваются.',
    lessonId: 'place-and-existence',
    model: 'ここに X があります。',
    example: 'ここにほんがあります。',
    exampleMeaning: 'Здесь есть книга.',
    checks: [
      { id: 'place', label: 'Есть показанное место «ここに»', pattern: /ここ\s*に/u },
      { id: 'book', label: 'Есть показанное слово «ほん»', pattern: /ほん/u },
      {
        id: 'existence-form',
        label: 'Собрана показанная форма «ここにほんがあります。»',
        pattern: /^\s*ここ\s*に\s*ほん\s*が\s*あ\s*り\s*ま\s*す\s*。\s*$/u,
      },
    ],
  },
  {
    id: 'reading-writing-action',
    title: 'Короткое действие с чтением или письмом',
    description:
      'Напишите одну из двух показанных строк: ほんをよみます。 или てがみをかきます。 Проверяются только закрытый набор слов и порядок модели; смысл и остальные правила не оцениваются.',
    lessonId: 'verb-forms',
    model: 'X を V ます。',
    example: 'ほんをよみます。',
    exampleMeaning: 'Читаю книгу.',
    checks: [
      {
        id: 'object-particle',
        label: 'Есть показанная пара с «を»',
        pattern: /(?:ほん|てがみ)\s*を/u,
      },
      {
        id: 'action',
        label: 'Есть показанная форма действия',
        pattern: /(?:よみます|かきます)\s*。\s*$/u,
      },
      {
        id: 'action-form',
        label: 'Собрана одна из двух показанных строк',
        pattern: /^\s*(?:ほん\s*を\s*よみます|てがみ\s*を\s*かきます)\s*。\s*$/u,
      },
    ],
  },
];

export function getWritingAssignment(id: unknown): WritingAssignment | undefined {
  return writingAssignments.find((assignment) => assignment.id === id);
}
