// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';
import { flashcards, lessons, sources } from './domain/curriculum';
import {
  createInitialState,
  getCourseStats,
  parseLearningState,
  STORAGE_KEY,
} from './domain/progress';

function openApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function savedState() {
  return parseLearningState(localStorage.getItem(STORAGE_KEY));
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  }
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Japanese campus flows', () => {
  it('only presents the Japanese campus and starts with real empty progress', () => {
    openApp();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Японский');
    expect(getCourseStats(savedState(), lessons).completed).toBe(0);
    expect(screen.getByRole('link', { name: 'Начать занятие' }).getAttribute('href')).toBe(
      `/lesson/${lessons[0].id}`,
    );
    expect(document.querySelector('audio, video')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('focuses search on opening and restores its trigger after closing', () => {
    openApp();
    const trigger = screen.getByRole('button', { name: 'Открыть поиск' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Поиск по урокам и источникам' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть окно' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Поиск по урокам и источникам' }),
    );
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not disclose test keys before submission and persists an unassisted result', () => {
    const view = openApp(`/lesson/${lessons[0].id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Проверь меня' }));
    for (const [index, exercise] of lessons[0].exercises.entries()) {
      const panel = within(screen.getByRole('region', { name: 'Задание' }));
      expect(panel.queryByText(exercise.explanation)).toBeNull();
      expect(panel.queryByRole('button', { name: 'Нужна подсказка' })).toBeNull();
      const correctOption = exercise.options.find((option) => option.id === exercise.answerId)!;
      fireEvent.click(panel.getByText(correctOption.label, { exact: true }));
      expect(document.querySelector('.answer-option.correct')).toBeNull();
      expect(savedState().attempts).toHaveLength(0);
      fireEvent.click(
        panel.getByRole('button', {
          name:
            index === lessons[0].exercises.length - 1 ? 'Завершить проверку' : 'Сохранить и дальше',
        }),
      );
    }
    expect(savedState().attempts).toHaveLength(1);
    expect(savedState().attempts[0]).toMatchObject({ correct: 5, total: 5, assisted: false });
    expect(getCourseStats(savedState(), lessons).completed).toBe(1);
    expect(screen.getByText('Разобрать все ответы')).toBeTruthy();
    view.unmount();
    openApp('/progress');
    expect(getCourseStats(savedState(), lessons).completed).toBe(1);
    expect(
      screen.getByText('Пройдено в практике', { selector: '.progress-lesson-row strong' }),
    ).toBeTruthy();
  });

  it('saves hint-assisted practice without marking the lesson completed', () => {
    openApp(`/lesson/${lessons[0].id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Научи меня' }));
    fireEvent.click(screen.getByRole('button', { name: 'Нужна подсказка' }));
    expect(screen.getByText(lessons[0].exercises[0].hint)).toBeTruthy();
    for (const [index, exercise] of lessons[0].exercises.entries()) {
      const panel = within(screen.getByRole('region', { name: 'Задание' }));
      const correctOption = exercise.options.find((option) => option.id === exercise.answerId)!;
      fireEvent.click(panel.getByText(correctOption.label, { exact: true }));
      fireEvent.click(panel.getByRole('button', { name: 'Проверить ответ' }));
      expect(panel.getByText(exercise.explanation)).toBeTruthy();
      fireEvent.click(
        panel.getByRole('button', {
          name:
            index === lessons[0].exercises.length - 1
              ? 'Посмотреть результат'
              : 'Следующее задание',
        }),
      );
    }
    expect(savedState().attempts[0]).toMatchObject({ correct: 5, total: 5, assisted: true });
    expect(getCourseStats(savedState(), lessons).completed).toBe(0);
  });

  it('does not create a completed attempt when a learner leaves partway through', () => {
    openApp(`/lesson/${lessons[0].id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Проверь меня' }));
    const panel = within(screen.getByRole('region', { name: 'Задание' }));
    fireEvent.click(panel.getByText(lessons[0].exercises[0].options[0].label, { exact: true }));
    fireEvent.click(panel.getByRole('button', { name: 'Сохранить и дальше' }));
    fireEvent.click(screen.getByRole('link', { name: 'Мой прогресс' }));
    expect(savedState().attempts).toHaveLength(0);
    expect(screen.getByText('История пока пуста')).toBeTruthy();
  });

  it('schedules a flashcard and saves a bookmark without increasing lesson progress', () => {
    openApp('/practice');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить карточку' }));
    expect(savedState().savedCardIds).toEqual([flashcards[0].id]);
    fireEvent.click(screen.getByRole('button', { name: 'Показать ответ' }));
    expect(screen.getByText(flashcards[0].back)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Вспомнил/ }));
    expect(savedState().cardReviews[flashcards[0].id]).toMatchObject({
      intervalDays: 1,
      reviews: 1,
    });
    expect(getCourseStats(savedState(), lessons).completed).toBe(0);
  });

  it('checks only explicit writing conditions, invalidates stale feedback and saves a version', () => {
    const view = openApp('/writing');
    const draft = screen.getByRole('textbox', { name: 'Ваш черновик' });
    fireEvent.change(draft, { target: { value: '私わあきです。' } });
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    expect(screen.getByText('Исправьте «私わ» на «私は».')).toBeTruthy();
    fireEvent.change(draft, { target: { value: 'わたしはあきです。' } });
    expect(screen.getByText(/Текст изменился/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    expect(document.querySelectorAll('.writing-checks .passed')).toHaveLength(2);
    expect(screen.getByText(/Проверяются только явные условия задания/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить версию' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить версию' }));
    expect(savedState().writingHistory).toHaveLength(1);
    expect(getCourseStats(savedState(), lessons).completed).toBe(0);
    view.unmount();
    openApp('/writing');
    expect(
      (screen.getByRole('textbox', { name: 'Ваш черновик' }) as HTMLTextAreaElement).value,
    ).toBe('わたしはあきです。');
  });

  it('filters saved library references and discloses the unreviewed pilot', () => {
    openApp('/library');
    expect(screen.getByText(/Независимая предметная рецензия преподавателем/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: `Сохранить источник: ${sources[0].title}` }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Сохранённое' }));
    expect(document.querySelectorAll('.source-card')).toHaveLength(1);
    expect(savedState().savedSourceIds).toEqual([sources[0].id]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск в библиотеке' }), {
      target: { value: 'несуществующий источник' },
    });
    expect(screen.getByText('На этой полке пока пусто')).toBeTruthy();
    expect(document.querySelectorAll('.source-card')).toHaveLength(0);
  });

  it('keeps a Roommate reflection private and outside graded lesson results', () => {
    const view = openApp('/connections');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Сравнение помогает, но не заменяет правило.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить заметку' }));
    expect(savedState().reflections['two-scripts']).toBe(
      'Сравнение помогает, но не заменяет правило.',
    );
    expect(getCourseStats(savedState(), lessons).completed).toBe(0);
    view.unmount();
    openApp('/connections');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain(
      'не заменяет правило',
    );
  });

  it('changes the study rhythm without manufacturing study activity', () => {
    openApp();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: '10 минут' }));
    fireEvent.click(dialog.getByRole('button', { name: '3' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Сохранить план' }));
    expect(savedState().goal).toMatchObject({ minutesPerDay: 10, daysPerWeek: 3 });
    expect(getCourseStats(savedState(), lessons).activeDays).toBe(0);
  });

  it('requires confirmation for reset and preserves data when cancelled', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...createInitialState(), writingDraft: 'わたしはあきです。' }),
    );
    openApp('/progress');
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить локальные данные' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    expect(savedState().writingDraft).toBe('わたしはあきです。');
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить локальные данные' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Сбросить данные' }),
    );
    expect(savedState()).toEqual(createInitialState());
  });

  it('validates imported files and replaces progress only after confirmation', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...createInitialState(), writingDraft: 'Старый черновик' }),
    );
    openApp('/progress');
    const fileInput = document.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, {
      target: { files: [{ size: 40, text: async () => '{invalid' }] },
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Не удалось прочитать'),
    );
    expect(savedState().writingDraft).toBe('Старый черновик');
    const imported = { ...createInitialState(), writingDraft: 'わたしはみきです。' };
    fireEvent.change(fileInput, {
      target: { files: [{ size: 500, text: async () => JSON.stringify(imported) }] },
    });
    await screen.findByRole('dialog');
    expect(savedState().writingDraft).toBe('Старый черновик');
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Заменить данные' }),
    );
    expect(savedState().writingDraft).toBe(imported.writingDraft);
  });

  it.each([
    '/plan',
    '/practice',
    '/progress',
    '/library',
    '/writing',
    '/connections',
    '/lesson/unknown',
    '/unknown',
  ])('renders the route %s with one main heading', (path) => {
    openApp(path);
    expect(screen.getByRole('main')).toBeTruthy();
    expect(document.querySelector('vite-error-overlay')).toBeNull();
    expect(screen.getAllByRole('heading').length).toBeGreaterThan(0);
  });
});
