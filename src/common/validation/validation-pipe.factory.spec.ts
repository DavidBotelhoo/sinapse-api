import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { AppException } from '../errors/app.exception';
import { createValidationPipe, messageFor } from './validation-pipe.factory';

class SemMensagensDto {
  @IsString()
  @MaxLength(5)
  nome!: string;

  @IsOptional()
  @IsInt()
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  ids?: string[];
}

class ComMensagemDto {
  @IsString({ message: 'Informe um nome.' })
  nome!: string;
}

async function fieldsFor(
  metatype: new () => object,
  value: unknown,
): Promise<Record<string, string>> {
  const pipe = createValidationPipe();
  try {
    await pipe.transform(value, { type: 'body', metatype });
  } catch (err) {
    const body = (err as AppException).getResponse() as {
      error: { fields: Record<string, string> };
    };
    return body.error.fields;
  }
  throw new Error('esperava erro de validacao');
}

describe('ValidationPipe: mensagens em portugues', () => {
  it('regras sem message no DTO usam a mensagem em portugues, com o limite', async () => {
    expect(await fieldsFor(SemMensagensDto, { nome: 'longo demais' })).toEqual({
      nome: 'Use no máximo 5 caracteres.',
    });
    expect(await fieldsFor(SemMensagensDto, { nome: 'ok', limit: 500 })).toEqual({
      limit: 'Use um valor de no máximo 200.',
    });
    expect(await fieldsFor(SemMensagensDto, { nome: 'ok', ids: ['a', 'b', 'c'] })).toEqual({
      ids: 'Escolha no máximo 2.',
    });
    expect(await fieldsFor(SemMensagensDto, { nome: 'ok', limit: 1.5 })).toEqual({
      limit: 'Use um número inteiro.',
    });
  });

  it('campo que nao existe no DTO', async () => {
    expect(await fieldsFor(SemMensagensDto, { nome: 'ok', extra: true })).toEqual({
      extra: 'Campo não permitido.',
    });
  });

  it('mensagem escrita no DTO e mantida', async () => {
    expect(await fieldsFor(ComMensagemDto, {})).toEqual({ nome: 'Informe um nome.' });
  });

  it('messageFor: so troca a mensagem padrao da biblioteca', () => {
    expect(messageFor('isUuid', 'deckIds must be a UUID', 'deckIds')).toBe(
      'Identificador inválido.',
    );
    expect(messageFor('min', 'each value in year must not be less than 1', 'year')).toBe(
      'Use um valor a partir de 1.',
    );
    expect(messageFor('regraNova', 'x must be something', 'x')).toBe('Valor inválido.');
    expect(messageFor('isEnum', 'Escolha um motivo.', 'reason')).toBe('Escolha um motivo.');
  });
});
