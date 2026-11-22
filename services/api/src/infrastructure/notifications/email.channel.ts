import { Logger } from '@nestjs/common';
import nodemailer, { type SendMailOptions } from 'nodemailer';
import type { NotificationMessage } from '../../application/notifications/notification-message.js';
import { NetworkFailureException } from '../../domain/exceptions/index.js';
import type { NotificationChannel, TokenService } from '../../ports/index.js';
import type { Env } from '../config/env.js';
import { renderNotificationEmail } from './email-template.js';
import { RecipientAllowlist } from './recipient-allowlist.js';

export class EmailChannel implements NotificationChannel {
  readonly kind = 'EMAIL' as const;
  private readonly logger = new Logger(EmailChannel.name);
  private readonly allowlist: RecipientAllowlist;
  private readonly deliver: (options: SendMailOptions) => Promise<unknown>;
  constructor(
    private readonly env: Env,
    deliver?: (options: SendMailOptions) => Promise<unknown>,
    private readonly tokens?: TokenService,
  ) {
    this.allowlist = new RecipientAllowlist(env.EMAIL_ALLOWLIST);
    const transport = nodemailer.createTransport(env.SMTP_URL);
    this.deliver = deliver ?? ((options) => transport.sendMail(options));
  }
  async send(message: NotificationMessage): Promise<void> {
    if (!this.allowlist.allows(message.recipientEmail)) {
      this.logger.debug('Skipped email: recipient is not on EMAIL_ALLOWLIST');
      return;
    }
    const base = this.env.WEB_ORIGIN.replace(/\/$/, '');
    const link = message.incidentId
      ? this.tokens
        ? `${base}/api/auth/email-link?token=${encodeURIComponent(
            await this.tokens.issueEmailLink(message.recipientId, message.incidentId),
          )}`
        : `${base}/incidents/${message.incidentId}`
      : null;
    const { subject, text, html } = renderNotificationEmail(message, link);
    try {
      await this.deliver({
        from: this.env.MAIL_FROM,
        to: message.recipientEmail,
        subject,
        text,
        html,
      });
    } catch (error) {
      throw new NetworkFailureException('smtp', error);
    }
  }
}
