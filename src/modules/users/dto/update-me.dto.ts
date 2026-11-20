import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsTimeZone, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ThemePreference } from '../../../generated/prisma/enums';

export class UpdateMeDto {
  @ApiProperty({ required: false, example: 'Davi' })
  @IsOptional()
  @IsString({ message: 'Informe seu nome.' })
  @MinLength(1, { message: 'Informe seu nome.' })
  @MaxLength(80, { message: 'Use no maximo 80 caracteres.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  firstName?: string;

  @ApiProperty({ required: false, example: 'Botelho' })
  @IsOptional()
  @IsString({ message: 'Informe seu sobrenome.' })
  @MinLength(1, { message: 'Informe seu sobrenome.' })
  @MaxLength(120, { message: 'Use no maximo 120 caracteres.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @ApiProperty({ required: false, enum: ThemePreference, example: ThemePreference.DARK })
  @IsOptional()
  @IsEnum(ThemePreference, { message: 'Tema invalido.' })
  theme?: ThemePreference;

  @ApiProperty({ required: false, example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString({ message: 'Fuso horario invalido.' })
  @MinLength(1, { message: 'Fuso horario invalido.' })
  @MaxLength(64, { message: 'Fuso horario invalido.' })
  @IsTimeZone({ message: 'Fuso horario invalido.' })
  timezone?: string;
}
