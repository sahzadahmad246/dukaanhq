import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class FieldError {
  @ApiProperty() field!: string;
  @ApiProperty({ type: [String] }) rules!: string[];
}
class ErrorDetails {
  @ApiProperty({ example: 'SERVICE_UNAVAILABLE' }) code!: string;
  @ApiProperty({ example: 'Service temporarily unavailable.' })
  message!: string;
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiPropertyOptional({ type: [FieldError] }) fields?: FieldError[];
}
export class ApiErrorResponse {
  @ApiProperty({ type: ErrorDetails }) error!: ErrorDetails;
}
