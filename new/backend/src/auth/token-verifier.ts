import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  errors,
  jwtVerify,
  JWTPayload,
} from 'jose';
import { z } from 'zod';
import { AppConfig, CONFIG } from '../config/config.module';
import { AuthProvider } from './auth-provider';
import { VerifiedIdentity } from './auth.types';

const uuid = z.string().uuid();
export function identityFromClaims(
  claims: JWTPayload,
  issuer: string,
): VerifiedIdentity {
  const now = Math.floor(Date.now() / 1000);
  if (
    !uuid.safeParse(claims.sub).success ||
    !uuid.safeParse(claims.session_id).success ||
    claims.role !== 'authenticated' ||
    claims.iss !== issuer ||
    !(
      claims.aud === 'authenticated' ||
      (Array.isArray(claims.aud) && claims.aud.includes('authenticated'))
    ) ||
    typeof claims.exp !== 'number' ||
    claims.exp <= now ||
    typeof claims.iat !== 'number' ||
    claims.iat > now + 5 ||
    (typeof claims.nbf === 'number' && claims.nbf > now + 5)
  )
    throw new UnauthorizedException();
  return Object.freeze({
    userId: claims.sub!,
    sessionId: claims.session_id as string,
    expiresAt: claims.exp,
    email:
      typeof claims.email === 'string' && claims.email ? claims.email : null,
    phone:
      typeof claims.phone === 'string' && claims.phone
        ? `+${claims.phone.replace(/^\+/, '')}`
        : null,
  });
}

@Injectable()
export class TokenVerifier {
  private readonly issuer: string;
  private readonly keys?: ReturnType<typeof createRemoteJWKSet>;
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly provider: AuthProvider,
  ) {
    this.issuer = `${config.SUPABASE_URL}/auth/v1`;
    if (config.AUTH_ENABLED)
      this.keys = createRemoteJWKSet(
        new URL(`${this.issuer}/.well-known/jwks.json`),
        {
          timeoutDuration: config.AUTH_TIMEOUT_MS,
          cacheMaxAge: 600000,
          cooldownDuration: 30000,
        },
      );
  }
  async verify(token: string): Promise<VerifiedIdentity> {
    if (!this.config.AUTH_ENABLED || !this.keys)
      throw new ServiceUnavailableException({ code: 'AUTH_NOT_CONFIGURED' });
    if (token.length > 8192) throw new UnauthorizedException();
    try {
      let header: ReturnType<typeof decodeProtectedHeader>;
      try {
        header = decodeProtectedHeader(token);
      } catch {
        throw new UnauthorizedException();
      }
      if (header.alg === 'HS256') {
        // A legacy symmetric token is verified online by Supabase, never by
        // decoding it or importing a service-role/JWT signing secret.
        const user = await this.provider.getUser(token);
        const identity = identityFromClaims(decodeJwt(token), this.issuer);
        if (user.id !== identity.userId) throw new UnauthorizedException();
        return identity;
      }
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'session_id', 'role'],
        clockTolerance: 5,
      });
      return identityFromClaims(payload, this.issuer);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      if (
        error instanceof errors.JOSEError &&
        [
          'ERR_JWT_EXPIRED',
          'ERR_JWT_CLAIM_VALIDATION_FAILED',
          'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
          'ERR_JWS_INVALID',
          'ERR_JWT_INVALID',
          'ERR_JOSE_ALG_NOT_ALLOWED',
          'ERR_JWKS_NO_MATCHING_KEY',
        ].includes(error.code)
      )
        throw new UnauthorizedException();
      throw new ServiceUnavailableException({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
      });
    }
  }
}
