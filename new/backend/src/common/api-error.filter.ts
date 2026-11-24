import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

const codes: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'ACCESS_DENIED',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    let status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    // Fastify parser errors occur before Nest's validation pipe.
    if (
      !(exception instanceof HttpException) &&
      exception &&
      typeof exception === 'object' &&
      'statusCode' in exception &&
      typeof exception.statusCode === 'number' &&
      [400, 413, 415].includes(exception.statusCode)
    )
      status = exception.statusCode;
    const details =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload =
      details && typeof details === 'object'
        ? (details as Record<string, unknown>)
        : {};
    const code =
      typeof payload.code === 'string'
        ? payload.code
        : (codes[status] ?? 'INTERNAL_ERROR');
    if (status === 429 && typeof payload.retry_after === 'number')
      response.header(
        'Retry-After',
        Math.min(86400, Math.max(1, Math.ceil(payload.retry_after))),
      );
    // Never serialize thrown Error.message or provider responses.
    const message =
      status >= 500
        ? 'Service temporarily unavailable.'
        : ({
            400: 'Check the submitted fields.',
            401: 'Authentication required.',
            403: 'Access denied.',
            404: 'Resource not found.',
            413: 'Request body is too large.',
            415: 'Unsupported content type.',
            429: 'Too many requests. Try again shortly.',
          }[status] ?? 'Request failed.');
    if (status >= 500) this.logger.error({ code, requestId: request.id });
    void response.status(status).send({
      error: {
        code,
        message,
        ...(Array.isArray(payload.fields) ? { fields: payload.fields } : {}),
        requestId: request.id,
      },
    });
  }
}
