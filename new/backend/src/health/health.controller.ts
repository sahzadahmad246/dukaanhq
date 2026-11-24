import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
  Inject,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/public.decorator';
import { ApiErrorResponse } from '../common/api-error.dto';
import { DatabaseService } from '../database/database.service';
import { RateLimitStorage } from '../security/rate-limit.module';
import { AppConfig, CONFIG } from '../config/config.module';

class LiveResponse {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}
class ReadyResponse {
  @ApiProperty({ enum: ['ready'] }) status!: 'ready';
}

@Public()
@SkipThrottle()
@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly limiter: RateLimitStorage,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('live')
  @ApiOkResponse({ type: LiveResponse })
  live(): LiveResponse {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ type: ReadyResponse })
  @ApiServiceUnavailableResponse({
    description: 'Database schema/role or distributed limiter unavailable.',
    type: ApiErrorResponse,
  })
  async ready(): Promise<ReadyResponse> {
    const [database, limiter] = await Promise.all([
      this.database.isReady(),
      this.limiter.isReady(),
    ]);
    if (!database || !limiter || !this.config.AUTH_ENABLED)
      throw new ServiceUnavailableException();
    return { status: 'ready' };
  }
}
