import { createHmac, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import express from 'express';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { createAuthentication, publicAuthErrorMessage, TRIAL_DURATION_MS } from './auth';
import { BillingService } from './billing';
import {
  type ApplicationConfig,
  type ResolvedApplicationConfig,
  resolveApplicationConfig,
  type SqliteDatabase,
} from './config';
import { openDatabase, runApplicationMigrations } from './database';
import { isProductError, ProductError } from './errors';
import { createMailDelivery, type MailDelivery } from './mail';
import { flashcards } from '../src/domain/curriculum';
import { createInitialState, parseLearningState } from '../src/domain/progress';
import type { LearningState } from '../src/domain/types';
import type {
  AccountSnapshot,
  ApiErrorEnvelope,
  LearningEnvelope,
  ProductConfig,
  SupportCategory,
  SupportTicket,
} from '../src/product-types';

const JSON_LIMIT_BYTES = 2 * 1024 * 1024;
const AUTH_LIMIT_BYTES = 32 * 1024;
const WEBHOOK_LIMIT_BYTES = 256 * 1024;
const FREE_LESSON_IDS = new Set(['hiragana-vowels', 'hiragana-k', 'first-words']);
const FREE_CARD_IDS = new Set(
  flashcards
    .filter((card) => card.lessonId && FREE_LESSON_IDS.has(card.lessonId))
    .map((card) => card.id),
);

interface AccountProfileRow {
  trial_ends_at: string;
  onboarding_completed_at: string | null;
}

interface LearningRow {
  revision: number;
  state_json: string;
  updated_at: string;
}

interface TermsRow {
  terms_version: string;
  terms_url: string;
  accepted_at: string;
}

interface SupportTicketRow {
  id: string;
  category: SupportCategory;
  message: string;
  created_at: string;
  status: 'open' | 'closed';
}

interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

interface AuthenticatedLocals {
  user?: AuthenticatedUser;
}

export interface CreatedApplication {
  app: Express;
  auth: ReturnType<typeof createAuthentication>;
  db: SqliteDatabase;
  config: ResolvedApplicationConfig;
  mail: MailDelivery;
  billing: BillingService;
  close: () => void;
}

function errorBody(error: ProductError): ApiErrorEnvelope {
  return { error: { code: error.code, message: error.message } };
}

function sendProductError(response: Response, error: ProductError): void {
  response.status(error.status).json(errorBody(error));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? (value as Record<string, unknown>) : null;
}

function valueIsInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function readContentLength(request: Request): number | null {
  const value = request.get('content-length');
  if (!value) return null;
  if (!/^\d+$/u.test(value)) return Number.NaN;
  return Number(value);
}

function requestLimitFor(path: string): number {
  if (path === '/api/billing/webhook') return WEBHOOK_LIMIT_BYTES;
  if (path.startsWith('/api/auth/')) return AUTH_LIMIT_BYTES;
  return JSON_LIMIT_BYTES;
}

function boundedBody(): RequestHandler {
  return (request, response, next) => {
    const maximum = requestLimitFor(request.path);
    const declared = readContentLength(request);
    if (declared !== null && (!Number.isFinite(declared) || declared > maximum)) {
      sendProductError(response, new ProductError('BODY_TOO_LARGE', 413, 'Запрос слишком большой.'));
      return;
    }

    let received = 0;
    let rejected = false;
    const removeListener = () => request.removeListener('data', onData);
    const onData = (chunk: Buffer) => {
      received += chunk.length;
      if (rejected || received <= maximum) return;
      rejected = true;
      removeListener();
      if (!response.headersSent) {
        sendProductError(response, new ProductError('BODY_TOO_LARGE', 413, 'Запрос слишком большой.'));
      }
      request.destroy();
    };
    request.on('data', onData);
    response.once('finish', removeListener);
    response.once('close', removeListener);
    next();
  };
}

function securityHeaders(config: ResolvedApplicationConfig): RequestHandler {
  return (_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (config.environment === 'production') {
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';",
      );
      response.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    next();
  };
}

function noStoreApiResponses(): RequestHandler {
  return (request, response, next) => {
    if (request.path.startsWith('/api/')) {
      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.setHeader('Pragma', 'no-cache');
    }
    next();
  };
}

function requireSameOrigin(config: ResolvedApplicationConfig): RequestHandler {
  return (request, response, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
    if (request.path === '/billing/webhook') return next();
    if (request.get('origin') !== config.origin) {
      sendProductError(response, new ProductError('INVALID_ORIGIN', 403, 'Запрос отклонён политикой источника.'));
      return;
    }
    next();
  };
}

function persistentRateLimit(
  config: ResolvedApplicationConfig,
  db: SqliteDatabase,
  scope: string,
  maximum: number,
  windowMs: number,
): RequestHandler {
  return (request, response, next) => {
    const now = config.now().getTime();
    const windowStartedAt = Math.floor(now / windowMs) * windowMs;
    const subject = createHmac('sha256', config.authSecret)
      .update(`${scope}:${request.ip}`)
      .digest('base64url');
    const row = db
      .prepare(
        `INSERT INTO api_rate_limits (scope, subject_hash, window_started_at, count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(scope, subject_hash, window_started_at)
         DO UPDATE SET count = api_rate_limits.count + 1
         RETURNING count`,
      )
      .get(scope, subject, windowStartedAt) as { count: number } | undefined;
    if (!row || row.count > maximum) {
      sendProductError(response, new ProductError('TOO_MANY_REQUESTS', 429, 'Слишком много запросов. Попробуйте позже.'));
      return;
    }
    if (Math.random() < 0.01) {
      db.prepare('DELETE FROM api_rate_limits WHERE window_started_at < ?').run(windowStartedAt - 24 * 60 * 60 * 1_000);
    }
    next();
  };
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function authErrorCode(body: Buffer): string {
  try {
    const payload = asRecord(JSON.parse(body.toString('utf8')));
    const code = payload?.code;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/u.test(code)) return code;
  } catch {
    // Auth endpoint errors must never expose an implementation response body.
  }
  return 'AUTH_REQUEST_FAILED';
}

function authErrorEnvelope(body: Buffer): Buffer {
  const code = authErrorCode(body);
  return Buffer.from(
    JSON.stringify({ error: { code, message: publicAuthErrorMessage(code) } }),
    'utf8',
  );
}

type NodeAuthHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

/**
 * Better Auth owns its endpoint behavior; this adapter only normalizes failed HTTP bodies.
 */
function normalizedAuthHandler(nodeAuthHandler: NodeAuthHandler): RequestHandler {
  return (request, response, next) => {
    const originalWriteHead = response.writeHead.bind(response);
    const originalWrite = response.write.bind(response);
    const originalEnd = response.end.bind(response);
    const chunks: Buffer[] = [];
    let ended = false;

    const restore = () => {
      response.writeHead = originalWriteHead;
      response.write = originalWrite;
      response.end = originalEnd;
    };
    const collect = (chunk: unknown, encoding?: BufferEncoding) => {
      if (chunk === undefined || chunk === null) return;
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
        return;
      }
      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
        return;
      }
      if (typeof chunk === 'string') chunks.push(Buffer.from(chunk, encoding ?? 'utf8'));
    };

    response.writeHead = ((statusCode: number) => {
      response.statusCode = statusCode;
      return response;
    }) as typeof response.writeHead;
    response.write = ((chunk: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
      collect(chunk, typeof encoding === 'string' ? encoding : undefined);
      const done = typeof encoding === 'function' ? encoding : callback;
      if (done) queueMicrotask(done);
      return true;
    }) as typeof response.write;
    response.end = ((chunk?: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void) => {
      if (ended) return response;
      ended = true;
      collect(chunk, typeof encoding === 'string' ? encoding : undefined);
      const done = typeof encoding === 'function' ? encoding : callback;
      const body = Buffer.concat(chunks);
      const output =
        response.statusCode >= 400 && response.statusCode <= 599
          ? authErrorEnvelope(body)
          : body;
      if (response.statusCode >= 400 && response.statusCode <= 599) {
        response.removeHeader('content-length');
        response.setHeader('content-type', 'application/json; charset=utf-8');
      }
      restore();
      return originalEnd(output, done);
    }) as typeof response.end;

    void nodeAuthHandler(request, response).catch((error: unknown) => {
      restore();
      if (!response.headersSent) {
        next(
          isProductError(error)
            ? error
            : new ProductError('AUTH_UNAVAILABLE', 503, 'Вход временно недоступен.'),
        );
      }
    });
  };
}

