import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../common/public.decorator';
import { TokenVerifier } from './token-verifier';
import { AuthRequest } from './auth.types';
import { AuthProvider } from './auth-provider';
import { OtpLimiter } from './otp-limiter';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AccountsModule } from '../accounts/accounts.module';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers.authorization;
    if (
      !header ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(header)
    )
      throw new UnauthorizedException();
    const token = header.slice(7);
    request.identity = await this.verifier.verify(token);
    request.accessToken = token;
    return true;
  }
}

@Module({
  imports: [AccountsModule],
  controllers: [AuthController],
  providers: [
    AuthProvider,
    TokenVerifier,
    OtpLimiter,
    AuthService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
  ],
})
export class AuthModule {}
