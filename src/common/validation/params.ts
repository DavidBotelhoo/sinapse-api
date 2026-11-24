import { HttpStatus, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';

function invalidField(field: string, message: string): AppException {
  return new AppException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Dados inválidos.',
    status: HttpStatus.BAD_REQUEST,
    fields: { [field]: message },
  });
}

// :id de rota (UUID v4). O ParseUUIDPipe puro responde em inglês
// ("Validation failed (uuid v 4 is expected)").
export function uuidParam(field = 'id'): ParseUUIDPipe {
  return new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () => invalidField(field, 'Identificador inválido.'),
  });
}

// Inteiro opcional na query (?limit=4).
export function optionalIntQuery(field: string): ParseIntPipe {
  return new ParseIntPipe({
    optional: true,
    exceptionFactory: () => invalidField(field, 'Use um número inteiro.'),
  });
}
