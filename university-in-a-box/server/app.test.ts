import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createApplication, type CreatedApplication } from './app';
import type {
  ApplicationConfig,
  StripeGateway,
  StripePrice,
  StripeSubscription,
  StripeWebhookEvent,
} from './config';
import { ConfigurationError, resolveApplicationConfig } from './config';
import { MemoryMailDelivery } from './mail';
import { lessons } from '../src/domain/curriculum';
import { createInitialState } from '../src/domain/progress';
import type { LearningState } from '../src/domain/types';

const ORIGIN = 'http://app.test';
const PASSWORD = 'correct-horse-battery-staple';
const UPDATED_PASSWORD = 'updated-horse-battery-staple';
const AUTH_SECRET = 'test-only-better-auth-secret-with-sufficient-entropy-123456789';

interface TestClock {
  now: Date;
}

interface TestApplication {
  application: CreatedApplication;
  baseUrl: string;
  clock: TestClock;
  mail: MemoryMailDelivery;
  server: Server;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  origin?: string | null;
}

interface JsonResponse {
  response: Response;
  body: unknown;
  cookies: string[];
}

class BrowserClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  async json(path: string, options: RequestOptions = {}): Promise<JsonResponse> {
    const method = options.method ?? 'GET';
    const headers = new Headers(options.headers);
    const isJsonBody =
      options.body !== undefined &&
      typeof options.body === 'object' &&
      !Buffer.isBuffer(options.body) &&
      !(options.body instanceof Uint8Array);
    if (isJsonBody && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (options.origin !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      headers.set('origin', options.origin ?? ORIGIN);
    }
    if (this.cookies.size > 0) {
      headers.set(
        'cookie',
        [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
      );
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body:
        options.body === undefined
          ? undefined
          : isJsonBody
            ? JSON.stringify(options.body)
            : (options.body as BodyInit),
      redirect: 'manual',
    });
    const cookies = this.storeCookies(response.headers);
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { response, body, cookies };
  }

  private storeCookies(headers: Headers): string[] {
    const headersWithCookies = headers as Headers & { getSetCookie?: () => string[] };
    const values = headersWithCookies.getSetCookie?.() ?? [];
    for (const value of values) {
      const [pair, ...attributes] = value.split(';');
      const separator = pair.indexOf('=');
      if (separator < 1) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1);
      const removed = attributes.some((attribute) => /^\s*max-age=0\s*$/iu.test(attribute));
      if (removed) this.cookies.delete(name);
      else this.cookies.set(name, cookieValue);
    }
    return values;
  }
}

class FakeStripeGateway implements StripeGateway {
  readonly price: StripePrice = {
    id: 'price_japanese_monthly',
    active: true,
    currency: 'usd',
    unitAmount: 2_000,
    recurring: { interval: 'month', intervalCount: 1 },
    liveMode: false,
  };
  readonly customers: { input: { email: string; userId: string }; idempotencyKey: string }[] = [];
  readonly checkouts: {
    input: {
      customerId: string;
      userId: string;
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    };
    idempotencyKey: string;
  }[] = [];
  readonly portals: { customerId: string; returnUrl: string }[] = [];
  readonly subscriptions = new Map<string, StripeSubscription>();
  retrieveSubscriptionCalls = 0;

  async retrievePrice(priceId: string): Promise<StripePrice> {
    if (priceId !== this.price.id) throw new Error('unknown price');
    return this.price;
  }

  async createCustomer(
    input: { email: string; userId: string },
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    this.customers.push({ input, idempotencyKey });
    return { id: `cus_${input.userId}` };
  }

  async createCheckout(
    input: {
      customerId: string;
      userId: string;
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    },
    idempotencyKey: string,
  ): Promise<{ id: string; url: string; expiresAt: number | null }> {
    this.checkouts.push({ input, idempotencyKey });
    return {
      id: `cs_${input.userId}`,
      url: `https://checkout.stripe.com/c/pay/${input.userId}`,
      expiresAt: Math.floor(Date.now() / 1_000) + 1_800,
    };
  }

