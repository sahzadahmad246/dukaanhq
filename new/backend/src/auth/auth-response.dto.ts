import { ApiProperty } from '@nestjs/swagger';

export class OtpAcceptedResponse {
  @ApiProperty({ example: true }) accepted!: boolean;
  @ApiProperty({ example: 60 }) retry_after_seconds!: number;
  @ApiProperty({ example: 6 }) otp_length!: number;
  @ApiProperty({ example: 300 }) expires_in_seconds!: number;
}
class AccountResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) full_name!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty() role!: string;
  @ApiProperty({ type: String, enum: ['owner', 'staff'], nullable: true })
  onboarding_intent!: string | null;
}
class MembershipResponse {
  @ApiProperty({ format: 'uuid' }) shop_id!: string;
  @ApiProperty() shop_slug!: string;
  @ApiProperty({ enum: ['owner', 'staff'] }) role!: string;
  @ApiProperty() status!: string;
  @ApiProperty() shop_status!: string;
  @ApiProperty() onboarding_completed!: boolean;
}
class AccessResponse {
  @ApiProperty() workspace!: boolean;
  @ApiProperty() can_manage_staff!: boolean;
  @ApiProperty() can_manage_subscription!: boolean;
  @ApiProperty() can_onboard_shop!: boolean;
  @ApiProperty() platform_admin!: boolean;
}
export class AccountBootstrapResponse {
  @ApiProperty({ type: AccountResponse }) account!: AccountResponse;
  @ApiProperty({ type: MembershipResponse, nullable: true })
  membership!: MembershipResponse | null;
  @ApiProperty({ type: AccessResponse }) access!: AccessResponse;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  approved_intent_id!: string | null;
  @ApiProperty({
    enum: [
      'complete_profile',
      'choose_role',
      'select_plan',
      'shop_onboarding',
      'workspace',
      'account_suspended',
      'manage_subscription',
      'join_staff',
      'platform_admin',
    ],
  })
  next_action!: string;
  @ApiProperty({ type: [String], example: ['owner', 'staff'] })
  permitted_choices!: string[];
}
class SessionResponse {
  @ApiProperty() access_token!: string;
  @ApiProperty() refresh_token!: string;
  @ApiProperty({ enum: ['bearer'] }) token_type!: string;
  @ApiProperty() expires_in!: number;
  @ApiProperty({ description: 'Unix timestamp in seconds.' })
  expires_at!: number;
}
export class AuthSessionResponse extends AccountBootstrapResponse {
  @ApiProperty({ type: SessionResponse }) session!: SessionResponse;
}
export class RefreshedSessionResponse {
  @ApiProperty({ type: SessionResponse }) session!: SessionResponse;
}
