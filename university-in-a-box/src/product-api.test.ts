// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, errorMessage, openBillingUrl, safeReturnTo } from './product-api';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('safeReturnTo', () => {
  it('keeps same-origin paths, including their query and fragment', () => {
    expect(safeReturnTo('/account?tab=security#password', '/welcome')).toBe(
      '/account?tab=security#password',
    );
  });

  it.each([
    null,
    '',
    'https://attacker.example/account',
    'javascript:alert(1)',
    '//attacker.example/account',
    '/\\attacker.example/account',
    '\\attacker.example/account',
    '/account\u0000next',
    '/account\nnext',
    '/account\rnext',
    '/account\tnext',
    '/account\u007fnext',
  ])('rejects unsafe return destination %j', (candidate) => {
    expect(safeReturnTo(candidate, '/welcome')).toBe('/welcome');
  });
});

describe('openBillingUrl', () => {
  it.each([
    'https://attacker.example/checkout',
    'https://checkout.stripe.com.attacker.example/session',
    'https://billing.stripe.com.attacker.example/session',
    'https://checkout.stripe.com:8443/session',
    'https://unexpected-user@billing.stripe.com/session',
    'http://checkout.stripe.com/session',
    '//checkout.stripe.com/session',
    'javascript:alert(1)',
  ])('refuses an untrusted billing redirect: %s', (candidate) => {
    expect(() => openBillingUrl(candidate)).toThrow();
  });
});

describe('apiRequest error handling', () => {
  it('binds authenticated data requests to the account displayed in the tab', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ revision: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/learning', { accountId: 'account-a' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/learning',
      expect.objectContaining({ headers: { 'X-Account-Id': 'account-a' } }),
    );
  });

  it('normalizes structured server errors and maps known authentication failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        {
          error: {
            code: 'INVALID_EMAIL_OR_PASSWORD',
            message: 'Internal authentication detail',
          },
        },
        401,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    let failure: unknown;
    try {
      await apiRequest('/api/auth/sign-in/email', {
        method: 'POST',
        body: { email: 'learner@example.com', password: 'wrong-password' },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 });
    expect(errorMessage(failure)).toBe('Не удалось войти. Проверьте адрес почты и пароль.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/sign-in/email',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'learner@example.com', password: 'wrong-password' }),
      }),
    );
  });

  it('uses the rate-limit message regardless of an upstream error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response({ error: { code: 'UPSTREAM_LIMIT', message: 'Try later' } }, 429),
        ),
    );

    let failure: unknown;
    try {
      await apiRequest('/api/auth/sign-in/email');
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ code: 'UPSTREAM_LIMIT', status: 429 });
    expect(errorMessage(failure)).toBe('Слишком много попыток. Подождите несколько минут.');
  });

  it('turns transport failures into a safe retryable network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('socket closed')));

    let failure: unknown;
    try {
      await apiRequest('/api/learning');
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
    expect(errorMessage(failure)).toBe(
      'Сервер не ответил. Проверьте соединение и попробуйте ещё раз.',
    );
  });
});
