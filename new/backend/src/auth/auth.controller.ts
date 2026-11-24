import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiAcceptedResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/public.decorator';
import { ApiErrorResponse } from '../common/api-error.dto';
import { AuthService } from './auth.service';
import { AuthRequest } from './auth.types';
import {
  IntentDto,
  OtpRequestDto,
  OtpVerifyDto,
  ProfileDto,
  RefreshDto,
} from './auth.dto';
import {
  AccountBootstrapResponse,
  AuthSessionResponse,
  OtpAcceptedResponse,
  RefreshedSessionResponse,
} from './auth-response.dto';

@ApiTags('Authentication')
@ApiBadRequestResponse({ type: ApiErrorResponse })
@ApiUnauthorizedResponse({ type: ApiErrorResponse })
@ApiForbiddenResponse({ type: ApiErrorResponse })
@ApiConflictResponse({ type: ApiErrorResponse })
@ApiTooManyRequestsResponse({ type: ApiErrorResponse })
@ApiServiceUnavailableResponse({ type: ApiErrorResponse })
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(202)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Request SMS OTP; same response for new and existing accounts.',
  })
  @ApiAcceptedResponse({ type: OtpAcceptedResponse })
  request(@Body() body: OtpRequestDto, @Req() request: AuthRequest) {
    return this.service.requestOtp(body.phone, request.ip, body.captcha_token);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 600000 } })
  @ApiOperation({
    summary: 'Verify SMS ownership and return tokens plus account next action.',
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  verify(@Body() body: OtpVerifyDto, @Req() request: AuthRequest) {
    return this.service.verifyOtp(body.phone, body.token, request.ip);
  }

  @Public()
  @Post('session/refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Rotate credentials without a database/bootstrap read; no automatic token replay.',
  })
  @ApiOkResponse({ type: RefreshedSessionResponse })
  refresh(@Body() body: RefreshDto) {
    return this.service.refresh(body.refresh_token);
  }

  @ApiBearerAuth()
  @Post('session/logout')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Revoke this provider refresh session, preserving other devices.',
  })
  @ApiNoContentResponse()
  async logout(@Req() request: AuthRequest) {
    await this.service.logout(request.accessToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: AccountBootstrapResponse })
  me(@Req() request: AuthRequest) {
    return this.service.me(request.identity);
  }

  @ApiBearerAuth()
  @Patch('profile')
  @ApiOperation({
    summary:
      'Update the permitted name field; cannot change role or membership.',
  })
  @ApiOkResponse({ type: AccountBootstrapResponse })
  profile(@Body() body: ProfileDto, @Req() request: AuthRequest) {
    return this.service.updateProfile(
      request.identity,
      request.accessToken,
      body.full_name,
    );
  }

  @ApiBearerAuth()
  @Patch('intent')
  @ApiOperation({
    summary: 'Record owner/staff onboarding intent without granting a role.',
  })
  @ApiOkResponse({ type: AccountBootstrapResponse })
  intent(@Body() body: IntentDto, @Req() request: AuthRequest) {
    return this.service.updateIntent(request.identity, body.intent);
  }

  @ApiBearerAuth()
  @Post('phone/link/request')
  @HttpCode(202)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Request initial phone linking for an existing authenticated account.',
  })
  @ApiAcceptedResponse({ type: OtpAcceptedResponse })
  linkRequest(@Body() body: OtpRequestDto, @Req() request: AuthRequest) {
    return this.service.requestPhoneLink(
      request.identity,
      request.accessToken,
      body.phone,
      request.ip,
      body.captcha_token,
    );
  }

  @ApiBearerAuth()
  @Post('phone/link/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 600000 } })
  @ApiOperation({
    summary:
      'Verify this session’s pending phone while preserving the original user UUID.',
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  linkVerify(@Body() body: OtpVerifyDto, @Req() request: AuthRequest) {
    return this.service.verifyPhoneLink(
      request.identity,
      request.accessToken,
      body.phone,
      body.token,
      request.ip,
    );
  }
}
