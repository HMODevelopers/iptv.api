import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(); const response = ctx.getResponse<Response>(); const request = ctx.getRequest<Request>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : null;
    const message = typeof body === 'string' ? body : body && typeof body === 'object' && 'message' in body ? body.message : 'Error interno del servidor';
    if (status >= 500) this.logger.error(`HTTP ${status} ${request.method}; detalles internos omitidos`);
    response.status(status).json({ statusCode: status, message, timestamp: new Date().toISOString() });
  }
}
