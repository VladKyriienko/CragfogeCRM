import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../errors/domain-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ZodError) {
      response.status(400).json({
        statusCode: 400,
        code: 'validation_error',
        message: 'Invalid request',
        details: {
          errors: exception.issues.map((issue) => ({
            path: issue.path.join('.') || '(root)',
            message: issue.message,
          })),
        },
      });
      return;
    }

    if (exception instanceof DomainError) {
      response.status(exception.statusCode).json({
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        ...(exception.details !== undefined ? { details: exception.details } : {}),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(
        typeof body === 'string'
          ? {
              statusCode: status,
              message: body,
            }
          : body,
      );
      return;
    }

    const message = exception instanceof Error ? exception.message : 'Unhandled error';
    this.logger.error(message);
    response.status(500).json({
      statusCode: 500,
      code: 'internal_error',
      message: 'Internal server error',
    });
  }
}