  async createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    this.portals.push(input);
    return { url: `https://billing.stripe.com/p/session/${input.customerId}` };
  }

  async retrieveSubscription(subscriptionId: string): Promise<StripeSubscription> {
    this.retrieveSubscriptionCalls += 1;
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error('unknown subscription');
    return subscription;
  }

  async listSubscriptions(customerId: string): Promise<StripeSubscription[]> {
    return [...this.subscriptions.values()].filter(
      (subscription) => subscription.customerId === customerId,
    );
  }

  constructWebhook(rawBody: Buffer, signature: string): StripeWebhookEvent {
    const expected = `v1=${createHmac('sha256', 'stripe-webhook-test-secret')
      .update(rawBody)
      .digest('hex')}`;
    if (signature !== expected) throw new Error('invalid signature');
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      id: string;
      type: string;
      created: number;
      data: { object: { id?: string; subscription?: string } };
    };
    return {
      id: payload.id,
      type: payload.type,
      created: payload.created,
      subscriptionId: payload.type.startsWith('customer.subscription.')
        ? (payload.data.object.id ?? null)
        : (payload.data.object.subscription ?? null),
    };
  }

  signature(rawBody: Buffer): string {
    return `v1=${createHmac('sha256', 'stripe-webhook-test-secret')
      .update(rawBody)
      .digest('hex')}`;
  }
}

const applications: TestApplication[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    applications.splice(0).map(
      ({ application, server }) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            application.close();
            resolve();
          });
        }),
    ),
  );
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function startApplication(overrides: Partial<ApplicationConfig> = {}): Promise<TestApplication> {
  const clock: TestClock = { now: new Date('2026-09-06T12:00:00.000Z') };
  const mail = new MemoryMailDelivery();
  const database = new Database(':memory:');
  const application = await createApplication({
    environment: 'test',
    appUrl: ORIGIN,
    authSecret: AUTH_SECRET,
    database,
    mailDelivery: mail,
    now: () => clock.now,
    ...overrides,
  });
  const server = createServer(application.app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const result = { application, baseUrl: `http://127.0.0.1:${address.port}`, clock, mail, server };
  applications.push(result);
  return result;
}

async function signUp(
  client: BrowserClient,
  email: string,
  name = 'Mika',
): Promise<{ id: string; email: string }> {
  const result = await client.json('/api/auth/sign-up/email', {
    method: 'POST',
    body: {
      name,
      email,
      password: PASSWORD,
      termsAccepted: true,
      callbackURL: `${ORIGIN}/auth/sign-in?verified=done`,
    },
  });
  expect(result.response.status).toBe(200);
  expect(result.body).toMatchObject({ user: { email } });
  const body = result.body as { user: { id: string; email: string } };
  return body.user;
}

async function signIn(client: BrowserClient, email: string, password = PASSWORD): Promise<JsonResponse> {
  return client.json('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email, password },
  });
}

function extractToken(message: { text: string }): string {
  const url = new URL(message.text.match(/https?:\/\/\S+/u)?.[0] ?? '');
  const token = url.searchParams.get('token') ?? url.pathname.match(/\/reset-password\/([^/?]+)/u)?.[1];
  if (!token) throw new Error('email did not contain a token');
  return token;
}

function forgedLearningState(): LearningState {
  const lesson = lessons.find((candidate) => candidate.id === 'hiragana-vowels');
  if (!lesson) throw new Error('expected first lesson');
  return {
    ...createInitialState(),
    attempts: [
      {
        id: 'forged-attempt',
        lessonId: lesson.id,
        completedAt: '2020-09-06T11:00:00.000Z',
        answers: lesson.exercises.map((exercise) => ({
          exerciseId: exercise.id,
          choiceId: exercise.options.find((option) => option.id !== exercise.answerId)?.id ?? exercise.answerId,
          assisted: false,
        })),
        correct: 999,
        total: 1,
        assisted: false,
      },
    ],
  };
}

function applicationError(body: unknown): { code: string; message: string } {
  const error = (body as { error?: unknown }).error as { code?: unknown; message?: unknown } | undefined;
  if (!error || typeof error.code !== 'string' || typeof error.message !== 'string') {
    throw new Error('response did not include a product error');
  }
  return { code: error.code, message: error.message };
}

