import { Logger } from '@nestjs/common';
import type { SendMailOptions } from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { EventType } from '../../domain/events/index.js';
import { NetworkFailureException } from '../../domain/exceptions/index.js';
import { asIncidentId, asUserId, Instant } from '../../domain/shared/index.js';
import type { TokenService } from '../../ports/index.js';
import { InMemoryNotificationRepository } from '../../application/testing/in-memory-notification-repository.js';
import { loadEnv } from '../config/env.js';
import { EmailChannel } from './email.channel.js';
import { InAppChannel } from './in-app.channel.js';
import type { RealtimeGateway } from './realtime.gateway.js';
const message = {
  recipientId: asUserId('00000000-0000-4000-8000-000000000001'),
  recipientName: 'User',
  recipientEmail: 'user@example.com',
  eventType: EventType.IncidentAssigned,
  title: 'Assigned',
  body: 'Help',
  incidentId: asIncidentId('00000000-0000-4000-8000-000000000002'),
  incidentNumber: 'INC0001',
  createdAt: Instant.fromIso('2026-11-03T09:00:00.000Z'),
};
describe('notification channels', () => {
  it('persistsEvenWhenPushFails', async () => {
    const repo = new InMemoryNotificationRepository();
    const gateway = {
      pushTo: () => {
        throw new Error('offline');
      },
    } as unknown as RealtimeGateway;
    await new InAppChannel(repo, gateway).send(message);
    expect(await repo.unreadCount(message.recipientId)).toBe(1);
  });
  it('wrapsSmtpFailuresAsNetworkFailure', async () => {
    const cause = new Error('offline');
    const channel = new EmailChannel(loadEnv({ NODE_ENV: 'test' }), () => Promise.reject(cause));
    await expect(channel.send(message)).rejects.toBeInstanceOf(NetworkFailureException);
  });
  it('sendsToAllowlistedRecipient', async () => {
    const deliver = vi.fn().mockResolvedValue(undefined);
    const channel = new EmailChannel(
      loadEnv({ EMAIL_ALLOWLIST: ' other@example.com, USER@EXAMPLE.COM ' }),
      deliver,
    );
    await channel.send(message);
    expect(deliver).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ to: message.recipientEmail }),
    );
  });
  it.each(['other@example.com', ' , , '])(
    'skipsRecipientNotOnAllowlist (%s)',
    async (allowlist) => {
      const deliver = vi.fn().mockRejectedValue(new Error('must not send'));
      const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
      try {
        const channel = new EmailChannel(loadEnv({ EMAIL_ALLOWLIST: allowlist }), deliver);
        await expect(channel.send(message)).resolves.toBeUndefined();
        expect(deliver).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledWith(expect.stringContaining('EMAIL_ALLOWLIST'));
      } finally {
        debug.mockRestore();
      }
    },
  );
  it.each([undefined, '', '   '])('sendsToEveryoneWhenAllowlistUnset (%s)', async (allowlist) => {
    const deliver = vi.fn().mockResolvedValue(undefined);
    const channel = new EmailChannel(loadEnv({ EMAIL_ALLOWLIST: allowlist }), deliver);
    for (const recipientEmail of ['user@example.com', 'priya@itsm.demo']) {
      await channel.send({ ...message, recipientEmail });
    }
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: 'user@example.com', from: 'I-ITSM <noreply@itsm.demo>' }),
    );
    expect(deliver).toHaveBeenNthCalledWith(2, expect.objectContaining({ to: 'priya@itsm.demo' }));
  });
  it('usesConfiguredMailFrom', async () => {
    const deliver = vi.fn().mockResolvedValue(undefined);
    const from = 'I-ITSM <sender@example.com>';
    await new EmailChannel(loadEnv({ MAIL_FROM: from }), deliver).send(message);
    expect(deliver).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ from }));
  });
  it('deliversRenderedSubjectHtmlAndPlainTextWithIncidentLink', async () => {
    const deliver = vi
      .fn<(options: SendMailOptions) => Promise<void>>()
      .mockResolvedValue(undefined);
    await new EmailChannel(loadEnv({ WEB_ORIGIN: 'https://itsm.demo/' }), deliver).send({
      ...message,
      recipientName: 'Priya Sharma',
      eventType: EventType.IncidentResolved,
      title: 'INC0215 resolved',
      body: 'Restarted gateway connector.',
      incidentNumber: 'INC0215',
      incidentTitle: 'Payment Gateway declines every card at checkout',
      resolutionSummary: 'Restarted gateway connector.',
      rootCause: 'Stale connection pool.',
    });
    expect(deliver).toHaveBeenCalledTimes(1);
    const [delivered] = deliver.mock.calls[0]!;
    expect(delivered.subject).toBe(
      '[INC0215] Resolved: Payment Gateway declines every card at checkout',
    );
    expect(delivered.html).toContain('Review and confirm the fix');
    expect(delivered.text).toContain(
      'Review and confirm the fix: https://itsm.demo/incidents/00000000-0000-4000-8000-000000000002',
    );
  });
  it('buildsSignedEmailLoginLinkWhenTokenServiceIsProvided', async () => {
    const deliver = vi
      .fn<(options: SendMailOptions) => Promise<void>>()
      .mockResolvedValue(undefined);
    const issueEmailLink = vi.fn().mockResolvedValue('signed-email-token');
    const tokens = { issueEmailLink } as unknown as TokenService;
    await new EmailChannel(loadEnv({ WEB_ORIGIN: 'https://itsm.demo/' }), deliver, tokens).send({
      ...message,
      recipientName: 'Priya Sharma',
      eventType: EventType.InfoRequested,
      title: 'Information requested for INC0215',
      body: 'What error code do you see?',
      incidentNumber: 'INC0215',
      incidentTitle: 'Card payments failing at checkout',
      question: 'What error code do you see?',
    });
    expect(issueEmailLink).toHaveBeenCalledWith(message.recipientId, message.incidentId);
    const [delivered] = deliver.mock.calls[0]!;
    expect(delivered.html).toContain(
      'https://itsm.demo/api/auth/email-link?token=signed-email-token',
    );
    expect(delivered.text).toContain(
      'Answer the question: https://itsm.demo/api/auth/email-link?token=signed-email-token',
    );
  });
});