function ensureAccountProfile(
  db: SqliteDatabase,
  config: ResolvedApplicationConfig,
  userId: string,
): AccountProfileRow {
  let profile = db
    .prepare('SELECT trial_ends_at, onboarding_completed_at FROM account_profiles WHERE user_id = ?')
    .get(userId) as AccountProfileRow | undefined;
  if (profile) return profile;

  const now = config.now();
  db.prepare(
    `INSERT OR IGNORE INTO account_profiles (user_id, trial_ends_at, onboarding_completed_at)
     VALUES (?, ?, NULL)`,
  ).run(userId, new Date(now.getTime() + TRIAL_DURATION_MS).toISOString());
  profile = db
    .prepare('SELECT trial_ends_at, onboarding_completed_at FROM account_profiles WHERE user_id = ?')
    .get(userId) as AccountProfileRow | undefined;
  if (!profile) throw new ProductError('ACCOUNT_UNAVAILABLE', 503, 'Аккаунт временно недоступен.');
  return profile;
}

function getLearningEnvelope(db: SqliteDatabase, userId: string): LearningEnvelope {
  const row = db
    .prepare('SELECT revision, state_json, updated_at FROM learning_states WHERE user_id = ?')
    .get(userId) as LearningRow | undefined;
  if (!row) return { state: createInitialState(), revision: 0, updatedAt: null };
  return {
    state: parseLearningState(row.state_json),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function learningInput(value: unknown): LearningState {
  const record = asRecord(value);
  if (!record || record.version !== 1) {
    throw new ProductError('INVALID_LEARNING_STATE', 400, 'Состояние обучения имеет неверный формат.');
  }
  return parseLearningState(record);
}

function sortedObject<T>(entries: [string, T][]): Record<string, T> {
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

function premiumProgressProjection(state: LearningState): Record<string, unknown> {
  return {
    attempts: state.attempts
      .filter((attempt) => !FREE_LESSON_IDS.has(attempt.lessonId))
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id)),
    cardReviews: sortedObject(
      Object.entries(state.cardReviews).filter(([cardId]) => !FREE_CARD_IDS.has(cardId)),
    ),
    reflections: sortedObject(
      Object.entries(state.reflections).filter(([reflectionId]) => !FREE_LESSON_IDS.has(reflectionId)),
    ),
  };
}

function isEmptyPremiumProjection(projection: Record<string, unknown>): boolean {
  return Object.values(projection).every((value) => {
    if (Array.isArray(value)) return value.length === 0;
    return Object.keys(value as Record<string, unknown>).length === 0;
  });
}

function canPersistFreeState(current: LearningState, next: LearningState): boolean {
  const currentPremium = premiumProgressProjection(current);
  const nextPremium = premiumProgressProjection(next);
  return (
    JSON.stringify(currentPremium) === JSON.stringify(nextPremium) || isEmptyPremiumProjection(nextPremium)
  );
}

function authenticatedUser(response: Response): AuthenticatedUser {
  const user = (response.locals as AuthenticatedLocals).user;
  if (!user) throw new ProductError('UNAUTHENTICATED', 401, 'Требуется вход в аккаунт.');
  return user;
}

function sessionRequired(auth: ReturnType<typeof createAuthentication>): RequestHandler {
  return (request, response, next) => {
    void auth.api
      .getSession({ headers: fromNodeHeaders(request.headers) })
      .then((session) => {
        if (!session) {
          next(new ProductError('UNAUTHENTICATED', 401, 'Требуется вход в аккаунт.'));
          return;
        }
        (response.locals as AuthenticatedLocals).user = {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          emailVerified: session.user.emailVerified,
        };
        next();
      })
      .catch(() => next(new ProductError('UNAUTHENTICATED', 401, 'Требуется вход в аккаунт.')));
  };
}

function accountSnapshot(
  db: SqliteDatabase,
  config: ResolvedApplicationConfig,
  billing: BillingService,
  user: AuthenticatedUser,
): AccountSnapshot {
  const profile = ensureAccountProfile(db, config, user.id);
  return {
    user,
    subscription: billing.subscriptionSnapshot({ trialEndsAt: profile.trial_ends_at }, user.id),
    onboardingComplete: profile.onboarding_completed_at !== null,
  };
}

function parseSupportTicket(value: unknown): { category: SupportCategory; message: string } {
  const record = asRecord(value);
  const category = record?.category;
  const rawMessage = record?.message;
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  if (
    (category !== 'account' && category !== 'billing' && category !== 'content' && category !== 'other') ||
    message.length === 0 ||
    message.length > 5_000
  ) {
    throw new ProductError('INVALID_SUPPORT_TICKET', 400, 'Проверьте категорию и текст обращения.');
  }
  return { category, message };
}

function productConfig(
  config: ResolvedApplicationConfig,
  billing: BillingService,
  mail: MailDelivery,
): ProductConfig {
  return {
    environment: config.environment,
    billing: {
      enabled: billing.enabled,
      mode: billing.mode,
      monthlyAmount: 2_000,
      currency: 'usd',
    },
    operator: config.operator,
    emailEnabled: mail.enabled,
  };
}

function APIErrorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (response.headersSent) return;
  if (isProductError(error)) {
    sendProductError(response, error);
    return;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: unknown }).type === 'entity.too.large'
  ) {
    sendProductError(response, new ProductError('BODY_TOO_LARGE', 413, 'Запрос слишком большой.'));
    return;
  }
  if (error instanceof SyntaxError) {
    sendProductError(response, new ProductError('INVALID_JSON', 400, 'Запрос должен содержать корректный JSON.'));
    return;
  }
  sendProductError(response, new ProductError('INTERNAL_ERROR', 500, 'Внутренняя ошибка сервера.'));
}

