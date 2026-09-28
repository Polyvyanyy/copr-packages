// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import App from './App';
import {
  createInitialState,
  getWritingHistory,
  parseLearningState,
  STORAGE_KEY,
} from './domain/progress';
import type { LearningState, WritingAssignmentId } from './domain/types';
import { writingAssignments } from './domain/writing-assignments';

const createdAt = '2024-01-02T12:00:00.000Z';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function installTransport(accountState?: LearningState) {
  let cloudState = accountState;
  let revision = 1;
  const fetchMock = vi.fn((path: unknown, options?: RequestInit) => {
    if (path === '/api/config')
      return Promise.resolve(
        response({
          environment: 'test',
          billing: { enabled: false, mode: 'disabled', monthlyAmount: 2000, currency: 'usd' },
          operator: { name: null, email: null, address: null },
          emailEnabled: false,
        }),
      );
    if (path === '/api/account')
      return Promise.resolve(
        cloudState
          ? response({
              user: {
                id: 'writing-account',
                name: 'Мика',
                email: 'mika@example.com',
                emailVerified: true,
              },
              subscription: {
                status: 'trialing',
                access: 'full',
                trialEndsAt: null,
                currentPeriodEnd: null,
                cancelAtPeriodEnd: false,
              },
              onboardingComplete: true,
            })
          : response({ error: { code: 'UNAUTHORIZED', message: 'No active session' } }, 401),
      );
    if (path === '/api/learning' && cloudState) {
      if (options?.method === 'PUT') {
        cloudState = parseLearningState(JSON.parse(options.body as string).state);
        revision++;
      }
      return Promise.resolve(response({ state: cloudState, revision, updatedAt: createdAt }));
    }
    return Promise.reject(new Error(`Unexpected request: ${String(path)}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="writing-route">{location.search}</output>
      <button onClick={() => navigate(-1)}>Назад по истории</button>
    </>
  );
}

async function openWriting(path = '/writing') {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <NavigationProbe />
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('combobox', { name: 'Выберите задание' });
  return view;
}

function draft() {
  return screen.getByRole('textbox', { name: 'Ваш черновик' }) as HTMLTextAreaElement;
}

function selectAssignment(id: WritingAssignmentId) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Выберите задание' }), {
    target: { value: id },
  });
}

function write(text: string) {
  fireEvent.change(draft(), { target: { value: text } });
}

function saveVersion() {
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить версию' }));
}

function history() {
  return within(screen.getByRole('region', { name: 'Как менялся ваш текст' }));
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
  installTransport();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('four writing assignment flows', () => {
  it('keeps legacy work while saving independent drafts and history across all assignments and reloads', async () => {
    const legacyVersion = { id: 'legacy', text: 'わたしはあきです。', createdAt };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...createInitialState(),
        writingDraft: 'わたしはみきです。',
        writingHistory: [legacyVersion],
      }),
    );
    const view = await openWriting('/writing?source=plan');
    const selector = screen.getByRole('combobox', { name: 'Выберите задание' });
    expect(within(selector).getAllByRole('option')).toHaveLength(4);
    expect(draft().value).toBe('わたしはみきです。');
    expect(history().getAllByRole('button')).toHaveLength(1);
    selector.focus();

    for (const assignment of writingAssignments.slice(1)) {
      selectAssignment(assignment.id);
      expect(document.activeElement).toBe(selector);
      expect(draft().value).toBe('');
      expect(draft().getAttribute('lang')).toBe('ja');
      expect(screen.getByRole('heading', { name: assignment.title })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Вернуться к занятию' }).getAttribute('href')).toBe(
        `/lesson/${assignment.lessonId}`,
      );
      expect(history().queryAllByRole('button')).toHaveLength(0);
      write(assignment.example);
      fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
      expect(document.querySelectorAll('.writing-checks .passed')).toHaveLength(3);
      saveVersion();
      expect(history().getAllByRole('button')).toHaveLength(1);
      expect(savedState().writingDraft).toBe('わたしはみきです。');
      expect(savedState().attempts).toEqual([]);
    }
    expect(savedState().writingDrafts).toEqual({
      question: 'これはほんですか。',
      'location-existence': 'ここにほんがあります。',
      'reading-writing-action': 'ほんをよみます。',
    });
    expect(savedState().writingHistory[0]).toEqual(legacyVersion);
    expect(savedState().writingHistory).toHaveLength(4);
    expect(screen.getByTestId('writing-route').textContent).toContain('source=plan');
    expect(screen.getByTestId('writing-route').textContent).toContain(
      'assignment=reading-writing-action',
    );

    selectAssignment('introduction');
    expect(draft().value).toBe('わたしはみきです。');
    expect(history().getAllByRole('button')).toHaveLength(1);
    expect(history().getByRole('button').textContent).toContain(legacyVersion.text);
    expect(document.querySelector('audio, video')).toBeNull();
    view.unmount();

    await openWriting('/writing?assignment=question');
    expect(draft().value).toBe('これはほんですか。');
    expect(history().getByRole('button').textContent).toContain('これはほんですか。');
    selectAssignment('introduction');
    expect(draft().value).toBe('わたしはみきです。');
  });

  it('resets example and feedback on assignment changes and browser-back navigation', async () => {
    await openWriting();
    write('私わあきです。');
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    expect(screen.getByText('Исправьте «私わ» на «私は».')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть образец' }));
    expect(document.querySelector('.writing-example')).not.toBeNull();

    selectAssignment('question');
    expect(document.querySelector('.writing-example')).toBeNull();
    expect(document.querySelector('.editor-notes')).toBeNull();
    expect(document.querySelectorAll('.writing-checks .passed')).toHaveLength(0);
    expect(
      within(screen.getByRole('list', { name: 'Условия задания' })).getAllByRole('listitem'),
    ).toHaveLength(3);
    write('これはほんです。');
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    expect(document.querySelectorAll('.writing-checks .passed')).toHaveLength(2);
    write('これはほんですか。');
    expect(screen.getByText(/Текст изменился/)).toBeTruthy();
    expect(document.querySelectorAll('.writing-checks .passed')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    expect(document.querySelectorAll('.writing-checks .passed')).toHaveLength(3);
    expect(screen.getByText(/Проверяются только явные условия задания/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть образец' }));

    selectAssignment('introduction');
    expect(draft().value).toBe('私わあきです。');
    expect(document.querySelector('.editor-notes')).toBeNull();
    expect(document.querySelector('.writing-example')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Назад по истории' }));
    expect(draft().value).toBe('これはほんですか。');
    expect(document.querySelector('.editor-notes')).toBeNull();
    expect(document.querySelector('.writing-example')).toBeNull();
    expect(document.querySelectorAll('.writing-checks .passed')).toHaveLength(0);
  });

  it('restores only the selected draft and retains every saved version', async () => {
    const legacyText = 'わたしはあきです。';
    const questionText = 'これは ほん ですか。';
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...createInitialState(),
        writingDraft: 'わたしはみきです。',
        writingDrafts: {
          question: 'これはほんですか。',
          'location-existence': 'ここにほんがあります。',
        },
        writingHistory: [
          { id: 'legacy', text: legacyText, createdAt },
          { id: 'question-v1', text: questionText, createdAt, assignmentId: 'question' },
        ],
      }),
    );
    await openWriting('/writing?assignment=question');
    saveVersion();
    selectAssignment('introduction');
    saveVersion();
    selectAssignment('question');
    saveVersion();
    expect(savedState().writingHistory).toHaveLength(4);
    expect(getWritingHistory(savedState(), 'question')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить условия' }));
    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть образец' }));
    fireEvent.click(history().getByRole('button', { name: /これは ほん ですか。/u }));
    const dialog = screen.getByRole('dialog', { name: 'Сохранённая версия' });
    expect(within(dialog).getByText('История хранится в этом браузере.')).toBeTruthy();
    expect(within(dialog).getByText(/черновик только этого задания/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(draft().value).toBe('これはほんですか。');

    fireEvent.click(history().getByRole('button', { name: /これは ほん ですか。/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Заменить черновик этой версией' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(draft().value).toBe(questionText);
    expect(savedState().writingDraft).toBe('わたしはみきです。');
    expect(savedState().writingDrafts?.['location-existence']).toBe('ここにほんがあります。');
    expect(document.querySelector('.editor-notes')).toBeNull();
    expect(document.querySelector('.writing-example')).toBeNull();
    expect(savedState().writingHistory).toHaveLength(4);

    selectAssignment('introduction');
    fireEvent.click(history().getByRole('button', { name: /わたしはあきです。/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Заменить черновик этой версией' }));
    expect(draft().value).toBe(legacyText);
    expect(savedState().writingDraft).toBe(legacyText);
    expect(savedState().writingDrafts?.question).toBe(questionText);
    expect(savedState().writingHistory).toHaveLength(4);
  });

  it('does not deduplicate identical texts belonging to different assignments', async () => {
    await openWriting();
    write('テキスト');
    saveVersion();
    selectAssignment('question');
    write('テキスト');
    saveVersion();
    expect(savedState().writingHistory).toHaveLength(2);
    expect(getWritingHistory(savedState(), 'introduction')).toHaveLength(1);
    expect(getWritingHistory(savedState(), 'question')).toHaveLength(1);
    selectAssignment('introduction');
    saveVersion();
    expect(savedState().writingHistory).toHaveLength(2);
    expect(savedState().writingHistory[0]).not.toHaveProperty('assignmentId');
    expect(savedState().writingHistory[1].assignmentId).toBe('question');
  });

  it('recovers from unknown URL assignments without exposing or overwriting the introduction', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...createInitialState(), writingDraft: 'わたしはみきです。' }),
    );
    await openWriting('/writing?assignment=constructor');
    expect(screen.getByText(/Такого письменного задания нет/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Ваш черновик' })).toBeNull();
    expect(savedState().writingDraft).toBe('わたしはみきです。');
    selectAssignment('question');
    expect(draft().value).toBe('');
    selectAssignment('introduction');
    expect(draft().value).toBe('わたしはみきです。');
  });

  it('describes account-backed version storage accurately instead of claiming local-only storage', async () => {
    installTransport({
      ...createInitialState(),
      writingDrafts: { question: 'これはほんですか。' },
      writingHistory: [
        { id: 'account-version', text: 'これはほんですか。', createdAt, assignmentId: 'question' },
      ],
    });
    await openWriting('/writing?assignment=question');
    await waitFor(() => expect(draft().value).toBe('これはほんですか。'));
    fireEvent.click(history().getByRole('button'));
    const dialog = within(screen.getByRole('dialog', { name: 'Сохранённая версия' }));
    expect(
      dialog.getByText('История синхронизируется с аккаунтом; статус сохранения — сверху.'),
    ).toBeTruthy();
    expect(dialog.queryByText(/устройстве|этом браузере/)).toBeNull();
    expect(savedState()).not.toHaveProperty('writingDrafts');
  });
});
