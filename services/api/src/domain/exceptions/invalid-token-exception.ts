import { SecurityException } from './itsm-exception.js';
export class InvalidTokenException extends SecurityException {
  readonly kind = 'unauthenticated' as const;
  constructor() {
    super('INVALID_TOKEN', 'Invalid token.', {});
  }
}
