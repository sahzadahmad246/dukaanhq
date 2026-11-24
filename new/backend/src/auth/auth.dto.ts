import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PhoneDto {
  @ApiProperty({
    example: '+919876543210',
    description:
      'Valid international E.164 phone, including country calling code.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/)
  @IsPhoneNumber()
  phone!: string;
}
export class OtpRequestDto extends PhoneDto {
  @ApiPropertyOptional({
    description: 'Supabase-configured CAPTCHA response token.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 4096)
  captcha_token?: string;
}
export class OtpVerifyDto extends PhoneDto {
  @ApiProperty({
    example: '123456',
    description: 'Digits only; length must match the configured provider.',
  })
  @IsString()
  @Matches(/^\d{6,10}$/)
  token!: string;
}
export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(1, 4096)
  @Matches(/^\S+$/)
  refresh_token!: string;
}
export class ProfileDto {
  @ApiProperty({ example: 'Shop owner', maxLength: 80 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 80)
  @Matches(/^[^\p{Cc}]+$/u)
  full_name!: string;
}
export class IntentDto {
  @ApiProperty({ enum: ['owner', 'staff'] })
  @IsIn(['owner', 'staff'])
  @MaxLength(5)
  intent!: 'owner' | 'staff';
}
