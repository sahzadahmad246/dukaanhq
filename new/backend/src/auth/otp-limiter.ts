import { createHmac } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { AppConfig, CONFIG } from '../config/config.module';
import { RateLimitStorage } from '../security/rate-limit.module';

@Injectable()
export class OtpLimiter {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly storage: RateLimitStorage,
  ) {}
  key(purpose: string, value: string) {
    return `auth:${purpose}:${createHmac(
      'sha256',
      this.config.OTP_RATE_LIMIT_SECRET ??
        'dukaanhq-local-development-only-key',
    )
      .update(value)
      .digest('hex')}`;
  }
  async request(phone: string, ip: string) {
    await this.limit('send-ip-hour', ip, 20, 3600000);
    await this.limit('send-ip-day', ip, 100, 86400000);
    await this.limit('send-phone-day', phone, 10, 86400000);
    await this.limit(
      'send-phone-resend',
      phone,
      1,
      this.config.OTP_RESEND_SECONDS * 1000,
    );
  }
  async verify(phone: string, ip: string) {
    await this.limit('verify-ip-window', ip, 60, 600000);
    await this.limit('verify-ip-day', ip, 500, 86400000);
    await this.limit('verify-phone-window', phone, 5, 600000);
    await this.limit('verify-phone-day', phone, 20, 86400000);
  }
  private async limit(
    purpose: string,
    value: string,
    limit: number,
    ttl: number,
  ) {
    const result = await this.storage.increment(
      this.key(purpose, value),
      ttl,
      limit,
      ttl,
      'otp',
    );
    if (result.isBlocked)
      throw new HttpException(
        {
          code: 'OTP_RATE_LIMITED',
          retry_after: Math.max(1, result.timeToBlockExpire),
        },
        429,
      );
  }
}
