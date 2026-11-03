import { describe, expect, it } from 'vitest';
import { EventType } from '../../domain/events/index.js';
import { NetworkFailureException } from '../../domain/exceptions/index.js';
import { asIncidentId, asUserId, Instant } from '../../domain/shared/index.js';
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
});
