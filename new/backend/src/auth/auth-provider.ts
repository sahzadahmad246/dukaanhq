import {
  Inject,
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { z } from 'zod';
import { AppConfig, CONFIG } from '../config/config.module';
import { AuthSession, ProviderUser } from './auth.types';

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const userSchema = z.object({
  id: z.string().uuid(),
  email: nullableString,
  phone: nullableString,
  phone_confirmed_at: nullableString,
  new_phone: nullableString,
});
const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.literal('bearer'),
  expires_in: z.number().int().positive(),
  expires_at: z.number().int().positive().optional(),
  user: userSchema,
});

export class ProviderFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super('Identity provider request failed');
  }
}

@Injectable()
export class AuthProvider {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  private async request(
    path: string,
    method: string,
    body?: unknown,
    accessToken?: string,
  ): Promise<unknown> {
    if (!this.config.AUTH_ENABLED)
      throw new ServiceUnavailableException({ code: 'AUTH_NOT_CONFIGURED' });
    try {
      const response = await fetch(
        `${this.config.SUPABASE_URL}/auth/v1${path}`,
        {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(this.config.AUTH_TIMEOUT_MS),
          headers: {
            apikey: this.config.SUPABASE_PUBLISHABLE_KEY!,
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      const data: unknown =
        response.status === 204 ? {} : await response.json();
      if (!response.ok) {
        const parsed = z
          .object({
            error_code: z.string().optional(),
            code: z.string().optional(),
          })
          .safeParse(data);
        throw new ProviderFailure(
          response.status,
          parsed.success
            ? (parsed.data.error_code ?? parsed.data.code ?? 'unknown')
            : 'unknown',
        );
      }
      return data;
    } catch (error) {
      if (error instanceof ProviderFailure || error instanceof HttpException)
        throw error;
      throw new ServiceUnavailableException({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
      });
    }
  }

  async requestOtp(phone: string, captchaToken?: string): Promise<void> {
    try {
      await this.request('/otp', 'POST', {
        phone,
        channel: 'sms',
        create_user: true,
        ...(captchaToken
          ? { gotrue_meta_security: { captcha_token: captchaToken } }
          : {}),
      });
    } catch (error) {
      if (
        error instanceof ProviderFailure &&
        ['user_already_exists', 'phone_exists', 'signup_disabled'].includes(
          error.code,
        )
      )
        return;
      this.fail(error, 'request');
    }
  }

  async verifyOtp(
    phone: string,
    token: string,
    type: 'sms' | 'phone_change' = 'sms',
  ) {
    let raw: unknown;
    try {
      raw = await this.request('/verify', 'POST', { phone, token, type });
    } catch (error) {
      this.fail(error, 'verify');
    }
    const parsed = sessionSchema.safeParse(raw);
    if (!parsed.success)
      throw new ServiceUnavailableException({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
      });
    const { user, ...session } = parsed.data;
    return {
      user,
      session: {
        ...session,
        expires_at:
          session.expires_at ??
          Math.floor(Date.now() / 1000) + session.expires_in,
      } satisfies AuthSession,
    };
  }

  async refresh(refreshToken: string) {
    let raw: unknown;
    // No automatic replay: Supabase controls refresh rotation/reuse semantics.
    try {
      raw = await this.request('/token?grant_type=refresh_token', 'POST', {
        refresh_token: refreshToken,
      });
    } catch (error) {
      this.fail(error, 'session');
    }
    const parsed = sessionSchema.safeParse(raw);
    if (!parsed.success)
      throw new ServiceUnavailableException({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
      });
    const { user, ...session } = parsed.data;
    return {
      user,
      session: {
        ...session,
        expires_at:
          session.expires_at ??
          Math.floor(Date.now() / 1000) + session.expires_in,
      } satisfies AuthSession,
    };
  }

  async getUser(accessToken: string): Promise<ProviderUser> {
    let raw: unknown;
    try {
      raw = await this.request('/user', 'GET', undefined, accessToken);
    } catch (error) {
      this.fail(error, 'session');
    }
    const parsed = userSchema.safeParse(raw);
    if (!parsed.success)
      throw new ServiceUnavailableException({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
      });
    return parsed.data;
  }

  async requestPhoneLink(
    accessToken: string,
    phone: string,
    captchaToken?: string,
  ): Promise<void> {
    try {
      await this.request(
        '/user',
        'PUT',
        {
          phone,
          channel: 'sms',
          ...(captchaToken
            ? { gotrue_meta_security: { captcha_token: captchaToken } }
            : {}),
        },
        accessToken,
      );
    } catch (error) {
      // Do not disclose another account's existence through the linking request.
      if (
        error instanceof ProviderFailure &&
        ['phone_exists', 'user_already_exists'].includes(error.code)
      )
        return;
      this.fail(error, 'request');
    }
  }

  async updateName(accessToken: string, name: string) {
    try {
      await this.request(
        '/user',
        'PUT',
        { data: { full_name: name, name } },
        accessToken,
      );
    } catch (error) {
      this.fail(error, 'session');
    }
  }

  async logout(accessToken: string): Promise<void> {
    try {
      await this.request('/logout?scope=local', 'POST', undefined, accessToken);
    } catch (error) {
      // Repeated logout of an already-ended session is idempotent.
      if (
        error instanceof ProviderFailure &&
        [401, 403, 404].includes(error.status)
      )
        return;
      this.fail(error, 'session');
    }
  }

  private fail(
    error: unknown,
    operation: 'request' | 'verify' | 'session',
  ): never {
    if (error instanceof HttpException) throw error;
    if (error instanceof ProviderFailure) {
      if (error.status === 429)
        throw new HttpException(
          {
            code: 'OTP_RATE_LIMITED',
            retry_after: this.config.OTP_RESEND_SECONDS,
          },
          429,
        );
      if (operation === 'verify' && [400, 403, 422].includes(error.status))
        throw new BadRequestException({ code: 'OTP_INVALID_OR_EXPIRED' });
      if (
        operation === 'session' &&
        [400, 401, 403, 404, 422].includes(error.status)
      )
        throw new UnauthorizedException();
      if (error.code === 'captcha_failed')
        throw new BadRequestException({ code: 'CAPTCHA_REQUIRED' });
    }
    throw new ServiceUnavailableException({
      code: 'AUTH_PROVIDER_UNAVAILABLE',
    });
  }
}