describe('application authentication and account data', () => {
  it('requires terms consent, persists a seven-day trial, and uses real HttpOnly sessions', async () => {
    const test = await startApplication();
    const client = new BrowserClient(test.baseUrl);

    const missingTerms = await client.json('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: 'Mika', email: 'mika@example.com', password: PASSWORD },
    });
    expect(missingTerms.response.status).toBe(400);
    expect(applicationError(missingTerms.body).code).toBe('TERMS_REQUIRED');

    const user = await signUp(client, 'mika@example.com');
    expect(test.mail.messages).toHaveLength(1);
    expect(test.application.db.prepare('SELECT user_id FROM terms_consents').get()).toEqual({ user_id: user.id });
    expect(test.application.db.prepare('SELECT trial_ends_at FROM account_profiles').get()).toEqual({
      trial_ends_at: '2026-09-13T12:00:00.000Z',
    });

    const wrongPassword = await signIn(client, user.email, 'wrong-password');
    expect(wrongPassword.response.status).toBe(401);
    expect(applicationError(wrongPassword.body).code).toBe('INVALID_EMAIL_OR_PASSWORD');

    const signedIn = await signIn(client, user.email);
    expect(signedIn.response.status).toBe(200);
    expect(signedIn.cookies.join('\n')).toMatch(/httponly/iu);

    const account = await client.json('/api/account');
    expect(account.response.status).toBe(200);
    expect(account.response.headers.get('cache-control')).toContain('no-store');
    expect(account.body).toMatchObject({
      user: { id: user.id, email: user.email, emailVerified: false },
      subscription: { status: 'trialing', access: 'full', trialEndsAt: '2026-09-13T12:00:00.000Z' },
      onboardingComplete: false,
    });

    const signedOut = await client.json('/api/auth/sign-out', { method: 'POST', body: {} });
    expect(signedOut.response.status).toBe(200);
    const afterSignOut = await client.json('/api/account');
    expect(afterSignOut.response.status).toBe(401);
    expect(applicationError(afterSignOut.body).code).toBe('UNAUTHENTICATED');
  });

  it('revokes existing sessions after a Better Auth password reset', async () => {
    const test = await startApplication();
    const registration = new BrowserClient(test.baseUrl);
    const user = await signUp(registration, 'reset@example.com');
    const firstSession = new BrowserClient(test.baseUrl);
    const secondSession = new BrowserClient(test.baseUrl);
    expect((await signIn(firstSession, user.email)).response.status).toBe(200);
    expect((await signIn(secondSession, user.email)).response.status).toBe(200);

    const resetRequested = await registration.json('/api/auth/request-password-reset', {
      method: 'POST',
      body: { email: user.email, redirectTo: `${ORIGIN}/auth/reset-password` },
    });
    expect(resetRequested.response.status).toBe(200);
    const resetMessage = test.mail.messages.find((message) => message.subject.startsWith('Сброс пароля'));
    expect(resetMessage).toBeDefined();
    const token = extractToken(resetMessage!);

    const reset = await registration.json('/api/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword: UPDATED_PASSWORD },
    });
    expect(reset.response.status).toBe(200);
    expect((await firstSession.json('/api/account')).response.status).toBe(401);
    expect((await secondSession.json('/api/account')).response.status).toBe(401);
    expect((await signIn(new BrowserClient(test.baseUrl), user.email)).response.status).toBe(401);
    expect((await signIn(new BrowserClient(test.baseUrl), user.email, UPDATED_PASSWORD)).response.status).toBe(200);
  });

  it('exports only the authenticated account and deletes its personal application rows', async () => {
    const test = await startApplication();
    const client = new BrowserClient(test.baseUrl);
    const user = await signUp(client, 'delete@example.com');
    expect((await signIn(client, user.email)).response.status).toBe(200);

    const learning = await client.json('/api/learning');
    const saved = await client.json('/api/learning', {
      method: 'PUT',
      body: { state: { ...createInitialState(), writingDraft: '私 は ミカ です。' }, revision: 0 },
    });
    expect(learning.body).toMatchObject({ revision: 0 });
    expect(saved.response.status).toBe(200);
    const ticket = await client.json('/api/support', {
      method: 'POST',
      body: { category: 'content', message: 'Пожалуйста, уточните пример.' },
    });
    expect(ticket.response.status).toBe(201);

    const exported = await client.json('/api/account/export');
    expect(exported.response.status).toBe(200);
    expect(exported.response.headers.get('content-disposition')).toContain('attachment');
    expect(exported.body).toMatchObject({
      account: { id: user.id, email: user.email },
      learning: { revision: 1, state: { writingDraft: '私 は ミカ です。' } },
      supportTickets: [{ category: 'content', status: 'open' }],
      termsConsent: { version: 'development' },
    });
    expect(JSON.stringify(exported.body)).not.toMatch(/password|session|credential|token/iu);

    const deleted = await client.json('/api/auth/delete-user', {
      method: 'POST',
      body: { password: PASSWORD },
    });
    expect(deleted.response.status).toBe(200);
    expect(test.application.db.prepare('SELECT * FROM "user" WHERE id = ?').get(user.id)).toBeUndefined();
    expect(test.application.db.prepare('SELECT * FROM learning_states WHERE user_id = ?').get(user.id)).toBeUndefined();
    expect(test.application.db.prepare('SELECT * FROM support_tickets WHERE user_id = ?').get(user.id)).toBeUndefined();
    expect(test.application.db.prepare('SELECT * FROM terms_consents WHERE user_id = ?').get(user.id)).toBeUndefined();
    expect((await client.json('/api/account')).response.status).toBe(401);
  });
});

