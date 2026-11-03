export type ErrorKind =
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rule'
  | 'unavailable';
/** Base for domain failures with stable machine-readable metadata. */
export abstract class ItsmException extends Error {
  abstract readonly kind: ErrorKind;
  readonly details: Readonly<Record<string, unknown>>;
  constructor(
    readonly code: string,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.details = Object.freeze({ ...details });
  }
}
export abstract class BusinessRuleException extends ItsmException {}
export abstract class NotFoundException extends ItsmException {
  readonly kind = 'not_found' as const;
}
export abstract class SecurityException extends ItsmException {}
export abstract class InfrastructureException extends ItsmException {
  readonly kind = 'unavailable' as const;
}
