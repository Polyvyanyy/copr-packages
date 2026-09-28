import type { LearningState } from './domain/types';

export type ProductEnvironment = 'development' | 'production' | 'test';

export interface ProductConfig {
  environment: ProductEnvironment;
  billing: {
    enabled: boolean;
    mode: 'disabled' | 'test' | 'live';
    monthlyAmount: 2000;
    currency: 'usd';
  };
  operator: {
    name: string | null;
    email: string | null;
    address: string | null;
  };
  emailEnabled: boolean;
}

export interface SubscriptionSnapshot {
  status: string;
  access: 'full' | 'free';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export interface AccountSnapshot {
  user: AccountUser;
  subscription: SubscriptionSnapshot;
  onboardingComplete: boolean;
}

export interface LearningEnvelope {
  state: LearningState;
  revision: number;
  updatedAt: string | null;
}

export interface LearningUpdateRequest {
  state: LearningState;
  revision: number;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

export interface LearningConflictEnvelope extends ApiErrorEnvelope {
  current: LearningEnvelope;
}

export interface CheckoutResponse {
  url: string;
}

export type SupportCategory = 'account' | 'billing' | 'content' | 'other';

export interface SupportTicket {
  id: string;
  category: SupportCategory;
  message: string;
  createdAt: string;
  status: 'open' | 'closed';
}

export interface SupportTicketList {
  tickets: SupportTicket[];
}

export interface SupportTicketCreateRequest {
  category: SupportCategory;
  message: string;
}

export interface SupportTicketCreateResponse {
  id: string;
  createdAt: string;
}

export interface OnboardingCompletionResponse {
  completed: true;
}

export interface AccountExport {
  exportedAt: string;
  account: AccountUser;
  onboardingComplete: boolean;
  termsConsent: { version: string; url: string; acceptedAt: string } | null;
  subscription: SubscriptionSnapshot;
  learning: LearningEnvelope;
  supportTickets: SupportTicket[];
}

export interface EmailSignUpRequest {
  name: string;
  email: string;
  password: string;
  /** Must be true for POST /api/auth/sign-up/email. */
  termsAccepted: true;
  callbackURL?: string;
}
