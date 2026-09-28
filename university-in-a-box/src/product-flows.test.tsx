// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import App from './App';
import { createInitialState, STORAGE_KEY } from './domain/progress';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
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

const productConfig = {
  environment: 'test',
  billing: { enabled: false, mode: 'disabled', monthlyAmount: 2000, currency: 'usd' },
  operator: { name: null, email: null, address: null },
  emailEnabled: false,
};

function installGuestTransport() {
  const fetchMock = vi.fn((path: unknown, _options?: RequestInit) => {
    if (path === '/api/config') return Promise.resolve(response(productConfig));
    if (path === '/api/account') {
      return Promise.resolve(
        response({ error: { code: 'UNAUTHORIZED', message: 'No active session' } }, 401),
      );
    }
    if (path === '/api/auth/sign-up/email') return Promise.resolve(response({}));
    return Promise.reject(new Error(`Unexpected request: ${String(path)}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function openApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('authentication routes', () => {
  it.each([
    ['/auth/sign-in', /Рады видеть вас снова/],
    ['/auth/sign-up', /Ваш японский начинается здесь/],
    ['/auth/forgot-password', /Вернёмся к обучению/],
    ['/auth/reset-password', /Новый пароль/],
  ])('renders %s as an available authentication route', async (path, heading) => {
    installGuestTransport();

    openApp(path);

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy();
  });

  it('requires visible terms consent and sends accepted consent in the actual registration request', async () => {
    const fetchMock = installGuestTransport();
    openApp('/auth/sign-up');

    const consent = await screen.findByRole('checkbox');
    expect((consent as HTMLInputElement).required).toBe(true);
    expect((consent as HTMLInputElement).checked).toBe(false);

    fireEvent.change(screen.getByLabelText(/Как к вам обращаться/), {
      target: { value: 'Мика' },
    });
    fireEvent.change(screen.getByLabelText(/Электронная почта/), {
      target: { value: 'mika@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Пароль/), {
      target: { value: 'long-enough-password' },
    });
    fireEvent.change(screen.getByLabelText(/Повторите пароль/), {
      target: { value: 'long-enough-password' },
    });
    fireEvent.click(consent);
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([path]) => path === '/api/auth/sign-up/email'),
      ).toHaveLength(1),
    );
    const signUpCall = fetchMock.mock.calls.find(([path]) => path === '/api/auth/sign-up/email');
    expect(signUpCall).toBeDefined();
    const request = signUpCall?.[1];
    if (!request) throw new Error('The registration request did not include request options.');
    const body = JSON.parse(request.body as string);
    expect(body).toMatchObject({
      name: 'Мика',
      email: 'mika@example.com',
      password: 'long-enough-password',
      termsAccepted: true,
    });
    expect(typeof body.callbackURL).toBe('string');
    expect(body.callbackURL).toContain('/auth/sign-in?verified=done');

    expect((await screen.findByRole('status')).textContent).toContain('Остался один шаг');
  });

  it('returns to the isolated guest state after logout without writing private account learning data', async () => {
    const guest = { ...createInitialState(), writingDraft: 'guest-only draft' };
    const privateLearning = { ...createInitialState(), writingDraft: 'account-private draft' };
    const learningLoad = deferred<Response>();
    let signedOut = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
    const fetchMock = vi.fn((path: unknown, _options?: RequestInit) => {
      if (path === '/api/config') return Promise.resolve(response(productConfig));
      if (path === '/api/account') {
        return Promise.resolve(
          signedOut
            ? response({ error: { code: 'UNAUTHORIZED', message: 'No active session' } }, 401)
            : response({
                user: {
                  id: 'account-a',
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
              }),
        );
      }
      if (path === '/api/learning') return learningLoad.promise;
      if (path === '/api/auth/sign-out') {
        signedOut = true;
        return Promise.resolve(response({}));
      }
      return Promise.reject(new Error(`Unexpected request: ${String(path)}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    openApp('/account');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === '/api/learning')).toBe(true),
    );
    await act(async () => {
      learningLoad.resolve(
        response({
          state: privateLearning,
          revision: 1,
          updatedAt: '2026-09-06T12:00:00.000Z',
        }),
      );
      await Promise.resolve();
    });
    await screen.findByText('mika@example.com');

    fireEvent.click(await screen.findByRole('button', { name: 'Выйти' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/sign-out')).toBe(true),
    );
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([path]) => path === '/api/account')).toHaveLength(2),
    );
    await waitFor(() =>
      expect(localStorage.getItem(STORAGE_KEY)).not.toContain('account-private draft'),
    );
    expect(localStorage.getItem(STORAGE_KEY)).toContain('guest-only draft');
  });
});