describe('application learning API', () => {
  it('isolates accounts, canonicalizes forged scores, and reports optimistic-write conflicts', async () => {
    const test = await startApplication();
    const accountA = new BrowserClient(test.baseUrl);
    const accountB = new BrowserClient(test.baseUrl);
    const userA = await signUp(accountA, 'a@example.com', 'A');
    const userB = await signUp(accountB, 'b@example.com', 'B');
    expect((await signIn(accountA, userA.email)).response.status).toBe(200);
    expect((await signIn(accountB, userB.email)).response.status).toBe(200);

    const initial = await accountA.json('/api/learning');
    expect(initial.body).toMatchObject({ revision: 0, updatedAt: null });
    const updated = await accountA.json('/api/learning', {
      method: 'PUT',
      body: { state: forgedLearningState(), revision: 0 },
    });
    expect(updated.response.status).toBe(200);
    expect(updated.body).toMatchObject({
      revision: 1,
      state: { attempts: [{ correct: 0, total: lessons.find((lesson) => lesson.id === 'hiragana-vowels')?.exercises.length }] },
    });

    const accountBState = await accountB.json('/api/learning');
    expect(accountBState.body).toMatchObject({ revision: 0, state: { attempts: [] } });
    const stale = await accountA.json('/api/learning', {
      method: 'PUT',
      body: { state: createInitialState(), revision: 0 },
    });
    expect(stale.response.status).toBe(409);
    expect(stale.body).toMatchObject({
      error: { code: 'REVISION_CONFLICT' },
      current: { revision: 1 },
    });
  });

  it('keeps basic cloud progress available after trial expiry but gates premium lesson state', async () => {
    const test = await startApplication();
    const client = new BrowserClient(test.baseUrl);
    const user = await signUp(client, 'trial@example.com');
    expect((await signIn(client, user.email)).response.status).toBe(200);
    test.clock.now = new Date('2026-09-13T12:00:00.000Z');

    const basicState = { ...createInitialState(), goal: { minutesPerDay: 20, daysPerWeek: 4, purpose: 'reading' as const } };
    const basicWrite = await client.json('/api/learning', {
      method: 'PUT',
      body: { state: basicState, revision: 0 },
    });
    expect(basicWrite.response.status).toBe(200);
    expect((await client.json('/api/account')).body).toMatchObject({ subscription: { access: 'free' } });

    const premiumLesson = lessons.find((lesson) => lesson.id === 'topic-wa');
    if (!premiumLesson) throw new Error('expected a paid lesson');
    const paidOnlyState: LearningState = {
      ...basicState,
      attempts: [
        {
          id: 'paid-attempt',
          lessonId: premiumLesson.id,
          completedAt: '2020-09-06T11:00:00.000Z',
          answers: premiumLesson.exercises.map((exercise) => ({
            exerciseId: exercise.id,
            choiceId: exercise.answerId,
            assisted: false,
          })),
          correct: premiumLesson.exercises.length,
          total: premiumLesson.exercises.length,
          assisted: false,
        },
      ],
    };
    const restricted = await client.json('/api/learning', {
      method: 'PUT',
      body: { state: paidOnlyState, revision: 1 },
    });
    expect(restricted.response.status).toBe(403);
    expect(applicationError(restricted.body).code).toBe('SUBSCRIPTION_REQUIRED');
  });
});

