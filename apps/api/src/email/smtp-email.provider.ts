import nodemailer from 'nodemailer';
import type { Env } from '../config/env';
import type { EmailProvider, SendEmailInput } from './email.types';

export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter;

  constructor(private readonly env: Env) {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text,
    });
  }
}
