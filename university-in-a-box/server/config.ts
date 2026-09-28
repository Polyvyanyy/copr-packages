import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import type { MailDelivery } from './mail';

export type RuntimeEnvironment = 'development' | 'production' | 'test';
export type SqliteDatabase = BetterSqlite3.Database;

export interface OperatorSettings {
  name?: string;
  email?: string;
  address?: string;
}

export interface TermsSettings {
  version?: string;
  url?: string;
}

export interface MailSettings {
  apiKey?: string;
  from?: string;
  fetch?: typeof fetch;
}

export interface StripePrice {
  id: string;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  recurring: { interval: string; intervalCount: number } | null;
  liveMode: boolean;
}

export interface StripeSubscription {
  id: string;
  customerId: string | null;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, string>;
  priceIds: string[];
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  created: number;
  subscriptionId: string | null;
}

export interface StripeGateway {
  retrievePrice(priceId: string): Promise<StripePrice>;
  createCustomer(
    input: { email: string; userId: string },
    idempotencyKey: string,
  ): Promise<{ id: string }>;
  createCheckout(
    input: {
      customerId: string;
      userId: string;
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    },
    idempotencyKey: string,
  ): Promise<{ id: string; url: string; expiresAt: number | null }>;
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  retrieveSubscription(subscriptionId: string): Promise<StripeSubscription>;
  listSubscriptions(customerId: string): Promise<StripeSubscription[]>;
  constructWebhook(rawBody: Buffer, signature: string): StripeWebhookEvent;
}

export interface BillingSettings {
  secretKey?: string;
  webhookSecret?: string;
  priceId?: string;
  gateway?: StripeGateway;
}

export interface ApplicationConfig {
  environment?: RuntimeEnvironment;
  appUrl?: string;
  authSecret?: string;
  database?: SqliteDatabase;
  databasePath?: string;
  dataDirectory?: string;
  trustProxyHops?: number;
  operator?: OperatorSettings;
  terms?: TermsSettings;
  mail?: MailSettings;
  mailDelivery?: MailDelivery;
  billing?: BillingSettings;
  now?: () => Date;
}

