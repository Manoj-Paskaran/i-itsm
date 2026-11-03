import { SecurityException } from './itsm-exception.js';
/** Raised on a failed login; deliberately does not say which part was wrong. */
export class InvalidCredentialsException extends SecurityException {
  readonly kind = 'unauthenticated' as const;
  constructor() {
    super('INVALID_CREDENTIALS', 'Invalid credentials.', {});
  }
}
