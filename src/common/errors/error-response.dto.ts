import { ApiProperty } from '@nestjs/swagger';

export class ErrorBodyDto {
  @ApiProperty({ example: 'NOT_FOUND', description: 'Codigo em MAIUSCULAS_COM_UNDERLINE.' })
  code!: string;

  @ApiProperty({ example: 'Recurso nao encontrado.', description: 'Mensagem em pt-BR.' })
  message!: string;

  @ApiProperty({
    required: false,
    additionalProperties: { type: 'string' },
    example: { email: 'Email inválido.' },
  })
  fields?: Record<string, string>;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
