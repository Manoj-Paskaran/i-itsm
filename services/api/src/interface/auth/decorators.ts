import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission, User } from '../../domain/users/index.js';
export const PUBLIC = 'itsm.public';
export const PERMISSIONS = 'itsm.permissions';
export const Public = () => SetMetadata(PUBLIC, true);
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS, permissions);
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest<{ user: User }>().user,
);
