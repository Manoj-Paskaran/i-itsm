import { ItsmException } from './itsm-exception.js';
/** Raised when input breaks a value-object or validation rule; carries field details. */
export class InvalidInputException extends ItsmException {
  readonly kind = 'validation' as const;
  constructor(message: string, details: Readonly<Record<string, unknown>>) {
    super('INVALID_INPUT', message, details);
  }
}
