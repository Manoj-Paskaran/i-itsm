import { InfrastructureException } from './itsm-exception.js';
/** Wraps a persistence failure so callers never see driver-specific errors. */
export class DatabaseFailureException extends InfrastructureException {
  constructor(cause: unknown) {
    super('DATABASE_FAILURE', 'Database operation failed.', {}, { cause });
  }
}
