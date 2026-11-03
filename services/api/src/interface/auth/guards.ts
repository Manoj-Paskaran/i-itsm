import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InvalidTokenException } from '../../domain/exceptions/index.js';
import type { User, Permission } from '../../domain/users/index.js';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  type TokenService,
  type UserRepository,
} from '../../ports/index.js';
import { PERMISSIONS, PUBLIC } from './decorators.js';
interface AuthRequest {
  headers: { authorization?: string };
  user?: User;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()]))
      return true;
    const request = ctx.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match?.[1]) throw new InvalidTokenException();
    const claims = await this.tokens.verifyAccess(match[1]);
    const user = await this.users.findById(claims.sub);
    if (!user || !user.isActive()) throw new InvalidTokenException();
    request.user = user;
    return true;
  }
}
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const permissions =
      this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    const user = ctx.switchToHttp().getRequest<AuthRequest>().user;
    if (permissions.length && !user) throw new InvalidTokenException();
    for (const permission of permissions) user!.require(permission);
    return true;
  }
}
