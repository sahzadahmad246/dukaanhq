import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';

function fields(
  errors: ValidationError[],
  prefix = '',
): { field: string; rules: string[] }[] {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;
    return [
      ...(error.constraints
        ? [{ field, rules: Object.keys(error.constraints) }]
        : []),
      ...fields(error.children ?? [], field),
    ];
  });
}

export function validationPipe() {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        fields: fields(errors),
      }),
  });
}
