import { SecurityException } from './itsm-exception.js';
/** Raised when an actor lacks the permission an operation requires. */
export class UnauthorizedOperationException extends SecurityException {
  readonly kind = 'forbidden' as const;
  constructor(actorRole: string, permission: string) {
    super('UNAUTHORIZED_OPERATION', `Role ${actorRole} cannot perform ${permission}.`, {
      actorRole,
      permission,
    });
  }
}
