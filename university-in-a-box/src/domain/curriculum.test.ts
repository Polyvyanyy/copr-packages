import { describe, expect, it } from 'vitest';
import { diagnosticQuestions, flashcards, lessons, modules, sources } from './curriculum';
import type { Exercise } from './types';

const allExercises = [...lessons.flatMap((lesson) => lesson.exercises), ...diagnosticQuestions];

const expectWellFormedExercise = (exercise: Exercise) => {
  expect(exercise.options.length).toBeGreaterThanOrEqual(3);
  expect(exercise.options.length).toBeLessThanOrEqual(4);
  expect(new Set(exercise.options.map((option) => option.id)).size).toBe(exercise.options.length);
  expect(exercise.options.filter((option) => option.id === exercise.answerId)).toHaveLength(1);
  expect(exercise.explanation.trim()).not.toBe('');
  expect(exercise.hint.trim()).not.toBe('');
};

describe('Japanese curriculum', () => {
  it('only registers licences that allow commercial reuse', () => {
    const allowedLicences = new Map([
      ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
      ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
    ]);
    for (const source of sources) {
      expect(allowedLicences.has(source.license)).toBe(true);
      expect(source.licenseUrl).toBe(allowedLicences.get(source.license));
    }
  });

  it('has the planned module, lesson, diagnostic, and flashcard counts', () => {
    expect(modules).toHaveLength(3);
    expect(lessons).toHaveLength(7);
    expect(diagnosticQuestions).toHaveLength(5);
    expect(flashcards.length).toBeGreaterThanOrEqual(20);
    expect(flashcards.length).toBeLessThanOrEqual(25);
  });

  it('uses globally unique content and choice identifiers', () => {
    const contentIds = [
      ...sources.map((source) => source.id),
      ...modules.map((module) => module.id),
      ...lessons.map((lesson) => lesson.id),
      ...flashcards.map((card) => card.id),
      ...allExercises.map((exercise) => exercise.id),
    ];
    const choiceIds = allExercises.flatMap((exercise) =>
      exercise.options.map((option) => option.id),
    );

    expect(new Set(contentIds).size).toBe(contentIds.length);
    expect(new Set(choiceIds).size).toBe(choiceIds.length);
  });

  it('keeps every module and lesson internally complete', () => {
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    const moduleIds = new Set(modules.map((module) => module.id));
    const listedLessonIds = modules.flatMap((module) => module.lessonIds);

    for (const module of modules) {
      expect(module.title.trim()).not.toBe('');
      expect(module.description.trim()).not.toBe('');
      expect(module.lessonIds.length).toBeGreaterThan(0);
      expect(module.lessonIds.every((lessonId) => lessonIds.has(lessonId))).toBe(true);
    }
    expect(new Set(listedLessonIds).size).toBe(listedLessonIds.length);
    expect([...listedLessonIds].sort()).toEqual([...lessonIds].sort());

    for (const lesson of lessons) {
      expect(moduleIds.has(lesson.moduleId)).toBe(true);
      expect(lesson.title.trim()).not.toBe('');
      expect(lesson.description.trim()).not.toBe('');
      expect(lesson.objectives.length).toBeGreaterThanOrEqual(2);
      expect(lesson.objectives.length).toBeLessThanOrEqual(3);
      expect(lesson.blocks).toHaveLength(3);
      expect(lesson.blocks.every((block) => block.title.trim() && block.body.trim())).toBe(true);
      expect(lesson.exercises).toHaveLength(5);
      expect(lesson.sourceIds.length).toBeGreaterThan(0);
    }
  });

  it('gives every exercise one valid correct choice and teaching support', () => {
    allExercises.forEach(expectWellFormedExercise);
  });

  it('uses only registered sources in the lessons', () => {
    const sourceIds = new Set(sources.map((source) => source.id));

    lessons.forEach((lesson) => {
      expect(lesson.sourceIds.every((sourceId) => sourceIds.has(sourceId))).toBe(true);
    });
  });

  it('keeps learner-facing material limited to written work', () => {
    const learnerFacingText = JSON.stringify({
      sources,
      modules,
      lessons,
      flashcards,
      diagnosticQuestions,
    });

    expect(learnerFacingText).not.toMatch(
      /аудио|произнош|слушан|говорен|\b(?:audio|pronunciation|listening|speaking)\b/iu,
    );
  });
});