export interface ResolvedApplicationConfig {
  environment: RuntimeEnvironment;
  appUrl: string;
  origin: string;
  authSecret: string;
  database?: SqliteDatabase;
  databasePath: string;
  dataDirectory: string;
  trustProxyHops: number;
  operator: { name: string | null; email: string | null; address: string | null };
  terms: { version: string; url: string };
  mail: MailSettings;
  mailDelivery?: MailDelivery;
  billing: {
    enabled: boolean;
    mode: 'disabled' | 'test' | 'live';
    secretKey?: string;
    webhookSecret?: string;
    priceId?: string;
    gateway?: StripeGateway;
  };
  now: () => Date;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

const DEVELOPMENT_SECRET_FILE = 'better-auth-secret';
const MIN_SECRET_LENGTH = 32;

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requireSetting(value: string | undefined, label: string): string {
  const result = nonEmpty(value);
  if (!result) throw new ConfigurationError(`${label} must be configured in production.`);
  return result;
}

function asEnvironment(value: string | undefined): RuntimeEnvironment {
  if (!value || value === 'development') return 'development';
  if (value === 'production' || value === 'test') return value;
  throw new ConfigurationError('NODE_ENV must be development, test, or production.');
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function looksHighEntropySecret(value: string): boolean {
  return (
    value.length >= MIN_SECRET_LENGTH &&
    !/\s/u.test(value) &&
    new Set(value).size >= 12 &&
    value !== 'better-auth-secret-123456789'
  );
}

function ensurePrivateDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}

function readOrCreateDevelopmentSecret(dataDirectory: string): string {
  ensurePrivateDirectory(dataDirectory);
  const path = resolve(dataDirectory, DEVELOPMENT_SECRET_FILE);
  if (existsSync(path)) {
    const saved = readFileSync(path, 'utf8').trim();
    if (looksHighEntropySecret(saved)) {
      chmodSync(path, 0o600);
      return saved;
    }
  }

  const secret = randomBytes(48).toString('base64url');
  writeFileSync(path, `${secret}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  chmodSync(path, 0o600);
  return secret;
}

function normaliseAppUrl(value: string, environment: RuntimeEnvironment): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigurationError('APP_URL must be an absolute URL.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ConfigurationError('APP_URL must not contain credentials, a query, or a fragment.');
  }
  if (environment === 'production' && parsed.protocol !== 'https:') {
    throw new ConfigurationError('APP_URL must use HTTPS in production.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ConfigurationError('APP_URL must use HTTP or HTTPS.');
  }
  return parsed.href.replace(/\/$/u, '');
}

function normaliseProxyHops(value: number | undefined): number {
  const hops = value ?? 0;
  if (!Number.isInteger(hops) || hops < 0 || hops > 2) {
    throw new ConfigurationError('TRUST_PROXY_HOPS must be an integer from 0 to 2.');
  }
  return hops;
}

function isInMemoryDatabasePath(value: string): boolean {
  const normalised = value.trim().toLowerCase();
  return (
    normalised === ':memory:' ||
    normalised.startsWith('file::memory:') ||
    /(?:[?&]mode=memory)(?:&|$)/u.test(normalised)
  );
}

function normaliseTermsUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError('TERMS_URL must be an HTTPS URL in production.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new ConfigurationError('TERMS_URL must be an HTTPS URL in production.');
  }
  return url.href;
}

function normaliseBilling(
  environment: RuntimeEnvironment,
  settings: BillingSettings | undefined,
): ResolvedApplicationConfig['billing'] {
  const secretKey = nonEmpty(settings?.secretKey);
  const webhookSecret = nonEmpty(settings?.webhookSecret);
  const priceId = nonEmpty(settings?.priceId);
  const supplied = [secretKey, webhookSecret, priceId].filter(Boolean).length;

  if (supplied === 0) return { enabled: false, mode: 'disabled' };
  if (supplied !== 3) {
    throw new ConfigurationError('Stripe billing requires secret key, webhook secret, and price ID together.');
  }
  if (!/^sk_(?:test|live)_[A-Za-z0-9_]+$/u.test(secretKey!)) {
    throw new ConfigurationError('Stripe secret key is invalid.');
  }
  if (!/^whsec_[A-Za-z0-9_]+$/u.test(webhookSecret!)) {
    throw new ConfigurationError('Stripe webhook secret is invalid.');
  }
  if (!/^price_[A-Za-z0-9_]+$/u.test(priceId!)) {
    throw new ConfigurationError('Stripe price ID is invalid.');
  }

  const mode = secretKey!.startsWith('sk_live_') ? 'live' : 'test';
  if (environment === 'production' && mode !== 'live') {
    throw new ConfigurationError('Production billing requires a live Stripe secret key.');
  }
  return {
    enabled: true,
    mode,
    secretKey,
    webhookSecret,
    priceId,
    gateway: settings?.gateway,
  };
}

export function resolveApplicationConfig(input: ApplicationConfig = {}): ResolvedApplicationConfig {
  const environment = input.environment ?? 'development';
  if (!['development', 'production', 'test'].includes(environment)) {
    throw new ConfigurationError('Environment must be development, test, or production.');
  }

  const dataDirectory = resolve(input.dataDirectory ?? resolve(process.cwd(), 'server', 'data'));
  const defaultAppUrl = environment === 'test' ? 'http://app.test' : 'http://localhost:3000';
  const appUrl = normaliseAppUrl(
    environment === 'production'
      ? requireSetting(input.appUrl, 'APP_URL')
      : input.appUrl ?? defaultAppUrl,
    environment,
  );
  const origin = new URL(appUrl).origin;
  const authSecret =
    input.authSecret ??
    (environment === 'test'
      ? 'test-only-better-auth-secret-not-for-production-123456'
      : readOrCreateDevelopmentSecret(dataDirectory));
  if (environment === 'production' && !looksHighEntropySecret(authSecret)) {
    throw new ConfigurationError('BETTER_AUTH_SECRET must be a high-entropy secret of at least 32 characters.');
  }

  const databasePath = input.databasePath ??
    (environment === 'test' ? ':memory:' : resolve(dataDirectory, 'university-in-a-box.sqlite'));
  if (
    environment === 'production' &&
    (!input.databasePath || isInMemoryDatabasePath(databasePath) || input.database?.memory === true)
  ) {
    throw new ConfigurationError('DATABASE_PATH must point to persistent SQLite storage in production.');
  }

  const operator = {
    name: nonEmpty(input.operator?.name) ?? null,
    email: nonEmpty(input.operator?.email) ?? null,
    address: nonEmpty(input.operator?.address) ?? null,
  };
  const configuredTermsVersion = nonEmpty(input.terms?.version);
  const configuredTermsUrl = nonEmpty(input.terms?.url);
  const terms = {
    version:
      environment === 'production'
        ? requireSetting(configuredTermsVersion, 'TERMS_VERSION')
        : configuredTermsVersion ?? 'development',
    url:
      environment === 'production'
        ? normaliseTermsUrl(requireSetting(configuredTermsUrl, 'TERMS_URL'))
        : configuredTermsUrl ?? `${appUrl}/terms`,
  };
  if (environment === 'production') {
    if (!operator.name || !operator.email || !operator.address || !isValidEmail(operator.email)) {
      throw new ConfigurationError('Operator name, email, and address must be configured in production.');
    }
  }

  const mail: MailSettings = {
    apiKey: nonEmpty(input.mail?.apiKey),
    from: nonEmpty(input.mail?.from),
    fetch: input.mail?.fetch,
  };
  if (environment === 'production') {
    if (!mail.apiKey || !mail.from) {
      throw new ConfigurationError('RESEND_API_KEY and RESEND_FROM must be configured in production.');
    }
    const sender = mail.from.match(/<([^>]+)>$/u)?.[1] ?? mail.from;
    if (!isValidEmail(sender)) throw new ConfigurationError('RESEND_FROM must contain a valid email address.');
  }

  return {
    environment,
    appUrl,
    origin,
    authSecret,
    database: input.database,
    databasePath,
    dataDirectory,
    trustProxyHops: normaliseProxyHops(input.trustProxyHops),
    operator,
    terms,
    mail,
    mailDelivery: input.mailDelivery,
    billing: normaliseBilling(environment, input.billing),
    now: input.now ?? (() => new Date()),
  };
}

function integerEnvironment(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new ConfigurationError('TRUST_PROXY_HOPS must be an integer.');
  return parsed;
}

export function loadApplicationConfig(environment: NodeJS.ProcessEnv = process.env): ApplicationConfig {
  return {
    environment: asEnvironment(environment.NODE_ENV),
    appUrl: environment.APP_URL,
    authSecret: environment.BETTER_AUTH_SECRET ?? environment.AUTH_SECRET,
    databasePath: environment.DATABASE_PATH ?? environment.DATABASE_URL,
    dataDirectory: environment.APP_DATA_DIR,
    trustProxyHops: integerEnvironment(environment.TRUST_PROXY_HOPS),
    operator: {
      name: environment.OPERATOR_NAME,
      email: environment.OPERATOR_EMAIL,
      address: environment.OPERATOR_ADDRESS,
    },
    terms: { version: environment.TERMS_VERSION, url: environment.TERMS_URL },
    mail: { apiKey: environment.RESEND_API_KEY, from: environment.RESEND_FROM },
    billing: {
      secretKey: environment.STRIPE_SECRET_KEY,
      webhookSecret: environment.STRIPE_WEBHOOK_SECRET,
      priceId: environment.STRIPE_PRICE_ID,
    },
  };
}
