import { createHmac, randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import type {
  ResolvedApplicationConfig,
  SqliteDatabase,
  StripeGateway,
  StripePrice,
  StripeSubscription,
  StripeWebhookEvent,
} from './config';
import { ConfigurationError } from './config';
import { ProductError } from './errors';
import type { SubscriptionSnapshot } from '../src/product-types';

const MONTHLY_AMOUNT = 2_000;
const CURRENCY = 'usd';
const CHECKOUT_LIFETIME_MS = 30 * 60 * 1_000;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const BLOCKING_DELETION_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid']);

interface AccountIdentity {
  id: string;
  email: string;
}

interface AccountProfile {
  trialEndsAt: string;
}

interface SubscriptionRow {
  stripe_subscription_id: string;
  status: string;
  is_entitled: number;
  current_period_end: string | null;
  cancel_at_period_end: number;
}

interface CustomerRow {
  stripe_customer_id: string;
}

interface CheckoutRow {
  id: string;
  idempotency_key: string;
  url: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function identifier(value: unknown): string | null {
  const direct = stringValue(value);
  if (direct) return direct;
  const object = asRecord(value);
  return object ? stringValue(object.id) : null;
}

function stringMetadata(value: unknown): Record<string, string> {
  const metadata = asRecord(value);
  if (!metadata) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(metadata)) {
    if (typeof item === 'string') result[key] = item;
  }
  return result;
}

function toSubscription(value: unknown): StripeSubscription {
  const subscription = asRecord(value);
  if (!subscription) throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');

  const items = asRecord(subscription.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const priceIds = data
    .map((item) => (asRecord(item) ? identifier(asRecord(item)?.price) : null))
    .filter((priceId): priceId is string => Boolean(priceId));

  return {
    id: stringValue(subscription.id) ?? '',
    customerId: identifier(subscription.customer),
    status: stringValue(subscription.status) ?? 'unknown',
    currentPeriodEnd: numberValue(subscription.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    metadata: stringMetadata(subscription.metadata),
    priceIds,
  };
}

function toPrice(value: unknown): StripePrice {
  const price = asRecord(value);
  if (!price) throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
  const recurring = asRecord(price.recurring);
  return {
    id: stringValue(price.id) ?? '',
    active: price.active === true,
    currency: stringValue(price.currency) ?? '',
    unitAmount: numberValue(price.unit_amount),
    recurring: recurring
      ? {
          interval: stringValue(recurring.interval) ?? '',
          intervalCount: numberValue(recurring.interval_count) ?? 1,
        }
      : null,
    liveMode: price.livemode === true,
  };
}

function toWebhookEvent(value: unknown): StripeWebhookEvent {
  const event = asRecord(value);
  const data = asRecord(event?.data);
  const object = asRecord(data?.object);
  const type = stringValue(event?.type);
  const directSubscriptionId = type?.startsWith('customer.subscription.')
    ? stringValue(object?.id)
    : identifier(object?.subscription);
  const created = numberValue(event?.created);
  const id = stringValue(event?.id);

  if (!id || !type || created === null) {
    throw new ProductError('INVALID_WEBHOOK_EVENT', 400, 'Неверный платежный запрос.');
  }
  return { id, type, created, subscriptionId: directSubscriptionId };
}

class StripeSdkGateway implements StripeGateway {
  private readonly stripe: Stripe;

  constructor(private readonly config: ResolvedApplicationConfig['billing']) {
    this.stripe = new Stripe(config.secretKey!, {
      maxNetworkRetries: 2,
      timeout: 8_000,
      telemetry: false,
    });
  }

  async retrievePrice(priceId: string): Promise<StripePrice> {
    return toPrice(await this.stripe.prices.retrieve(priceId));
  }

  async createCustomer(
    input: { email: string; userId: string },
    idempotencyKey: string,
  ): Promise<{ id: string }> {
    const customer = await this.stripe.customers.create(
      {
        email: input.email,
        metadata: { university_user_id: input.userId },
      },
      { idempotencyKey },
    );
    const id = stringValue(customer.id);
    if (!id) throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
    return { id };
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
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: input.customerId,
        client_reference_id: input.userId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        allow_promotion_codes: false,
        metadata: { university_user_id: input.userId },
        subscription_data: {
          metadata: { university_user_id: input.userId, university_price_id: input.priceId },
        },
      },
      { idempotencyKey },
    );
    const id = stringValue(session.id);
    const url = stringValue(session.url);
    if (!id || !url) throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
    return { id, url, expiresAt: numberValue(session.expires_at) };
  }

  async createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    const url = stringValue(session.url);
    if (!url) throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
    return { url };
  }

  async retrieveSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return toSubscription(await this.stripe.subscriptions.retrieve(subscriptionId));
  }

  async listSubscriptions(customerId: string): Promise<StripeSubscription[]> {
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    });
    return subscriptions.data.map((subscription) => toSubscription(subscription));
  }

  constructWebhook(rawBody: Buffer, signature: string): StripeWebhookEvent {
    return toWebhookEvent(this.stripe.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret!));
  }
}

