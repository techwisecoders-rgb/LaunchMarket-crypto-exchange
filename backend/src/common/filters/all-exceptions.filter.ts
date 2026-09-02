import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let code = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string | string[]) ?? exception.message;
        error = (res.error as string) ?? exception.name;
        code = (res.code as string) ?? 'HTTP_ERROR';
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = HttpStatus.CONFLICT;
      error = 'Database Error';
      code = exception.code;
      switch (exception.code) {
        case 'P2002':
          message = `A record with this value already exists: ${this.extractTarget(exception.meta)}`;
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          break;
        case 'P2003':
          message = 'Foreign key constraint failed';
          break;
        default:
          message = 'Database operation failed';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Validation Error';
      code = 'PRISMA_VALIDATION_ERROR';
      message = 'Invalid data provided';
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
      code = 'UNHANDLED_ERROR';
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
        `${request.method} ${request.url}`,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      code,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    });
  }

  private extractTarget(meta: unknown): string {
    if (meta && typeof meta === 'object' && 'target' in meta) {
      const target = (meta as { target: unknown }).target;
      if (Array.isArray(target)) {
        return target.join(', ');
      }
      return String(target);
    }
    return 'unknown field';
  }
}