describe('application request protections', () => {
  it('requires the configured origin for state-changing routes and bounds auth payloads', async () => {
    const test = await startApplication();
    const client = new BrowserClient(test.baseUrl);
    const wrongOrigin = await client.json('/api/auth/sign-up/email', {
      method: 'POST',
      origin: 'https://attacker.example',
      body: { name: 'Mika', email: 'attacker@example.com', password: PASSWORD, termsAccepted: true },
    });
    expect(wrongOrigin.response.status).toBe(403);
    expect(applicationError(wrongOrigin.body).code).toBe('INVALID_ORIGIN');

    const tooLarge = await client.json('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'mika@example.com', password: 'x'.repeat(40_000) },
    });
    expect(tooLarge.response.status).toBe(413);
    expect(applicationError(tooLarge.body).code).toBe('BODY_TOO_LARGE');
  });
});

describe('Stripe billing service', () => {
  it('uses a verified fixed price, verifies raw webhooks, and ignores replayed, stale, and mismatched events', async () => {
    const gateway = new FakeStripeGateway();
    const test = await startApplication({
      billing: {
        secretKey: 'sk_test_backendbillingsecret123456789',
        webhookSecret: 'whsec_backendbillingsecret123456789',
        priceId: gateway.price.id,
        gateway,
      },
    });
    const client = new BrowserClient(test.baseUrl);
    const user = await signUp(client, 'billing@example.com');
    expect((await signIn(client, user.email)).response.status).toBe(200);

    const firstCheckout = await client.json('/api/checkout', {
      method: 'POST',
      body: { amount: 1, currency: 'eur' },
    });
    const secondCheckout = await client.json('/api/checkout', { method: 'POST', body: {} });
    expect(firstCheckout.body).toEqual(secondCheckout.body);
    expect(gateway.customers).toHaveLength(1);
    expect(gateway.checkouts).toHaveLength(1);
    expect(gateway.checkouts[0]?.input).toMatchObject({
      userId: user.id,
      priceId: gateway.price.id,
      customerId: `cus_${user.id}`,
    });
    expect(gateway.checkouts[0]?.input).not.toHaveProperty('amount');
    expect(
      test.application.db.prepare('SELECT * FROM billing_subscriptions WHERE user_id = ?').all(user.id),
    ).toEqual([]);

    const portal = await client.json('/api/billing/portal', { method: 'POST', body: {} });
    expect(portal.response.status).toBe(200);
    expect(gateway.portals).toEqual([{ customerId: `cus_${user.id}`, returnUrl: `${ORIGIN}/plan` }]);

    gateway.subscriptions.set('sub_good', {
      id: 'sub_good',
      customerId: `cus_${user.id}`,
      status: 'active',
      currentPeriodEnd: 1_790_000_000,
      cancelAtPeriodEnd: false,
      metadata: { university_user_id: user.id, university_price_id: gateway.price.id },
      priceIds: [gateway.price.id],
    });
    const event = Buffer.from(
      JSON.stringify({
        id: 'evt_good',
        type: 'customer.subscription.updated',
        created: 200,
        data: { object: { id: 'sub_good' } },
      }),
    );
    const invalidSignature = await client.json('/api/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'v1=forged' },
      body: event,
    });
    expect(invalidSignature.response.status).toBe(400);
    expect(applicationError(invalidSignature.body).code).toBe('INVALID_WEBHOOK_SIGNATURE');

    const accepted = await client.json('/api/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': gateway.signature(event) },
      body: event,
    });
    expect(accepted.response.status).toBe(200);
    expect(
      test.application.db
        .prepare('SELECT status, is_entitled, last_event_created FROM billing_subscriptions WHERE stripe_subscription_id = ?')
        .get('sub_good'),
    ).toEqual({ status: 'active', is_entitled: 1, last_event_created: 200 });

    const replay = await client.json('/api/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': gateway.signature(event) },
      body: event,
    });
    expect(replay.response.status).toBe(200);
    expect(gateway.retrieveSubscriptionCalls).toBe(1);

    gateway.subscriptions.set('sub_good', {
      ...gateway.subscriptions.get('sub_good')!,
      status: 'past_due',
    });
    const newest = Buffer.from(
      JSON.stringify({
        id: 'evt_newest',
        type: 'customer.subscription.updated',
        created: 300,
        data: { object: { id: 'sub_good' } },
      }),
    );
    await client.json('/api/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': gateway.signature(newest) },
      body: newest,
    });
    gateway.subscriptions.set('sub_good', {
      ...gateway.subscriptions.get('sub_good')!,
      status: 'active',
    });
    const stale = Buffer.from(
      JSON.stringify({
        id: 'evt_stale',
        type: 'customer.subscription.updated',
        created: 100,
        data: { object: { id: 'sub_good' } },
      }),
    );
    await client.json('/api/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': gateway.signature(stale) },
      body: stale,
    });
    expect(
      test.application.db
        .prepare('SELECT status, last_event_created FROM billing_subscriptions WHERE stripe_subscription_id = ?')
        .get('sub_good'),
    ).toEqual({ status: 'past_due', last_event_created: 300 });

    gateway.subscriptions.set('sub_wrong_customer', {
      id: 'sub_wrong_customer',
      customerId: 'cus_attacker',
      status: 'active',
      currentPeriodEnd: 1_790_000_000,
      cancelAtPeriodEnd: false,
      metadata: { university_user_id: user.id, university_price_id: gateway.price.id },
      priceIds: [gateway.price.id],
    });
    const mismatch = Buffer.from(
      JSON.stringify({
        id: 'evt_mismatch',
        type: 'customer.subscription.updated',
        created: 400,
        data: { object: { id: 'sub_wrong_customer' } },
      }),
    );
    await client.json('/api/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': gateway.signature(mismatch) },
      body: mismatch,
    });
    expect(
      test.application.db
        .prepare('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id = ?')
        .get('sub_wrong_customer'),
    ).toBeUndefined();
  });
});

