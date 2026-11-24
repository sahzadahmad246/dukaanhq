import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerStorage,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { AppConfig, CONFIG } from '../config/config.module';

@Injectable()
export class RateLimitStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly redis?: Redis;
  private readonly storage: ThrottlerStorage;

  constructor(@Inject(CONFIG) config: AppConfig) {
    if (config.REDIS_URL) {
      this.redis = new Redis(config.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        connectTimeout: 1000,
        commandTimeout: 1000,
        retryStrategy: (attempt) => Math.min(attempt * 1000, 10000),
      });
      this.redis.on('error', () => {
        /* Request errors are handled below without leaking Redis URLs. */
      });
      this.storage = new ThrottlerStorageRedisService(this.redis);
      void this.redis.connect().catch(() => undefined);
    } else {
      // Explicit single-process development fallback; production config requires Redis.
      this.storage = new ThrottlerStorageService();
    }
  }

  async increment(...args: Parameters<ThrottlerStorage['increment']>) {
    try {
      return await this.storage.increment(...args);
    } catch {
      throw new ServiceUnavailableException();
    } // Fail closed, never bypass throttling.
  }

  async isReady(): Promise<boolean> {
    if (!this.redis) return true;
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  private readonly challenges = new Map<
    string,
    { value: string; expires: number }
  >();

  async saveChallenge(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.set(key, value, 'EX', ttlSeconds);
        return;
      }
      const now = Date.now();
      for (const [stored, entry] of this.challenges)
        if (entry.expires <= now) this.challenges.delete(stored);
      if (this.challenges.size >= 10000 && !this.challenges.has(key))
        throw new Error('Development challenge store full');
      this.challenges.set(key, { value, expires: now + ttlSeconds * 1000 });
    } catch {
      throw new ServiceUnavailableException();
    }
  }

  async readChallenge(key: string): Promise<string | null> {
    try {
      if (this.redis) return await this.redis.get(key);
      const entry = this.challenges.get(key);
      if (!entry || entry.expires <= Date.now()) {
        this.challenges.delete(key);
        return null;
      }
      return entry.value;
    } catch {
      throw new ServiceUnavailableException();
    }
  }

  async deleteChallenge(key: string): Promise<void> {
    try {
      if (this.redis) await this.redis.del(key);
      else this.challenges.delete(key);
    } catch {
      throw new ServiceUnavailableException();
    }
  }

  onApplicationShutdown() {
    this.redis?.disconnect();
    this.challenges.clear();
    if (this.storage instanceof ThrottlerStorageService)
      this.storage.onApplicationShutdown();
  }
}

@Global()
@Module({ providers: [RateLimitStorage], exports: [RateLimitStorage] })
class StorageModule {}

@Module({
  imports: [
    StorageModule,
    ThrottlerModule.forRootAsync({
      inject: [CONFIG, RateLimitStorage],
      useFactory: (config: AppConfig, storage: RateLimitStorage) => ({
        storage,
        throttlers: [
          {
            name: 'default',
            ttl: config.RATE_LIMIT_WINDOW_MS,
            limit: config.RATE_LIMIT_REQUESTS,
          },
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
