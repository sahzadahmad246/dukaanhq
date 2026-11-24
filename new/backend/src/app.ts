import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { RequestMethod, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { LogController } from 'fastify';
import { AppModule } from './app.module';
import { AppConfig } from './config/config.module';
import { ApiErrorFilter } from './common/api-error.filter';
import { validationPipe } from './common/validation';
import { requestContext, RequestContext } from './common/request-context';

export function createAdapter(config: AppConfig) {
  return new FastifyAdapter({
    bodyLimit: 1024 * 1024,
    requestTimeout: 10000,
    connectionTimeout: 10000,
    keepAliveTimeout: 5000,
    trustProxy: config.TRUST_PROXY_HOPS
      ? (_address, hop) => hop < config.TRUST_PROXY_HOPS
      : false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    logger:
      config.LOG_LEVEL === 'silent'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body',
              'res.headers["set-cookie"]',
            ],
          },
  });
}

export async function configureApp(
  app: NestFastifyApplication,
  config: AppConfig,
) {
  app.enableShutdownHooks();
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health/live', method: RequestMethod.ALL },
      { path: 'health/ready', method: RequestMethod.ALL },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableCors({
    origin: [...config.origins],
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-ID', 'Retry-After'],
  });
  await app.register(helmet, {
    contentSecurityPolicy: config.docsEnabled ? false : undefined,
  });
  // Nest Multer is Express-only. Future uploads must stream via Fastify multipart
  // with these explicit limits, never buffer arbitrary files into API memory.
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, parts: 11 },
    attachFieldsToBody: false,
  });
  const fastify = app.getHttpAdapter().getInstance();
  const contexts = new WeakMap<
    object,
    { context: RequestContext; started: number }
  >();
  fastify.addHook('onRequest', (request, response, done) => {
    const context: RequestContext = {
      requestId: request.id,
      queries: 0,
      queryMs: 0,
    };
    contexts.set(request, { context, started: performance.now() });
    response
      .header('X-Request-ID', request.id)
      .header('Cache-Control', 'no-store');
    requestContext.run(context, done);
  });
  fastify.addHook('onResponse', (request, response, done) => {
    const entry = contexts.get(request);
    if (entry) {
      const elapsedMs = performance.now() - entry.started;
      const record = {
        requestId: request.id,
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        status: response.statusCode,
        elapsedMs: +elapsedMs.toFixed(2),
        queries: entry.context.queries,
        queryMs: +entry.context.queryMs.toFixed(2),
        responseBytes: response.getHeader('content-length'),
      };
      // Route templates only: no URL query, phone, tokens, SQL parameters or body.
      if (elapsedMs >= config.SLOW_REQUEST_MS)
        request.log.warn(record, 'Slow request');
      else request.log.info(record, 'Request completed');
    }
    done();
  });
  if (config.docsEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('DukaanHQ API')
        .setDescription(
          'SMS authentication and account bootstrap. Twilio delivers OTP through Supabase Auth. Use Bearer tokens; role intent grants no membership. Money: exact decimal strings; timestamps: UTC ISO 8601.',
        )
        .setVersion('1')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: '/api/openapi.json',
      swaggerOptions: { persistAuthorization: false },
    });
  }
  await app.init();
  await fastify.ready();
  return app;
}

export async function createApp(config: AppConfig) {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config),
    createAdapter(config),
    {
      logger: config.LOG_LEVEL === 'silent' ? false : ['error', 'warn', 'log'],
      abortOnError: false,
    },
  );
  try {
    return await configureApp(app, config);
  } catch (error) {
    await app.close();
    throw error;
  }
}
