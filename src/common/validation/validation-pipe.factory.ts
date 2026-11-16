import { HttpStatus, ValidationPipe } from '@nestjs/common';
import type { ValidationError, ValidationPipeOptions } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';

function flattenErrors(errors: ValidationError[], path: string[] = []): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const error of errors) {
    const property = error.property;
    const current = [...path, property];

    if (error.constraints) {
      const firstMessage = Object.values(error.constraints)[0];
      if (firstMessage) {
        fields[current.join('.')] = firstMessage;
      }
    }

    if (error.children && error.children.length > 0) {
      Object.assign(fields, flattenErrors(error.children, current));
    }
  }

  return fields;
}

export function createValidationPipe(options: ValidationPipeOptions = {}): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    stopAtFirstError: true,
    ...options,
    exceptionFactory: (errors: ValidationError[]) =>
      new AppException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Dados invalidos.',
        status: HttpStatus.BAD_REQUEST,
        fields: flattenErrors(errors),
      }),
  });
}
