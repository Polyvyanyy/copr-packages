// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncBanner } from './components/SyncBanner';
import { createInitialState, STORAGE_KEY } from './domain/progress';
import type { LearningState } from './domain/types';
import { LearningProvider, useLearning } from './learning-context';
import type { LearningEnvelope } from './product-types';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function stateWithDraft(writingDraft: string): LearningState {
  return { ...createInitialState(), writingDraft };
}

function envelope(writingDraft: string, revision: number): LearningEnvelope {
  return {
    state: stateWithDraft(writingDraft),
    revision,
    updatedAt: '2026-09-06T12:00:00.000Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function LearningProbe() {
  const { state, setState, storageError, syncStatus, cloudReady, flush, resetProgress } = useLearning();
  return (
    <>
      <label>
        Черновик
        <textarea
          value={state.writingDraft}
          onChange={(event) =>
            setState((current) => ({ ...current, writingDraft: event.target.value }))
          }
        />
      </label>
      <button type="button" onClick={() => void flush()}>
        Сохранить сейчас
      </button>
      <button type="button" onClick={() => void resetProgress()}>
        Сбросить сейчас
      </button>
      <output data-testid="sync-status">{syncStatus}</output>
      <output data-testid="cloud-ready">{String(cloudReady)}</output>
      <output data-testid="storage-error">{storageError ?? ''}</output>
    </>
  );
}

function renderLearning(accountId = 'account-a') {
  return render(
    <LearningProvider accountId={accountId}>
      <LearningProbe />
      <SyncBanner />
    </LearningProvider>,
  );
}

function learningPutCalls(fetchMock: { mock: { calls: unknown[][] } }) {
  return fetchMock.mock.calls.filter(
    ([path, options]) =>
      path === '/api/learning' && (options as RequestInit | undefined)?.method === 'PUT',
  );
}

function putPayload(call: unknown[]): { state: LearningState; revision: number } {
  return JSON.parse((call[1] as RequestInit).body as string) as {
    state: LearningState;
    revision: number;
  };
}

function draftValue() {
  return (screen.getByLabelText('Черновик') as HTMLTextAreaElement).value;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('account learning synchronization', () => {
  it('allows a revision-bound reset after subscription expiry without clearing guest data', async () => {
    const guest = JSON.stringify(stateWithDraft('guest-only'));
    localStorage.setItem(STORAGE_KEY, guest);
    const fetchMock = vi.fn((_path: unknown, options?: RequestInit) => {
      if (options?.method === 'PUT') return Promise.resolve(response({
        error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Trial expired' },
      }, 402));
      if (options?.method === 'DELETE') return Promise.resolve(response(envelope('', 4)));
      return Promise.resolve(response(envelope('saved draft', 3)));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderLearning();
    await waitFor(() => expect(draftValue()).toBe('saved draft'));
    fireEvent.change(screen.getByLabelText('Черновик'), { target: { value: 'unsaved edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сейчас' }));
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('offline'));

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить сейчас' }));
    await waitFor(() => expect(draftValue()).toBe(''));
    expect(screen.getByTestId('sync-status').textContent).toBe('synced');
    expect(fetchMock).toHaveBeenCalledWith('/api/learning', expect.objectContaining({
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-Account-Id': 'account-a' },
      body: JSON.stringify({ revision: 3 }),
    }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(guest);
  });

  it('keeps the current draft when the server refuses a reset', async () => {
    vi.stubGlobal('fetch', vi.fn((_path: unknown, options?: RequestInit) => Promise.resolve(
      options?.method === 'DELETE'
        ? response({ error: { code: 'REQUEST_FAILED', message: 'Not deleted' } }, 500)
        : response(envelope('keep this draft', 3)),
    )));
    renderLearning();
    await waitFor(() => expect(draftValue()).toBe('keep this draft'));
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить сейчас' }));
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('offline'));
    expect(draftValue()).toBe('keep this draft');
  });

  it('waits for an older save before resetting and prevents edits during deletion', async () => {
    const saving = deferred<Response>();
    const deleting = deferred<Response>();
    const fetchMock = vi.fn((_path: unknown, options?: RequestInit) => {
      if (options?.method === 'PUT') return saving.promise;
      if (options?.method === 'DELETE') return deleting.promise;
      return Promise.resolve(response(envelope('initial draft', 7)));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderLearning();
    await waitFor(() => expect(draftValue()).toBe('initial draft'));
    fireEvent.change(screen.getByLabelText('Черновик'), { target: { value: 'before reset' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сейчас' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить сейчас' }));
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
    await act(async () => saving.resolve(response(envelope('before reset', 8))));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/learning', expect.objectContaining({
      method: 'DELETE', body: JSON.stringify({ revision: 8 }),
    })));
    fireEvent.change(screen.getByLabelText('Черновик'), { target: { value: 'during reset' } });
    expect(draftValue()).toBe('before reset');
    await act(async () => deleting.resolve(response(envelope('', 9))));
    await waitFor(() => expect(draftValue()).toBe(''));
    expect(learningPutCalls(fetchMock)).toHaveLength(1);
  });

  it('loads account state without uploading guest data or caching private state locally', async () => {
    const guest = stateWithDraft('guest-only draft');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
    const fetchMock = vi.fn().mockResolvedValue(response(envelope('server-only draft', 4)));
    vi.stubGlobal('fetch', fetchMock);

    renderLearning();

    await waitFor(() => expect(draftValue()).toBe('server-only draft'));
    expect(screen.getByTestId('sync-status').textContent).toBe('synced');
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/learning');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(guest));

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сейчас' }));
    expect(learningPutCalls(fetchMock)).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('server-only draft');
  });

  it('serializes saves and preserves an edit made while the first save is in flight', async () => {
    const firstSave = deferred<Response>();
    const secondSave = deferred<Response>();
    let putCount = 0;
    let savesInFlight = 0;
    let maximumSavesInFlight = 0;
    const fetchMock = vi.fn((path: unknown, options?: RequestInit) => {
      if (path === '/api/learning' && options?.method === 'PUT') {
        putCount += 1;
        savesInFlight += 1;
        maximumSavesInFlight = Math.max(maximumSavesInFlight, savesInFlight);
        const save = putCount === 1 ? firstSave : secondSave;
        return save.promise.finally(() => {
          savesInFlight -= 1;
        });
      }
      return Promise.resolve(response(envelope('from-server', 7)));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLearning();
    await waitFor(() => expect(draftValue()).toBe('from-server'));

    fireEvent.change(screen.getByLabelText('Черновик'), { target: { value: 'first edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сейчас' }));
    await waitFor(() => expect(learningPutCalls(fetchMock)).toHaveLength(1));
    expect(putPayload(learningPutCalls(fetchMock)[0])).toMatchObject({
      revision: 7,
      state: { writingDraft: 'first edit' },
    });

    fireEvent.change(screen.getByLabelText('Черновик'), { target: { value: 'second edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сейчас' }));
    expect(learningPutCalls(fetchMock)).toHaveLength(1);

    await act(async () => {
      firstSave.resolve(response(envelope('first edit', 8)));
      await Promise.resolve();
    });

    await waitFor(() => expect(learningPutCalls(fetchMock)).toHaveLength(2));
    expect(putPayload(learningPutCalls(fetchMock)[1])).toMatchObject({
      revision: 8,
      state: { writingDraft: 'second edit' },
    });
    expect(maximumSavesInFlight).toBe(1);

    await act(async () => {
      secondSave.resolve(response(envelope('second edit', 9)));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('synced'));
  });

  it('does not overwrite a local draft after a revision conflict until the learner chooses server state', async () => {
    const current = envelope('changed elsewhere', 12);
    let putCount = 0;
    const fetchMock = vi.fn((path: unknown, options?: RequestInit) => {
      if (path === '/api/learning' && options?.method === 'PUT') {
        putCount += 1;
        return Promise.resolve(
          response(
            {
              error: { code: 'REVISION_CONFLICT', message: 'Revision changed' },
              current,
            },
            409,
          ),
        );
      }
      return Promise.resolve(response(envelope('initial server draft', 11)));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLearning();
    await waitFor(() => expect(draftValue()).toBe('initial server draft'));
    fireEvent.change(screen.getByLabelText('Черновик'), { target: { value: 'my unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сейчас' }));

    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('conflict'));
    expect(draftValue()).toBe('my unsaved draft');
    expect(putCount).toBe(1);
    expect(putPayload(learningPutCalls(fetchMock)[0])).toMatchObject({ revision: 11 });

    fireEvent.click(screen.getByRole('button', { name: 'Загрузить серверную версию' }));
    await waitFor(() => expect(draftValue()).toBe('changed elsewhere'));
    expect(screen.getByTestId('sync-status').textContent).toBe('synced');
    expect(putCount).toBe(1);
  });

  it('rebases and saves the local choice only after the learner explicitly keeps it', async () => {
    const remote = envelope('other device version', 16);
    let putCount = 0;
    const fetchMock = vi.fn((path: unknown, options?: RequestInit) => {
      if (path === '/api/learning' && options?.method === 'PUT') {
        putCount += 1;
        if (putCount === 1) {
          return Promise.resolve(
            response(
              {
                error: { code: 'REVISION_CONFLICT', message: 'Revision changed' },
                current: remote,
              },
              409,
            ),
          );
        }
        return Promise.resolve(response(envelope('local choice', 17)));
      }
      return Promise.resolve(response(envelope('initial server draft', 15)));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLearning();
    await waitFor(() => expect(draftValue()).toBe('initial server draft'));
    fireEvent.change(screen.getByLabelText('Черновик'), { target: { value: 'local choice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сейчас' }));
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('conflict'));

    fireEvent.click(screen.getByRole('button', { name: 'Заменить серверную этой версией' }));
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('synced'));
    expect(draftValue()).toBe('local choice');
    expect(putCount).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сейчас' }));
    await waitFor(() => expect(putCount).toBe(2));
    expect(putPayload(learningPutCalls(fetchMock)[1])).toMatchObject({
      revision: 16,
      state: { writingDraft: 'local choice' },
    });
  });

  it('retains a failed save in memory and sends the same change when the learner retries', async () => {
    let putCount = 0;
    const fetchMock = vi.fn((path: unknown, options?: RequestInit) => {
      if (path === '/api/learning' && options?.method === 'PUT') {
        putCount += 1;
        if (putCount === 1) return Promise.reject(new TypeError('network unavailable'));
        return Promise.resolve(response(envelope('keep this edit', 21)));
      }
      return Promise.resolve(response(envelope('initial server draft', 20)));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLearning();
    await waitFor(() => expect(draftValue()).toBe('initial server draft'));
    fireEvent.change(screen.getByLabelText('Черновик'), { target: { value: 'keep this edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить сейчас' }));

    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('offline'));
    expect(draftValue()).toBe('keep this edit');
    expect(screen.getByTestId('storage-error').textContent).toContain(
      'Изменения ещё в этой вкладке',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(putCount).toBe(2));
    expect(putPayload(learningPutCalls(fetchMock)[1])).toMatchObject({
      revision: 20,
      state: { writingDraft: 'keep this edit' },
    });
    await waitFor(() => expect(screen.getByTestId('sync-status').textContent).toBe('synced'));
  });

  it('ignores an old account load after unmounting instead of replacing the next account state', async () => {
    const firstLoad = deferred<Response>();
    const secondLoad = deferred<Response>();
    const guest = stateWithDraft('guest data must remain local');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(() => secondLoad.promise);
    vi.stubGlobal('fetch', fetchMock);

    const firstView = renderLearning('account-a');
    await waitFor(() => expect(fetchMock.mock.calls).toHaveLength(1));
    firstView.unmount();
    renderLearning('account-b');
    await waitFor(() => expect(fetchMock.mock.calls).toHaveLength(2));

    await act(async () => {
      secondLoad.resolve(response(envelope('account-b draft', 31)));
      await Promise.resolve();
    });
    await waitFor(() => expect(draftValue()).toBe('account-b draft'));

    await act(async () => {
      firstLoad.resolve(response(envelope('account-a private draft', 30)));
      await Promise.resolve();
    });

    expect(draftValue()).toBe('account-b draft');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(guest));
  });
});
