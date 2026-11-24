import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { AppConfig, CONFIG } from '../config/config.module';
import { RateLimitStorage } from '../security/rate-limit.module';
import { AuthProvider } from './auth-provider';
import { AuthSession, VerifiedIdentity } from './auth.types';
import { OtpLimiter } from './otp-limiter';
import { TokenVerifier } from './token-verifier';

@Injectable()
export class AuthService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly provider: AuthProvider,
    private readonly verifier: TokenVerifier,
    private readonly limiter: OtpLimiter,
    private readonly storage: RateLimitStorage,
    private readonly accounts: AccountsService,
  ) {}

  private accepted() {
    return {
      accepted: true,
      retry_after_seconds: this.config.OTP_RESEND_SECONDS,
      otp_length: this.config.OTP_LENGTH,
      expires_in_seconds: this.config.OTP_EXPIRY_SECONDS,
    };
  }
  private validateCode(token: string) {
    if (token.length !== this.config.OTP_LENGTH)
      throw new BadRequestException({ code: 'OTP_INVALID_OR_EXPIRED' });
  }

  async requestOtp(phone: string, ip: string, captchaToken?: string) {
    await this.limiter.request(phone, ip);
    await this.provider.requestOtp(phone, captchaToken);
    return this.accepted();
  }
  async verifyOtp(phone: string, token: string, ip: string) {
    this.validateCode(token);
    await this.limiter.verify(phone, ip);
    const result = await this.provider.verifyOtp(phone, token);
    if (
      !result.user.phone_confirmed_at ||
      this.phone(result.user.phone) !== phone
    )
      throw new UnauthorizedException();
    return this.sessionResponse(result.session, result.user.id);
  }
  async refresh(refreshToken: string) {
    const result = await this.provider.refresh(refreshToken);
    const identity = await this.verifier.verify(result.session.access_token);
    if (identity.userId !== result.user.id) throw new UnauthorizedException();
    // Rotation must not depend on a database/bootstrap round trip. A successful
    // refresh returns credentials immediately; clients fetch /me when required.
    return { session: result.session };
  }
  private async sessionResponse(session: AuthSession, expectedUser: string) {
    const identity = await this.verifier.verify(session.access_token);
    if (identity.userId !== expectedUser) throw new UnauthorizedException();
    return { session, ...(await this.accounts.bootstrap(identity)) };
  }
  me(identity: VerifiedIdentity) {
    return this.accounts.bootstrap(identity);
  }
  async updateProfile(
    identity: VerifiedIdentity,
    accessToken: string,
    name: string,
  ) {
    // Preserve compatibility with the legacy web profile synchronizer. Repeating
    // this name-only operation after a DB failure is safe; it grants no role.
    await this.provider.updateName(accessToken, name);
    return this.accounts.bootstrap(identity, { full_name: name });
  }
  updateIntent(identity: VerifiedIdentity, intent: 'owner' | 'staff') {
    return this.accounts.bootstrap(identity, { intent });
  }
  logout(accessToken: string) {
    return this.provider.logout(accessToken);
  }

  async requestPhoneLink(
    identity: VerifiedIdentity,
    accessToken: string,
    phone: string,
    ip: string,
    captchaToken?: string,
  ) {
    await this.limiter.request(phone, ip);
    const user = await this.provider.getUser(accessToken);
    if (user.id !== identity.userId) throw new UnauthorizedException();
    // Initial linking only. Moving an already-verified phone requires a separate
    // recovery/change flow; never merge accounts by a shop contact number.
    if (user.phone_confirmed_at && user.phone)
      throw new BadRequestException({ code: 'PHONE_ALREADY_LINKED' });
    await this.provider.requestPhoneLink(accessToken, phone, captchaToken);
    await this.storage.saveChallenge(
      this.linkKey(identity),
      this.limiter.key('link-phone', phone),
      this.config.OTP_EXPIRY_SECONDS,
    );
    return this.accepted();
  }
  async verifyPhoneLink(
    identity: VerifiedIdentity,
    accessToken: string,
    phone: string,
    token: string,
    ip: string,
  ) {
    this.validateCode(token);
    await this.limiter.verify(phone, ip);
    const key = this.linkKey(identity);
    if (
      (await this.storage.readChallenge(key)) !==
      this.limiter.key('link-phone', phone)
    )
      throw new BadRequestException({ code: 'PHONE_LINK_INVALID_OR_EXPIRED' });
    const current = await this.provider.getUser(accessToken);
    if (
      current.id !== identity.userId ||
      this.phone(current.new_phone) !== phone
    )
      throw new BadRequestException({ code: 'PHONE_LINK_INVALID_OR_EXPIRED' });
    const result = await this.provider.verifyOtp(phone, token, 'phone_change');
    if (
      result.user.id !== identity.userId ||
      !result.user.phone_confirmed_at ||
      this.phone(result.user.phone) !== phone
    )
      throw new UnauthorizedException();
    await this.storage.deleteChallenge(key);
    return this.sessionResponse(result.session, identity.userId);
  }
  private linkKey(identity: VerifiedIdentity) {
    return this.limiter.key(
      'link-session',
      `${identity.userId}:${identity.sessionId}`,
    );
  }
  private phone(value?: string) {
    return value ? `+${value.replace(/^\+/, '')}` : null;
  }
}