function secondsToIso(value: number | null): string | null {
  if (value === null || value < 0) return null;
  const date = new Date(value * 1_000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function stableKey(secret: string, scope: string, value: string): string {
  return `${scope}-${createHmac('sha256', secret).update(value).digest('base64url').slice(0, 48)}`;
}

function validStripeUrl(value: string, host: 'checkout.stripe.com' | 'billing.stripe.com'): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host;
  } catch {
    return false;
  }
}

function isConfiguredPrice(price: StripePrice, expectedPriceId: string, mode: 'test' | 'live'): boolean {
  return (
    price.id === expectedPriceId &&
    price.active &&
    price.currency === CURRENCY &&
    price.unitAmount === MONTHLY_AMOUNT &&
    price.recurring?.interval === 'month' &&
    price.recurring.intervalCount === 1 &&
    price.liveMode === (mode === 'live')
  );
}

function isEntitledSubscription(subscription: StripeSubscription, priceId: string): boolean {
  return (
    ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) &&
    subscription.priceIds.length === 1 &&
    subscription.priceIds[0] === priceId
  );
}

export class BillingService {
  private constructor(
    private readonly config: ResolvedApplicationConfig,
    private readonly db: SqliteDatabase,
    private readonly gateway: StripeGateway | null,
  ) {}

  static async create(config: ResolvedApplicationConfig, db: SqliteDatabase): Promise<BillingService> {
    if (!config.billing.enabled) return new BillingService(config, db, null);

    const gateway = config.billing.gateway ?? new StripeSdkGateway(config.billing);
    const service = new BillingService(config, db, gateway);
    try {
      await service.verifyConfiguredPrice();
    } catch (error) {
      if (error instanceof ProductError) {
        throw new ConfigurationError('Configured Stripe price could not be verified.');
      }
      throw new ConfigurationError('Configured Stripe price could not be verified.');
    }
    return service;
  }

  get enabled(): boolean {
    return this.gateway !== null;
  }

  get mode(): 'disabled' | 'test' | 'live' {
    return this.config.billing.mode;
  }

  private requireGateway(): StripeGateway {
    if (!this.gateway || !this.config.billing.priceId) {
      throw new ProductError('BILLING_DISABLED', 503, 'Оплата сейчас недоступна.');
    }
    return this.gateway;
  }

  private async verifyConfiguredPrice(): Promise<void> {
    const gateway = this.requireGateway();
    const price = await gateway.retrievePrice(this.config.billing.priceId!);
    if (!isConfiguredPrice(price, this.config.billing.priceId!, this.config.billing.mode as 'test' | 'live')) {
      throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
    }
  }

