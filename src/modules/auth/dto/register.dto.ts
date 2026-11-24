import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @ApiProperty({ example: 'Davi' })
  @IsString({ message: 'Informe seu nome.' })
  @MinLength(1, { message: 'Informe seu nome.' })
  @MaxLength(80, { message: 'Use no máximo 80 caracteres.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  firstName!: string;

  @ApiProperty({ example: 'Botelho' })
  @IsString({ message: 'Informe seu sobrenome.' })
  @MinLength(1, { message: 'Informe seu sobrenome.' })
  @MaxLength(120, { message: 'Use no máximo 120 caracteres.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  lastName!: string;

  @ApiProperty({ example: 'davi@example.com' })
  @IsEmail({}, { message: 'Email inválido.' })
  @MaxLength(254, { message: 'Email longo demais.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({ example: 'uma-senha-forte' })
  @IsString({ message: 'Informe uma senha.' })
  @MinLength(8, { message: 'Use pelo menos 8 caracteres.' })
  @MaxLength(100, { message: 'Senha longa demais.' })
  password!: string;
}
