import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { RateLimitStorage } from '../src/security/rate-limit.module';
import { parseConfig } from '../src/config/config.module';
import { OtpLimiter } from '../src/auth/otp-limiter';

const url = process.env.TEST_REDIS_URL;
test(
  'OTP limits and phone-link challenges are shared across API instances and client IPs',
  { skip: !url },
  async () => {
    const config = parseConfig({ NODE_ENV: 'test', REDIS_URL: url });
    const first = new RateLimitStorage(config);
    const second = new RateLimitStorage(config);
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        if ((await first.isReady()) && (await second.isReady())) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const one = new OtpLimiter(config, first);
      const two = new OtpLimiter(config, second);
      const phone = randomUUID();
      await one.request(phone, '127.0.0.1');
      await assert.rejects(
        two.request(phone, '127.0.0.2'),
        (error: { getStatus: () => number }) => error.getStatus() === 429,
      );
      for (let n = 0; n < 5; n++)
        await (n % 2 ? one : two).verify(phone, `127.0.0.${n + 1}`);
      await assert.rejects(one.verify(phone, '127.0.0.9'));
      const key = one.key('link-test', randomUUID());
      assert.ok(!key.includes(phone));
      await first.saveChallenge(key, 'hashed-phone', 1);
      assert.equal(await second.readChallenge(key), 'hashed-phone');
      await new Promise((resolve) => setTimeout(resolve, 1100));
      assert.equal(await second.readChallenge(key), null);
    } finally {
      first.onApplicationShutdown();
      second.onApplicationShutdown();
    }
  },
);
test(
  'two independent API stores share an atomic Redis limit',
  { skip: !url },
  async () => {
    const config = parseConfig({ NODE_ENV: 'test', REDIS_URL: url });
    const first = new RateLimitStorage(config);
    const second = new RateLimitStorage(config);
    try {
      // ioredis connects asynchronously; readiness must be reached before use.
      for (let attempt = 0; attempt < 30; attempt++) {
        if ((await first.isReady()) && (await second.isReady())) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(await first.isReady(), true);
      assert.equal(await second.isReady(), true);
      const key = `phase1-test-${randomUUID()}`;
      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          (index % 2 ? first : second).increment(key, 200, 5, 200, 'default'),
        ),
      );
      assert.equal(
        responses.filter((response) => !response.isBlocked).length,
        5,
      );
      assert.equal(
        Math.max(...responses.map((response) => response.totalHits)),
        20,
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(
        (await second.increment(key, 200, 5, 200, 'default')).isBlocked,
        false,
      );
    } finally {
      first.onApplicationShutdown();
      second.onApplicationShutdown();
    }
  },
);