  subscriptionSnapshot(profile: AccountProfile, userId: string): SubscriptionSnapshot {
    const current = this.db
      .prepare(
        `SELECT stripe_subscription_id, status, is_entitled, current_period_end, cancel_at_period_end
         FROM billing_subscriptions
         WHERE user_id = ?
         ORDER BY COALESCE(current_period_end, '') DESC, last_event_created DESC
         LIMIT 1`,
      )
      .get(userId) as SubscriptionRow | undefined;
    const now = this.config.now().getTime();
    const paidPeriodEnd = current?.current_period_end ? Date.parse(current.current_period_end) : Number.NaN;
    const paidAccess =
      current?.is_entitled === 1 &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(current.status) &&
      Number.isFinite(paidPeriodEnd) &&
      paidPeriodEnd > now;

    if (paidAccess) {
      return {
        status: current.status,
        access: 'full',
        trialEndsAt: profile.trialEndsAt,
        currentPeriodEnd: current.current_period_end,
        cancelAtPeriodEnd: current.cancel_at_period_end === 1,
      };
    }

    if (Date.parse(profile.trialEndsAt) > now) {
      return {
        status: 'trialing',
        access: 'full',
        trialEndsAt: profile.trialEndsAt,
        currentPeriodEnd: current?.current_period_end ?? null,
        cancelAtPeriodEnd: current?.cancel_at_period_end === 1,
      };
    }

    return {
      status: current?.status ?? 'free',
      access: 'free',
      trialEndsAt: profile.trialEndsAt,
      currentPeriodEnd: current?.current_period_end ?? null,
      cancelAtPeriodEnd: current?.cancel_at_period_end === 1,
    };
  }

  private async customerFor(user: AccountIdentity): Promise<string> {
    const existing = this.db
      .prepare('SELECT stripe_customer_id FROM billing_customers WHERE user_id = ?')
      .get(user.id) as CustomerRow | undefined;
    if (existing) return existing.stripe_customer_id;

    const gateway = this.requireGateway();
    let customer: { id: string };
    try {
      customer = await gateway.createCustomer(
        { email: user.email, userId: user.id },
        stableKey(this.config.authSecret, 'customer', user.id),
      );
    } catch {
      throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
    }

    const now = this.config.now().toISOString();
    try {
      this.db
        .prepare(
          'INSERT INTO billing_customers (user_id, stripe_customer_id, created_at) VALUES (?, ?, ?)',
        )
        .run(user.id, customer.id, now);
      return customer.id;
    } catch {
      const concurrent = this.db
        .prepare('SELECT stripe_customer_id FROM billing_customers WHERE user_id = ?')
        .get(user.id) as CustomerRow | undefined;
      if (concurrent) return concurrent.stripe_customer_id;
      throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
    }
  }

