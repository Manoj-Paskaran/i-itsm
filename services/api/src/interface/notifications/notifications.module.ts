import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { NotificationDispatcher } from '../../application/notifications/notification-dispatcher.js';
import { InProcessEventPublisher } from '../../application/events/in-process-event-publisher.js';
import { ConfigModule, ENV } from '../../infrastructure/config/config.module.js';
import type { Env } from '../../infrastructure/config/env.js';
import { RepositoriesModule } from '../../infrastructure/db/repositories/repositories.module.js';
import { InAppChannel } from '../../infrastructure/notifications/in-app.channel.js';
import { EmailChannel } from '../../infrastructure/notifications/email.channel.js';
import { RealtimeGateway } from '../../infrastructure/notifications/realtime.gateway.js';
import { RealtimeBroadcaster } from '../../infrastructure/notifications/realtime-broadcaster.js';
import {
  INCIDENT_REPOSITORY,
  USER_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  TOKEN_SERVICE,
  type IncidentRepository,
  type UserRepository,
  type NotificationRepository,
  type TokenService,
} from '../../ports/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { IncidentsModule } from '../incidents/incidents.module.js';
import { NotificationsController } from './notifications.controller.js';
@Injectable()
class Subscriptions implements OnModuleInit {
  constructor(
    private readonly publisher: InProcessEventPublisher,
    private readonly dispatcher: NotificationDispatcher,
    private readonly broadcaster: RealtimeBroadcaster,
  ) {}
  onModuleInit(): void {
    this.publisher.subscribe(this.dispatcher);
    this.publisher.subscribe(this.broadcaster);
  }
}
@Module({
  imports: [ConfigModule, RepositoriesModule, AuthModule, IncidentsModule],
  controllers: [NotificationsController],
  providers: [
    RealtimeGateway,
    {
      provide: InAppChannel,
      useFactory: (repo: NotificationRepository, gateway: RealtimeGateway) =>
        new InAppChannel(repo, gateway),
      inject: [NOTIFICATION_REPOSITORY, RealtimeGateway],
    },
    {
      provide: EmailChannel,
      useFactory: (env: Env, tokens: TokenService) => new EmailChannel(env, undefined, tokens),
      inject: [ENV, TOKEN_SERVICE],
    },
    {
      provide: NotificationDispatcher,
      useFactory: (
        incidents: IncidentRepository,
        users: UserRepository,
        inApp: InAppChannel,
        email: EmailChannel,
        env: Env,
      ) =>
        new NotificationDispatcher(
          incidents,
          users,
          env.NOTIFICATIONS_EMAIL_ENABLED ? [inApp, email] : [inApp],
        ),
      inject: [INCIDENT_REPOSITORY, USER_REPOSITORY, InAppChannel, EmailChannel, ENV],
    },
    {
      provide: RealtimeBroadcaster,
      useFactory: (gateway: RealtimeGateway) => new RealtimeBroadcaster(gateway),
      inject: [RealtimeGateway],
    },
    Subscriptions,
  ],
})
export class NotificationsModule {}
