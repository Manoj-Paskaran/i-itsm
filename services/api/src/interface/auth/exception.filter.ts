import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { ItsmException, type ErrorKind } from '../../domain/exceptions/index.js';
const statuses: Record<ErrorKind, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rule: 422,
  unavailable: 503,
};
@Catch()
export class ItsmExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ItsmExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof ItsmException) {
      response
        .status(statuses[error.kind])
        .json({ error: { code: error.code, message: error.message, details: error.details } });
      return;
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const body = error.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : typeof body === 'object' &&
              body !== null &&
              'message' in body &&
              typeof body.message === 'string'
            ? body.message
            : error.message;
      response.status(status).json({
        error: {
          code:
            status === 404 ? 'NOT_FOUND' : status === 429 ? 'TOO_MANY_REQUESTS' : `HTTP_${status}`,
          message,
        },
      });
      return;
    }
    this.logger.error('Unexpected error', error instanceof Error ? error.stack : String(error));
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: { code: 'INTERNAL', message: 'Unexpected error' } });
  }
}
