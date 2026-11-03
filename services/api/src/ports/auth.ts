import type { UserId } from '../domain/shared/index.js';
import type { Role, User } from '../domain/users/index.js';
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}
export interface AccessClaims {
  sub: UserId;
  role: Role;
}
export interface TokenService {
  issueAccess(user: User): Promise<{ token: string; expiresIn: number }>;
  issueRefresh(user: User): Promise<{ token: string; maxAgeSeconds: number }>;
  verifyAccess(token: string): Promise<AccessClaims>;
  verifyRefresh(token: string): Promise<{ userId: UserId }>;
}
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
