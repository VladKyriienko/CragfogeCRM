import type { EmailProvider } from './email.types';

/** Used in tests so invitation and auth mail does not require a live SMTP server. */
export class NoopEmailProvider implements EmailProvider {
  async send(): Promise<void> {}
}
