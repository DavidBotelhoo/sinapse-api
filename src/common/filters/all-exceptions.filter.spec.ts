import {
  BadRequestException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from '../errors/app.exception';
import { mapException } from './all-exceptions.filter';

describe('mapException', () => {
  it('AppException passa como esta (codigo, mensagem e campos)', () => {
    const err = new AppException({
      code: 'DECK_NOT_FOUND',
      message: 'Deck não encontrado.',
      status: HttpStatus.NOT_FOUND,
    });
    expect(mapException(err)).toEqual({
      status: 404,
      body: { code: 'DECK_NOT_FOUND', message: 'Deck não encontrado.' },
    });

    const withFields = new AppException({
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      fields: { email: 'Email inválido.' },
    });
    expect(mapException(withFields).body.fields).toEqual({ email: 'Email inválido.' });
  });

  it('id invalido do ParseUUIDPipe puro sai em portugues', async () => {
    const err = await new ParseUUIDPipe({ version: '4' })
      .transform('nao-e-uuid', { type: 'param', data: 'id' })
      .catch((e: unknown) => e);
    expect(mapException(err)).toEqual({
      status: 400,
      body: { code: 'BAD_REQUEST', message: 'Requisição inválida.' },
    });
  });

  it.each([
    [
      new PayloadTooLargeException('File too large'),
      413,
      'PAYLOAD_TOO_LARGE',
      'Conteúdo grande demais.',
    ],
    [
      new ThrottlerException(),
      429,
      'TOO_MANY_REQUESTS',
      'Muitas requisições. Tente de novo em instantes.',
    ],
    [
      new NotFoundException('Cannot GET /v1/nao-existe'),
      404,
      'NOT_FOUND',
      'Recurso não encontrado.',
    ],
    [
      new BadRequestException('Unexpected token } in JSON'),
      400,
      'BAD_REQUEST',
      'Requisição inválida.',
    ],
  ])(
    'mensagem em ingles do Nest/bibliotecas vira a do status (%#)',
    (err, status, code, message) => {
      expect(mapException(err)).toEqual({ status, body: { code, message } });
    },
  );

  it('erro que nao e HTTP vira 500 sem detalhes', () => {
    expect(mapException(new Error('senha do banco: xyz'))).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: 'Erro inesperado.' },
    });
  });
});
