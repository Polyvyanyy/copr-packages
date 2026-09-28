import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { ResolvedApplicationConfig } from './config';

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

export interface MailDelivery {
  readonly enabled: boolean;
  send(message: EmailMessage): Promise<void>;
}

export class EmailDeliveryError extends Error {
  constructor() {
    super('Email delivery is temporarily unavailable.');
    this.name = 'EmailDeliveryError';
  }
}

export class MemoryMailDelivery implements MailDelivery {
  readonly enabled = true;
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push({ ...message });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/gu, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return replacements[character] ?? character;
  });
}

function ensurePrivateMailDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}

class LocalMailDelivery implements MailDelivery {
  readonly enabled = true;

  constructor(private readonly directory: string) {
    ensurePrivateMailDirectory(directory);
  }

  async send(message: EmailMessage): Promise<void> {
    const filename = `${Date.now()}-${randomUUID()}.json`;
    const path = resolve(this.directory, filename);
    writeFileSync(
      path,
      JSON.stringify(
        {
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { encoding: 'utf8', mode: 0o600, flag: 'wx' },
    );
    chmodSync(path, 0o600);
  }
}

class ResendMailDelivery implements MailDelivery {
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly request: typeof fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await this.request(RESEND_EMAILS_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': message.idempotencyKey,
          },
          body: JSON.stringify({
            from: this.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          signal: controller.signal,
        });
        if (response.ok) return;
        if (response.status < 500 && response.status !== 429) throw new EmailDeliveryError();
      } catch (error) {
        if (error instanceof EmailDeliveryError) throw error;
        if (attempt === MAX_ATTEMPTS - 1) throw new EmailDeliveryError();
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 150 * (attempt + 1)));
      }
    }
    throw new EmailDeliveryError();
  }
}

export function createMailDelivery(
  config: ResolvedApplicationConfig,
  override?: MailDelivery,
): MailDelivery {
  if (override) return override;
  if (config.environment === 'production') {
    return new ResendMailDelivery(config.mail.apiKey!, config.mail.from!, config.mail.fetch ?? fetch);
  }
  if (config.environment === 'test') return new MemoryMailDelivery();
  return new LocalMailDelivery(resolve(config.dataDirectory, 'mail'));
}

function emailKey(secret: string, type: string, token: string): string {
  return createHmac('sha256', secret).update(`${type}:${token}`).digest('base64url');
}

export function verificationEmail(
  config: ResolvedApplicationConfig,
  input: { email: string; url: string; token: string },
): EmailMessage {
  const url = escapeHtml(input.url);
  return {
    to: input.email,
    subject: 'Подтвердите адрес электронной почты — University in a Box',
    text: `Подтвердите адрес электронной почты: ${input.url}`,
    html: `<p>Подтвердите адрес электронной почты:</p><p><a href="${url}">Подтвердить адрес</a></p>`,
    idempotencyKey: `verify-${emailKey(config.authSecret, 'verify', input.token)}`,
  };
}

export function passwordResetEmail(
  config: ResolvedApplicationConfig,
  input: { email: string; url: string; token: string },
): EmailMessage {
  const url = escapeHtml(input.url);
  return {
    to: input.email,
    subject: 'Сброс пароля — University in a Box',
    text: `Откройте ссылку, чтобы задать новый пароль: ${input.url}`,
    html: `<p>Откройте ссылку, чтобы задать новый пароль:</p><p><a href="${url}">Сбросить пароль</a></p>`,
    idempotencyKey: `reset-${emailKey(config.authSecret, 'reset', input.token)}`,
  };
}

