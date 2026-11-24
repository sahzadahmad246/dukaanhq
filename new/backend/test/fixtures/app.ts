import 'reflect-metadata';
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { IsString, Length } from 'class-validator';
import { AppModule } from '../../src/app.module';
import { configureApp, createAdapter } from '../../src/app';
import { parseConfig } from '../../src/config/config.module';
import { DatabaseService } from '../../src/database/database.service';
import { Public } from '../../src/common/public.decorator';
import { RateLimitStorage } from '../../src/security/rate-limit.module';
import { requestContext, timedQuery } from '../../src/common/request-context';

class ExampleDto {
  @IsString() @Length(1, 60) name!: string;
}

// These routes exist only inside the test module, never the production app.
@Controller({ path: 'fixture', version: '1' })
class FixtureController {
  @Public()
  @SkipThrottle()
  @Get('query-context')
  async queryContext() {
    await timedQuery(async () => 1);
    return requestContext.getStore();
  }
  @Public()
  @SkipThrottle()
  @Post('upload')
  async upload(@Req() request: FastifyRequest) {
    const part = await request.file();
    let bytes = 0;
    if (part) {
      for await (const chunk of part.file) bytes += chunk.length;
      if (part.file.truncated) throw new PayloadTooLargeException();
    }
    return { bytes };
  }
  @Public() @SkipThrottle() @Post('validate') validate(
    @Body() body: ExampleDto,
  ) {
    return body;
  }
  @Get('private') private() {
    return { secret: true };
  }
  @Public() @SkipThrottle() @Get('failure') failure() {
    throw new Error('postgres://admin:secret@private-db:5432/customer_phone');
  }
  @Public()
  @Throttle({ default: { limit: 2, ttl: 10000 } })
  @Get('limited')
  limited() {
    return { ok: true };
  }
}

export async function testApp(
  options: {
    ready?: boolean;
    env?: Record<string, string>;
    limiterReady?: boolean;
    limiterFailure?: boolean;
  } = {},
) {
  const config = parseConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    AUTH_ENABLED: 'true',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    OTP_RATE_LIMIT_SECRET: 'test-rate-secret-that-is-at-least-32-characters',
    ...options.env,
  });
  const builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config)],
    controllers: [FixtureController],
  })
    .overrideProvider(DatabaseService)
    .useValue({ isReady: async () => options.ready ?? true });
  if (options.limiterReady === false || options.limiterFailure)
    builder.overrideProvider(RateLimitStorage).useValue({
      isReady: async () => false,
      increment: async () => {
        const { ServiceUnavailableException } = await import('@nestjs/common');
        throw new ServiceUnavailableException();
      },
    });
  const module = await builder.compile();
  const app = module.createNestApplication<NestFastifyApplication>(
    createAdapter(config),
    { logger: false },
  );
  return configureApp(app, config);
}