  async checkout(user: AccountIdentity): Promise<{ url: string }> {
    const gateway = this.requireGateway();
    const now = this.config.now();
    const nowIso = now.toISOString();
    const validUntil = now.getTime() + CHECKOUT_LIFETIME_MS;
    const existing = this.db
      .prepare(
        `SELECT id, idempotency_key, url
         FROM billing_checkout_sessions
         WHERE user_id = ? AND expires_at > ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(user.id, nowIso) as CheckoutRow | undefined;

    let checkout = existing;
    if (!checkout) {
      // A time bucket also serializes concurrent browser requests without creating duplicate Checkout sessions.
      const idempotencyKey = stableKey(
        this.config.authSecret,
        'checkout',
        `${user.id}:${Math.floor(now.getTime() / CHECKOUT_LIFETIME_MS)}`,
      );
      this.db
        .prepare(
          `INSERT OR IGNORE INTO billing_checkout_sessions
           (id, user_id, idempotency_key, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(randomUUID(), user.id, idempotencyKey, new Date(validUntil).toISOString(), nowIso);
      checkout = this.db
        .prepare(
          `SELECT id, idempotency_key, url
           FROM billing_checkout_sessions WHERE user_id = ? AND idempotency_key = ?`,
        )
        .get(user.id, idempotencyKey) as CheckoutRow | undefined;
      if (!checkout) {
        throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
      }
    }

    if (checkout.url) return { url: checkout.url };

    try {
      const customerId = await this.customerFor(user);
      const session = await gateway.createCheckout(
        {
          customerId,
          userId: user.id,
          priceId: this.config.billing.priceId!,
          successUrl: new URL('/?billing=success', this.config.appUrl).href,
          cancelUrl: new URL('/?billing=cancelled', this.config.appUrl).href,
        },
        checkout.idempotency_key,
      );
      if (!validStripeUrl(session.url, 'checkout.stripe.com')) {
        throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
      }
      const expiresAt = secondsToIso(session.expiresAt) ?? new Date(validUntil).toISOString();
      this.db
        .prepare(
          `UPDATE billing_checkout_sessions
           SET stripe_checkout_session_id = ?, url = ?, expires_at = ?
           WHERE id = ?`,
      )
      .run(session.id, session.url, expiresAt, checkout.id);
      return { url: session.url };
    } catch (error) {
      if (error instanceof ProductError) throw error;
      throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
    }
  }

  async portal(userId: string): Promise<{ url: string }> {
    const gateway = this.requireGateway();
    const customer = this.db
      .prepare('SELECT stripe_customer_id FROM billing_customers WHERE user_id = ?')
      .get(userId) as CustomerRow | undefined;
    if (!customer) {
      throw new ProductError('BILLING_PORTAL_UNAVAILABLE', 409, 'Сначала оформите подписку.');
    }
    try {
      const session = await gateway.createPortal({
        customerId: customer.stripe_customer_id,
        returnUrl: new URL('/plan', this.config.appUrl).href,
      });
      if (!validStripeUrl(session.url, 'billing.stripe.com')) {
        throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
      }
      return session;
    } catch (error) {
      if (error instanceof ProductError) throw error;
      throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
    }
  }

  private synchronizeSubscription(subscription: StripeSubscription, eventCreated: number): void {
    const userId = subscription.metadata.university_user_id;
    if (!userId || !subscription.customerId) return;
    const customer = this.db
      .prepare(
        'SELECT stripe_customer_id FROM billing_customers WHERE user_id = ? AND stripe_customer_id = ?',
      )
      .get(userId, subscription.customerId) as CustomerRow | undefined;
    if (!customer || !subscription.id) return;

    const now = this.config.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO billing_subscriptions
          (stripe_subscription_id, user_id, stripe_customer_id, status, is_entitled,
           current_period_end, cancel_at_period_end, last_event_created, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET
           user_id = excluded.user_id,
           stripe_customer_id = excluded.stripe_customer_id,
           status = excluded.status,
           is_entitled = excluded.is_entitled,
           current_period_end = excluded.current_period_end,
           cancel_at_period_end = excluded.cancel_at_period_end,
           last_event_created = excluded.last_event_created,
           synced_at = excluded.synced_at
         WHERE excluded.last_event_created >= billing_subscriptions.last_event_created`,
      )
      .run(
        subscription.id,
        userId,
        subscription.customerId,
        subscription.status,
        isEntitledSubscription(subscription, this.config.billing.priceId!) ? 1 : 0,
        secondsToIso(subscription.currentPeriodEnd),
        subscription.cancelAtPeriodEnd ? 1 : 0,
        eventCreated,
        now,
      );
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    const gateway = this.requireGateway();
    if (!signature) {
      throw new ProductError('INVALID_WEBHOOK_SIGNATURE', 400, 'Неверная подпись платежного запроса.');
    }

    let event: StripeWebhookEvent;
    try {
      event = gateway.constructWebhook(rawBody, signature);
    } catch {
      throw new ProductError('INVALID_WEBHOOK_SIGNATURE', 400, 'Неверная подпись платежного запроса.');
    }
    const alreadyProcessed = this.db
      .prepare('SELECT 1 FROM stripe_events WHERE stripe_event_id = ?')
      .get(event.id);
    if (alreadyProcessed) return;

    if (event.subscriptionId) {
      try {
        const subscription = await gateway.retrieveSubscription(event.subscriptionId);
        this.synchronizeSubscription(subscription, event.created);
      } catch (error) {
        if (error instanceof ProductError) throw error;
        throw new ProductError('BILLING_UNAVAILABLE', 503, 'Оплата временно недоступна.');
      }
    }

    this.db
      .prepare(
        `INSERT OR IGNORE INTO stripe_events (stripe_event_id, event_type, created_at, processed_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(event.id, event.type, event.created, this.config.now().toISOString());
  }

  async canDeleteUser(userId: string): Promise<boolean> {
    const customer = this.db
      .prepare('SELECT stripe_customer_id FROM billing_customers WHERE user_id = ?')
      .get(userId) as CustomerRow | undefined;
    if (!customer) return true;
    if (!this.gateway) return false;

    try {
      const subscriptions = await this.gateway.listSubscriptions(customer.stripe_customer_id);
      return !subscriptions.some((subscription) => BLOCKING_DELETION_STATUSES.has(subscription.status));
    } catch {
      return false;
    }
  }
}

export { CURRENCY, MONTHLY_AMOUNT };