export async function createApplication(input: ApplicationConfig = {}): Promise<CreatedApplication> {
  const config = resolveApplicationConfig(input);
  const database = openDatabase(config);
  let billing: BillingService;
  try {
    billing = await BillingService.create(config, database.db);
    const mail = createMailDelivery(config, config.mailDelivery);
    const auth = createAuthentication(config, database.db, mail, billing);
    const authMigrations = await getMigrations(auth.options);
    await authMigrations.runMigrations();
    runApplicationMigrations(database.db, config.now().toISOString());

    const app = express();
    app.disable('x-powered-by');
    app.set('etag', false);
    app.set('trust proxy', config.trustProxyHops);
    app.use(securityHeaders(config));
    app.use(noStoreApiResponses());
    app.use(boundedBody());

    app.post(
      '/api/billing/webhook',
      express.raw({ type: 'application/json', limit: WEBHOOK_LIMIT_BYTES }),
      asyncRoute(async (request, response) => {
        if (!Buffer.isBuffer(request.body)) {
          throw new ProductError('INVALID_WEBHOOK_EVENT', 400, 'Неверный платежный запрос.');
        }
        await billing.handleWebhook(request.body, request.get('stripe-signature') ?? undefined);
        response.status(200).json({ received: true });
      }),
    );

    app.use('/api', requireSameOrigin(config));
    const nodeAuthHandler = toNodeHandler(auth.handler);
    app.all('/api/auth/*splat', normalizedAuthHandler(nodeAuthHandler));

    app.use(express.json({ limit: JSON_LIMIT_BYTES, strict: true, type: ['application/json', 'application/*+json'] }));

    app.get('/api/config', (_request, response) => {
      response.json(productConfig(config, billing, mail));
    });

    app.get('/api/account', sessionRequired(auth), (request, response, next) => {
      try {
        void request;
        response.json(accountSnapshot(database.db, config, billing, authenticatedUser(response)));
      } catch (error) {
        next(error);
      }
    });

    app.get('/api/learning', sessionRequired(auth), (request, response, next) => {
      try {
        void request;
        response.json(getLearningEnvelope(database.db, authenticatedUser(response).id));
      } catch (error) {
        next(error);
      }
    });

    app.put(
      '/api/learning',
      sessionRequired(auth),
      persistentRateLimit(config, database.db, 'learning-write', 120, 60 * 1_000),
      (request, response, next) => {
        try {
          const body = asRecord(request.body);
          if (!body || !valueIsInteger(body.revision) || body.revision < 0) {
            throw new ProductError('INVALID_REVISION', 400, 'Номер версии имеет неверный формат.');
          }
          const requestedRevision = body.revision;
          const nextState = learningInput(body.state);
          const user = authenticatedUser(response);
          const writeLearning = database.db.transaction(() => {
            const current = getLearningEnvelope(database.db, user.id);
            if (current.revision !== requestedRevision) return { kind: 'conflict' as const, current };

            const profile = ensureAccountProfile(database.db, config, user.id);
            const subscription = billing.subscriptionSnapshot({ trialEndsAt: profile.trial_ends_at }, user.id);
            if (subscription.access === 'free' && !canPersistFreeState(current.state, nextState)) {
              throw new ProductError(
                'SUBSCRIPTION_REQUIRED',
                403,
                'После пробного периода облачный прогресс доступен для первых трёх уроков.',
              );
            }

            const updatedAt = config.now().toISOString();
            const envelope: LearningEnvelope = {
              state: nextState,
              revision: current.revision + 1,
              updatedAt,
            };
            if (current.updatedAt === null) {
              const write = database.db
                .prepare(
                  `INSERT INTO learning_states (user_id, revision, state_json, updated_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(user_id) DO NOTHING`,
                )
                .run(user.id, envelope.revision, JSON.stringify(nextState), updatedAt);
              if (write.changes !== 1) {
                return {
                  kind: 'conflict' as const,
                  current: getLearningEnvelope(database.db, user.id),
                };
              }
            } else {
              const write = database.db
                .prepare(
                  `UPDATE learning_states
                   SET revision = ?, state_json = ?, updated_at = ?
                   WHERE user_id = ? AND revision = ?`,
                )
                .run(
                  envelope.revision,
                  JSON.stringify(nextState),
                  updatedAt,
                  user.id,
                  current.revision,
                );
              if (write.changes !== 1) {
                return {
                  kind: 'conflict' as const,
                  current: getLearningEnvelope(database.db, user.id),
                };
              }
            }
            return { kind: 'updated' as const, envelope };
          });
          const result = writeLearning.immediate();

          if (result.kind === 'conflict') {
            response.status(409).json({
              error: { code: 'REVISION_CONFLICT', message: 'Состояние изменилось в другой сессии.' },
              current: result.current,
            });
            return;
          }
          response.json(result.envelope);
        } catch (error) {
          next(error);
        }
      },
    );

    app.post('/api/account/onboarding', sessionRequired(auth), (request, response, next) => {
      try {
        void request;
        const user = authenticatedUser(response);
        ensureAccountProfile(database.db, config, user.id);
        database.db
          .prepare(
            `UPDATE account_profiles
             SET onboarding_completed_at = COALESCE(onboarding_completed_at, ?)
             WHERE user_id = ?`,
          )
          .run(config.now().toISOString(), user.id);
        response.json({ completed: true });
      } catch (error) {
        next(error);
      }
    });

    app.get('/api/account/export', sessionRequired(auth), (request, response, next) => {
      try {
        void request;
        const user = authenticatedUser(response);
        const profile = ensureAccountProfile(database.db, config, user.id);
        const terms = database.db
          .prepare(
            'SELECT terms_version, terms_url, accepted_at FROM terms_consents WHERE user_id = ?',
          )
          .get(user.id) as TermsRow | undefined;
        const tickets = database.db
          .prepare(
            `SELECT id, category, message, created_at, status
             FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC`,
          )
          .all(user.id) as SupportTicketRow[];
        response.setHeader('Content-Disposition', 'attachment; filename="university-in-a-box-account.json"');
        response.json({
          exportedAt: config.now().toISOString(),
          account: user,
          onboardingComplete: profile.onboarding_completed_at !== null,
          termsConsent: terms
            ? {
                version: terms.terms_version,
                url: terms.terms_url,
                acceptedAt: terms.accepted_at,
              }
            : null,
          subscription: billing.subscriptionSnapshot({ trialEndsAt: profile.trial_ends_at }, user.id),
          learning: getLearningEnvelope(database.db, user.id),
          supportTickets: tickets.map((ticket) => ({
            id: ticket.id,
            category: ticket.category,
            message: ticket.message,
            createdAt: ticket.created_at,
            status: ticket.status,
          })),
        });
      } catch (error) {
        next(error);
      }
    });

    app.post(
      '/api/checkout',
      sessionRequired(auth),
      persistentRateLimit(config, database.db, 'checkout', 10, 60 * 60 * 1_000),
      asyncRoute(async (_request, response) => {
        const user = authenticatedUser(response);
        if (!user.emailVerified && config.environment === 'production') {
          throw new ProductError('EMAIL_VERIFICATION_REQUIRED', 403, 'Сначала подтвердите адрес электронной почты.');
        }
        response.json(await billing.checkout(user));
      }),
    );

    app.post(
      '/api/billing/portal',
      sessionRequired(auth),
      persistentRateLimit(config, database.db, 'billing-portal', 10, 60 * 60 * 1_000),
      asyncRoute(async (_request, response) => {
        response.json(await billing.portal(authenticatedUser(response).id));
      }),
    );

    app.post(
      '/api/support',
      sessionRequired(auth),
      persistentRateLimit(config, database.db, 'support', 5, 60 * 60 * 1_000),
      (request, response, next) => {
        try {
          const user = authenticatedUser(response);
          const ticket = parseSupportTicket(request.body);
          const createdAt = config.now().toISOString();
          const id = randomUUID();
          database.db
            .prepare(
              `INSERT INTO support_tickets (id, user_id, category, message, status, created_at)
               VALUES (?, ?, ?, ?, 'open', ?)`,
            )
            .run(id, user.id, ticket.category, ticket.message, createdAt);
          response.status(201).json({ id, createdAt });
        } catch (error) {
          next(error);
        }
      },
    );

    app.get('/api/support', sessionRequired(auth), (request, response, next) => {
      try {
        void request;
        const rows = database.db
          .prepare(
            `SELECT id, category, message, created_at, status
             FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
          )
          .all(authenticatedUser(response).id) as SupportTicketRow[];
        const tickets: SupportTicket[] = rows.map((ticket) => ({
          id: ticket.id,
          category: ticket.category,
          message: ticket.message,
          createdAt: ticket.created_at,
          status: ticket.status,
        }));
        response.json({ tickets });
      } catch (error) {
        next(error);
      }
    });

    app.use('/api', (_request, _response, next) => {
      next(new ProductError('NOT_FOUND', 404, 'Маршрут API не найден.'));
    });
    app.use(APIErrorHandler);

    return {
      app,
      auth,
      db: database.db,
      config,
      mail,
      billing,
      close: database.close,
    };
  } catch (error) {
    database.close();
    throw error;
  }
}

export { FREE_CARD_IDS, FREE_LESSON_IDS, canPersistFreeState, getLearningEnvelope };
