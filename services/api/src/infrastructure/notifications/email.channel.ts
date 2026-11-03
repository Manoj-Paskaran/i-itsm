import nodemailer, { type SendMailOptions } from 'nodemailer';
import type { NotificationMessage } from '../../application/notifications/notification-message.js';
import { NetworkFailureException } from '../../domain/exceptions/index.js';
import type { NotificationChannel } from '../../ports/index.js';
import type { Env } from '../config/env.js';
const escapeHtml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export class EmailChannel implements NotificationChannel {
  readonly kind = 'EMAIL' as const;
  private readonly deliver: (options: SendMailOptions) => Promise<unknown>;
  constructor(
    private readonly env: Env,
    deliver?: (options: SendMailOptions) => Promise<unknown>,
  ) {
    const transport = nodemailer.createTransport(env.SMTP_URL);
    this.deliver = deliver ?? ((options) => transport.sendMail(options));
  }
  async send(message: NotificationMessage): Promise<void> {
    const link = message.incidentId
      ? `${this.env.WEB_ORIGIN.replace(/\/$/, '')}/incidents/${message.incidentId}`
      : null;
    const details = [message.body, message.incidentNumber, link].filter(Boolean).join('\n\n');
    try {
      await this.deliver({
        from: 'I-ITSM <noreply@itsm.demo>',
        to: message.recipientEmail,
        subject: message.title,
        text: details,
        html: `<p>${escapeHtml(message.body)}</p>${message.incidentNumber ? `<p>${escapeHtml(message.incidentNumber)}</p>` : ''}${link ? `<p><a href="${escapeHtml(link)}">View incident</a></p>` : ''}`,
      });
    } catch (error) {
      throw new NetworkFailureException('smtp', error);
    }
  }
}
