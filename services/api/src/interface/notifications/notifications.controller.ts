import { Controller, Get, HttpCode, Inject, NotFoundException, Param, Post } from '@nestjs/common';
import { NotificationListSchema } from '@itsm/contracts';
import type { User } from '../../domain/users/index.js';
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from '../../ports/index.js';
import { CurrentUser } from '../auth/decorators.js';
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: NotificationRepository) {}
  @Get() async list(@CurrentUser() user: User) {
    const [items, unread] = await Promise.all([
      this.repo.listFor(user.id(), 50),
      this.repo.unreadCount(user.id()),
    ]);
    return NotificationListSchema.parse({ items, unread });
  }
  @Post('read-all') @HttpCode(204) async readAll(@CurrentUser() user: User) {
    await this.repo.markAllRead(user.id());
  }
  @Post(':id/read') @HttpCode(204) async read(@CurrentUser() user: User, @Param('id') id: string) {
    if (!(await this.repo.markRead(user.id(), id))) throw new NotFoundException();
  }
}
