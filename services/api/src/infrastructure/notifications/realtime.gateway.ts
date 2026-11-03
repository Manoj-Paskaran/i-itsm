import { Inject } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { NotificationPush } from '@itsm/contracts';
import { Permission } from '../../domain/users/index.js';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  type TokenService,
  type UserRepository,
} from '../../ports/index.js';
@WebSocketGateway({ namespace: '/realtime', path: '/socket.io' })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token: unknown = client.handshake.auth.token;
      if (typeof token !== 'string') throw new Error('Missing token');
      const claims = await this.tokens.verifyAccess(token);
      const user = await this.users.findById(claims.sub);
      if (!user || !user.isActive()) throw new Error('Invalid user');
      await client.join(`user:${user.id()}`);
      if (user.can(Permission.INCIDENT_VIEW_ALL)) await client.join('staff');
    } catch {
      client.disconnect(true);
    }
  }
  pushTo(userId: string, payload: NotificationPush): void {
    this.server?.to(`user:${userId}`).emit('notification', payload);
  }
  incidentUpdated(incidentId: string): void {
    this.server?.to('staff').emit('incident.updated', { type: 'incident.updated', incidentId });
  }
}
