import { HttpStatus, ValidationPipe } from '@nestjs/common';
import type { ValidationError, ValidationPipeOptions } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';

// Mensagens em português para as regras do class-validator que vieram sem `message` no DTO
// (o padrão da biblioteca é em inglês: "limit must not be greater than 200").
// {n} é o limite da regra, lido da mensagem original.
const PT_BR_BY_CONSTRAINT: Record<string, string> = {
  whitelistValidation: 'Campo não permitido.',
  isDefined: 'Campo obrigatório.',
  isNotEmpty: 'Campo obrigatório.',
  isString: 'Use um texto.',
  isInt: 'Use um número inteiro.',
  isNumber: 'Use um número.',
  isBoolean: 'Use verdadeiro ou falso.',
  isArray: 'Use uma lista.',
  isUuid: 'Identificador inválido.',
  isEnum: 'Valor inválido.',
  isIn: 'Valor inválido.',
  isEmail: 'Email inválido.',
  isTimeZone: 'Fuso horário inválido.',
  isDateString: 'Data inválida.',
  isIso8601: 'Data inválida.',
  matches: 'Formato inválido.',
  min: 'Use um valor a partir de {n}.',
  max: 'Use um valor de no máximo {n}.',
  minLength: 'Use pelo menos {n} caracteres.',
  maxLength: 'Use no máximo {n} caracteres.',
  arrayMinSize: 'Escolha pelo menos {n}.',
  arrayMaxSize: 'Escolha no máximo {n}.',
};

const FALLBACK_MESSAGE = 'Valor inválido.';

// As mensagens padrão do class-validator começam pelo nome do campo ("limit must ...",
// "each value in year must ...", "property foo should not exist"); as nossas, não.
function isLibraryDefault(message: string, property: string): boolean {
  return (
    message.startsWith(`${property} `) ||
    message.startsWith(`each value in ${property} `) ||
    message.startsWith(`property ${property} `) ||
    message.startsWith('nested property ')
  );
}

export function messageFor(constraint: string, message: string, property: string): string {
  if (!isLibraryDefault(message, property)) return message;
  const template = PT_BR_BY_CONSTRAINT[constraint] ?? FALLBACK_MESSAGE;
  if (!template.includes('{n}')) return template;
  const limit = /(-?\d+(?:\.\d+)?)(?!.*\d)/.exec(message)?.[1];
  return limit ? template.replace('{n}', limit) : FALLBACK_MESSAGE;
}

function flattenErrors(errors: ValidationError[], path: string[] = []): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const error of errors) {
    const property = error.property;
    const current = [...path, property];

    if (error.constraints) {
      const first = Object.entries(error.constraints)[0];
      if (first) {
        const [constraint, message] = first;
        fields[current.join('.')] = messageFor(constraint, message, property);
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
        message: 'Dados inválidos.',
        status: HttpStatus.BAD_REQUEST,
        fields: flattenErrors(errors),
      }),
  });
}
