import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_ERROR';
    let message = 'Something went wrong';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') message = res;
      else if (typeof res === 'object' && res !== null) {
        const r = res as any;
        message = Array.isArray(r.message) ? r.message.join('; ') : r.message ?? message;
        errorCode = r.errorCode ?? (r.error ? String(r.error).toUpperCase().replace(/\s+/g, '_') : errorCode);
        if (Array.isArray(r.message)) details = r.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    if (status >= 500) { message = 'Internal server error'; details = undefined; }

    response.status(status).json({
      statusCode: status, errorCode, message, details,
      timestamp: new Date().toISOString(), path: request.url,
    });
  }
}
