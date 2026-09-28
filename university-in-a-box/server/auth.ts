import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { ResolvedApplicationConfig, SqliteDatabase } from './config';
import type { BillingService } from './billing';
import { ProductError } from './errors';
import {
  passwordResetEmail,
  verificationEmail,
  type MailDelivery,
} from './mail';

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_NOT_VERIFIED: 'Сначала подтвердите адрес электронной почты.',
  INVALID_EMAIL_OR_PASSWORD: 'Не удалось войти. Проверьте адрес почты и пароль.',
  INVALID_ORIGIN: 'Запрос отклонён политикой источника.',
  INVALID_PASSWORD: 'Текущий пароль не подошёл.',
  INVALID_TOKEN: 'Ссылка недействительна или уже использована.',
  PASSWORD_TOO_LONG: 'Пароль не должен быть длиннее 128 символов.',
  PASSWORD_TOO_SHORT: 'Используйте пароль длиной не меньше 12 символов.',
  TERMS_REQUIRED: 'Необходимо принять условия использования.',
  TOO_MANY_REQUESTS: 'Слишком много попыток. Подождите несколько минут.',
  USER_ALREADY_EXISTS: 'Этот адрес уже зарегистрирован.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Этот адрес уже зарегистрирован.',
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeCode(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/u.test(value) ? value : null;
}

export function publicAuthErrorMessage(code: string): string {
  return AUTH_ERROR_MESSAGES[code] ?? 'Не удалось выполнить действие с аккаунтом.';
}

function authProductError(error: unknown): ProductError {
  const source = record(error);
  const body = record(source?.body);
  const status = source?.statusCode;
  const statusCode =
    typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
      ? status
      : 503;
  const code = safeCode(body?.code) ?? (statusCode === 429 ? 'TOO_MANY_REQUESTS' : 'AUTH_REQUEST_FAILED');
  return new ProductError(code, statusCode, publicAuthErrorMessage(code));
}

function isAcceptedTerms(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { termsAccepted?: unknown }).termsAccepted === true;
}

function hasPassword(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { password?: unknown }).password === 'string' &&
    (value as { password: string }).password.length > 0
  );
}

export function createAuthentication(
  config: ResolvedApplicationConfig,
  db: SqliteDatabase,
  mail: MailDelivery,
  billing: BillingService,
) {
  return betterAuth({
    appName: 'University in a Box',
    database: db,
    baseURL: config.appUrl,
    secret: config.authSecret,
    trustedOrigins: [config.origin],
    logger: { disabled: true },
    telemetry: { enabled: false },
    onAPIError: {
      // Let Express emit the product's safe, stable error envelope.
      onError: (error) => {
        throw authProductError(error);
      },
    },
    advanced: {
      trustedProxyHeaders: config.trustProxyHops > 0,
      useSecureCookies: config.environment === 'production',
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 20,
      customRules: {
        '/sign-up/email': { window: 600, max: 5 },
        '/sign-in/email': { window: 600, max: 10 },
        '/request-password-reset': { window: 600, max: 5 },
      },
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: config.environment === 'production',
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        await mail.send(passwordResetEmail(config, { email: user.email, url, token }));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url, token }) => {
        await mail.send(verificationEmail(config, { email: user.email, url, token }));
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          if (await billing.canDeleteUser(user.id)) return;
          throw new APIError('BAD_REQUEST', {
            code: 'SUBSCRIPTION_CANCELLATION_REQUIRED',
            message: 'Сначала отмените активную подписку и дождитесь её завершения.',
          });
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === '/sign-up/email' && !isAcceptedTerms(context.body)) {
          throw new APIError('BAD_REQUEST', {
            code: 'TERMS_REQUIRED',
            message: 'Необходимо принять условия использования.',
          });
        }
        if (context.path === '/delete-user' && !hasPassword(context.body)) {
          throw new APIError('BAD_REQUEST', {
            code: 'PASSWORD_REQUIRED',
            message: 'Для удаления аккаунта нужен пароль.',
          });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user, context) => {
            const now = config.now();
            db.prepare(
              `INSERT OR IGNORE INTO account_profiles (user_id, trial_ends_at, onboarding_completed_at)
               VALUES (?, ?, NULL)`,
            ).run(user.id, new Date(now.getTime() + TRIAL_DURATION_MS).toISOString());
            if (context?.path === '/sign-up/email') {
              db.prepare(
              `INSERT OR IGNORE INTO terms_consents
                 (id, user_id, terms_version, terms_url, accepted_at)
                 VALUES (?, ?, ?, ?, ?)`,
              ).run(randomUUID(), user.id, config.terms.version, config.terms.url, now.toISOString());
            }
          },
        },
      },
    },
  });
}

export { TRIAL_DURATION_MS };
