import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'token-opaco-recebido-por-email' })
  @IsString({ message: 'Token inválido.' })
  @MinLength(1, { message: 'Token inválido.' })
  @MaxLength(256, { message: 'Token inválido.' })
  token!: string;

  @ApiProperty({ example: 'uma-nova-senha' })
  @IsString({ message: 'Informe a nova senha.' })
  @MinLength(8, { message: 'Use pelo menos 8 caracteres.' })
  @MaxLength(100, { message: 'Senha longa demais.' })
  password!: string;
}
