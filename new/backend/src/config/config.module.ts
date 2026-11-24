import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

const optionalUrl = (protocols: string[]) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .url()
      .refine((value) => protocols.includes(new URL(value).protocol))
      .optional(),
  );
const boolean = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .default(String(fallback) as 'true' | 'false')
    .transform((value) => value === 'true');
const integer = (fallback: number, max: number) =>
  z.coerce.number().int().positive().max(max).default(fallback);

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: integer(4000, 65535),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z
    .enum(['silent', 'error', 'warn', 'info', 'debug'])
    .default('info'),
  OPENAPI_ENABLED: z.enum(['true', 'false']).optional(),
  DATABASE_URL: optionalUrl(['postgres:', 'postgresql:']),
  DATABASE_SSL: boolean(true),
  DATABASE_POOL_MAX: integer(10, 50),
  DATABASE_CONNECT_TIMEOUT_MS: integer(3000, 10000),
  DATABASE_STATEMENT_TIMEOUT_MS: integer(3000, 30000),
  DATABASE_LOCK_TIMEOUT_MS: integer(1000, 10000),
  REDIS_URL: optionalUrl(['redis:', 'rediss:']),
  RATE_LIMIT_REQUESTS: integer(120, 10000),
  RATE_LIMIT_WINDOW_MS: integer(60000, 3600000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SLOW_REQUEST_MS: integer(500, 60000),
  AUTH_ENABLED: boolean(false),
  SUPABASE_URL: optionalUrl(['https:', 'http:']),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  AUTH_TIMEOUT_MS: integer(4000, 10000),
  OTP_LENGTH: z.coerce.number().int().min(6).max(10).default(6),
  OTP_EXPIRY_SECONDS: integer(300, 3600),
  OTP_RESEND_SECONDS: integer(60, 600),
  OTP_RATE_LIMIT_SECRET: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(32).optional(),
  ),
});

export function parseConfig(source: Record<string, unknown>) {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Only names are reported: URLs may contain database passwords.
    throw new Error(
      `Invalid configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  const env = result.data;
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? '';
  let serviceRole = key.startsWith('sb_secret_');
  if (key.split('.').length === 3) {
    try {
      serviceRole ||=
        JSON.parse(Buffer.from(key.split('.')[1]!, 'base64url').toString())
          .role === 'service_role';
    } catch {
      /* Provider validates malformed keys. */
    }
  }
  if (serviceRole)
    throw new Error(
      'Invalid configuration: SUPABASE_PUBLISHABLE_KEY must not be a secret/service-role key',
    );
  if (
    env.AUTH_ENABLED &&
    (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY?.trim())
  ) {
    throw new Error(
      'Invalid configuration: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY are required when AUTH_ENABLED=true',
    );
  }
  if (
    env.SUPABASE_URL &&
    new URL(env.SUPABASE_URL).origin !== env.SUPABASE_URL
  ) {
    throw new Error(
      'Invalid configuration: SUPABASE_URL must be the project origin',
    );
  }
  if (
    env.DATABASE_URL &&
    [...new URL(env.DATABASE_URL).searchParams.keys()].some((key) =>
      key.toLowerCase().startsWith('ssl'),
    )
  ) {
    throw new Error(
      'Invalid configuration: set database TLS with DATABASE_SSL, not URL SSL parameters',
    );
  }
  const origins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (
    origins.some((origin) => {
      try {
        return new URL(origin).origin !== origin || !/^https?:/.test(origin);
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      'Invalid configuration: CORS_ORIGINS must contain exact HTTP origins',
    );
  if (env.NODE_ENV === 'production') {
    const missing = ['DATABASE_URL', 'REDIS_URL'].filter(
      (key) => !env[key as 'DATABASE_URL' | 'REDIS_URL'],
    );
    if (
      !source.CORS_ORIGINS ||
      !origins.length ||
      origins.some((origin) => !origin.startsWith('https://'))
    )
      missing.push('CORS_ORIGINS');
    if (!env.DATABASE_SSL) missing.push('DATABASE_SSL');
    if (!env.AUTH_ENABLED) missing.push('AUTH_ENABLED');
    if (!env.OTP_RATE_LIMIT_SECRET) missing.push('OTP_RATE_LIMIT_SECRET');
    if (env.SUPABASE_URL && !env.SUPABASE_URL.startsWith('https://'))
      missing.push('SUPABASE_URL (HTTPS required)');
    if (env.OPENAPI_ENABLED === 'true')
      missing.push('OPENAPI_ENABLED (must be false in production)');
    if (missing.length)
      throw new Error(
        `Invalid production configuration: ${missing.join(', ')}`,
      );
  }
  return Object.freeze({
    ...env,
    origins: Object.freeze(origins),
    docsEnabled:
      env.OPENAPI_ENABLED === 'true' ||
      (env.OPENAPI_ENABLED === undefined && env.NODE_ENV !== 'production'),
  });
}

export type AppConfig = ReturnType<typeof parseConfig>;
export const CONFIG = Symbol('CONFIG');

@Global()
@Module({})
export class ConfigurationModule {
  static forRoot(config: AppConfig) {
    return {
      module: ConfigurationModule,
      providers: [{ provide: CONFIG, useValue: config }],
      exports: [CONFIG],
    };
  }
}
