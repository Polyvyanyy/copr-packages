CREATE TABLE account_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  trial_ends_at TEXT NOT NULL,
  onboarding_completed_at TEXT
);

CREATE TABLE terms_consents (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  terms_url TEXT NOT NULL,
  accepted_at TEXT NOT NULL
);

CREATE TABLE learning_states (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('account', 'billing', 'content', 'other')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 5000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL
);

CREATE INDEX support_tickets_user_created_idx ON support_tickets(user_id, created_at DESC);

CREATE TABLE billing_customers (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE billing_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL REFERENCES billing_customers(stripe_customer_id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  is_entitled INTEGER NOT NULL CHECK (is_entitled IN (0, 1)),
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL CHECK (cancel_at_period_end IN (0, 1)),
  last_event_created INTEGER NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE INDEX billing_subscriptions_user_period_idx
  ON billing_subscriptions(user_id, current_period_end DESC);

CREATE TABLE billing_checkout_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  stripe_checkout_session_id TEXT UNIQUE,
  url TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX billing_checkout_sessions_user_expiry_idx
  ON billing_checkout_sessions(user_id, expires_at DESC);

CREATE TABLE stripe_events (
  stripe_event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE api_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0),
  PRIMARY KEY (scope, subject_hash, window_started_at)
);

CREATE INDEX api_rate_limits_window_idx ON api_rate_limits(window_started_at);