describe('production configuration', () => {
  it('fails closed without production security settings and accepts a persistent complete configuration', () => {
    expect(() => resolveApplicationConfig({ environment: 'production' })).toThrow(ConfigurationError);
    expect(() =>
      resolveApplicationConfig({
        environment: 'production',
        appUrl: 'http://japanese.example.com',
        authSecret: AUTH_SECRET,
      }),
    ).toThrow('HTTPS');

    const directory = mkdtempSync(join(tmpdir(), 'japanese-production-config-'));
    directories.push(directory);
    const config = resolveApplicationConfig({
      environment: 'production',
      appUrl: 'https://japanese.example.com',
      authSecret: AUTH_SECRET,
      databasePath: join(directory, 'product.sqlite'),
      dataDirectory: directory,
      trustProxyHops: 1,
      operator: {
        name: 'Japanese School Ltd.',
        email: 'operator@japanese.example.com',
        address: '1 Language Street, Tokyo',
      },
      terms: { version: '2026-09-06', url: 'https://japanese.example.com/legal/terms' },
      mail: { apiKey: 're_test_real_mail_key', from: 'Japanese School <hello@japanese.example.com>' },
    });
    expect(config).toMatchObject({
      environment: 'production',
      origin: 'https://japanese.example.com',
      billing: { enabled: false, mode: 'disabled' },
      trustProxyHops: 1,
    });
  });
});
