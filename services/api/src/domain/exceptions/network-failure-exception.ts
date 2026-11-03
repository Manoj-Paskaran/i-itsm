import { InfrastructureException } from './itsm-exception.js';
/** Wraps an unreachable external dependency (ML service, SMTP, push). */
export class NetworkFailureException extends InfrastructureException {
  constructor(target: string, cause: unknown) {
    super('NETWORK_FAILURE', `Network request to ${target} failed.`, { target }, { cause });
  }
}
