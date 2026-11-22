import { randomBytes, randomUUID } from 'node:crypto';
import { AccountInactiveException, type ExternalIdentity } from './identity-provider.js';
import type { AuthUser, RegisterRequest } from '@itsm/contracts';
import {
  InvalidCredentialsException,
  InvalidInputException,
  InvalidTokenException,
} from '../../domain/exceptions/index.js';
import { asUserId, Email, type UserId } from '../../domain/shared/index.js';
import { Role, UserFactory, type User } from '../../domain/users/index.js';
import type { PasswordHasher, TokenService, UserRepository } from '../../ports/index.js';
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Z6u3xZsjHrbwYMR+3MJ6lA$0s3OqiV2yhbG/3qQI0J4LyhFPlMcw22hvJQak6lE3hE';
export type AuthUserView = AuthUser;
export function userView(user: User): AuthUserView {
  return {
    id: user.id(),
    name: user.name(),
    email: user.email().value,
    role: user.role(),
    permissions: [...user.permissions()],
  };
}
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}
  private async session(user: User) {
    const [access, refresh] = await Promise.all([
      this.tokens.issueAccess(user),
      this.tokens.issueRefresh(user),
    ]);
    return { user: userView(user), access, refresh };
  }
  async register(cmd: RegisterRequest) {
    const email = Email.of(cmd.email);
    if (await this.users.findByEmail(email))
      throw new InvalidInputException('Email already exists.', { field: 'email' });
    const passwordHash = await this.hasher.hash(cmd.password);
    const user = UserFactory.create({
      id: asUserId(randomUUID()),
      name: cmd.name,
      email: email.value,
      passwordHash,
      department: cmd.department,
      role: Role.EMPLOYEE,
    });
    await this.users.save(user);
    return this.session(user);
  }
  async login(email: string, password: string) {
    const user = await this.users.findByEmail(Email.of(email));
    const valid = await this.hasher.verify(user?.toSnapshot().passwordHash ?? DUMMY_HASH, password);
    if (!user || !valid || !user.isActive()) throw new InvalidCredentialsException();
    return this.session(user);
  }
  async loginWithExternalIdentity(identity: ExternalIdentity) {
    const user = await this.users.findByEmail(Email.of(identity.email));
    if (user) {
      if (!user.isActive()) throw new AccountInactiveException();
      return this.session(user);
    }
    // Google supplies no department. Reuse employee registration with an unknown random password.
    return this.register({
      email: identity.email,
      name: identity.name,
      department: 'Unspecified',
      password: randomBytes(32).toString('hex'),
    });
  }
  async refresh(token: string) {
    const { userId } = await this.tokens.verifyRefresh(token);
    const user = await this.users.findById(userId);
    if (!user || !user.isActive()) throw new InvalidTokenException();
    return this.session(user);
  }
  async loginWithEmailLink(token: string) {
    const { userId, incidentId } = await this.tokens.verifyEmailLink(token);
    const user = await this.users.findById(userId);
    if (!user || !user.isActive()) throw new InvalidTokenException();
    const session = await this.session(user);
    return { ...session, incidentId };
  }
  async me(id: UserId): Promise<AuthUserView> {
    const user = await this.users.findById(id);
    if (!user || !user.isActive()) throw new InvalidTokenException();
    return userView(user);
  }
}
