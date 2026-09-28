import type { LearningEnvelope } from './product-types';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly current?: LearningEnvelope,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; accountId?: string } = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = window.setTimeout(abort, 20_000);
  try {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.accountId) headers['X-Account-Id'] = options.accountId;
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: Object.keys(headers).length ? headers : undefined,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const detail = data?.error && typeof data.error === 'object' ? data.error : data;
      throw new ApiError(
        typeof detail?.code === 'string' ? detail.code : 'REQUEST_FAILED',
        typeof detail?.message === 'string' ? detail.message : 'Не удалось выполнить запрос.',
        response.status,
        data?.current,
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      'NETWORK_ERROR',
      'Сервер не ответил. Проверьте соединение и попробуйте ещё раз.',
      0,
    );
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

const authMessages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Не удалось войти. Проверьте адрес почты и пароль.',
  EMAIL_NOT_VERIFIED: 'Сначала подтвердите почту по ссылке в письме.',
  USER_ALREADY_EXISTS: 'Этот адрес уже зарегистрирован. Войдите или восстановите пароль.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Этот адрес уже зарегистрирован. Попробуйте войти.',
  PASSWORD_TOO_SHORT: 'Используйте пароль длиной не меньше 12 символов.',
  PASSWORD_TOO_LONG: 'Пароль не должен быть длиннее 128 символов.',
  INVALID_PASSWORD: 'Текущий пароль не подошёл.',
  INVALID_TOKEN: 'Ссылка недействительна или уже использована. Запросите новую.',
  TOKEN_EXPIRED: 'Срок действия ссылки истёк. Запросите новую.',
  TOO_MANY_REQUESTS: 'Слишком много попыток. Подождите несколько минут.',
  TERMS_REQUIRED: 'Чтобы создать аккаунт, примите условия использования.',
  SUBSCRIPTION_REQUIRED: 'Пробный период закончился. Для сохранения на сервере нужна подписка.',
  ACCOUNT_MISMATCH: 'В другой вкладке изменился аккаунт. Сохраните эту версию в файл и войдите заново.',
};

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Не удалось выполнить действие. Попробуйте ещё раз.';
  if (error.status === 429) return authMessages.TOO_MANY_REQUESTS;
  return authMessages[error.code] ?? error.message;
}

export function safeReturnTo(value: string | null, fallback = '/'): string {
  return value && /^\/(?!\/)/.test(value) && !/[\\\u0000-\u001f\u007f]/.test(value)
    ? value
    : fallback;
}

export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function openBillingUrl(url: string) {
  const target = new URL(url);
  if (
    !['https://checkout.stripe.com', 'https://billing.stripe.com'].includes(target.origin) ||
    target.username ||
    target.password
  ) {
    throw new Error('Unexpected billing destination');
  }
  window.location.assign(target.href);
}
