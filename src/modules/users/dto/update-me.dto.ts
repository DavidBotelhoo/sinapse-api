import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsTimeZone, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ThemePreference } from '../../../generated/prisma/enums';

export class UpdateMeDto {
  @ApiProperty({ required: false, example: 'Davi' })
  @IsOptional()
  @IsString({ message: 'Informe seu nome.' })
  @MinLength(1, { message: 'Informe seu nome.' })
  @MaxLength(80, { message: 'Use no máximo 80 caracteres.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  firstName?: string;

  @ApiProperty({ required: false, example: 'Botelho' })
  @IsOptional()
  @IsString({ message: 'Informe seu sobrenome.' })
  @MinLength(1, { message: 'Informe seu sobrenome.' })
  @MaxLength(120, { message: 'Use no máximo 120 caracteres.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  lastName?: string;

  @ApiProperty({ required: false, enum: ThemePreference, example: ThemePreference.DARK })
  @IsOptional()
  @IsEnum(ThemePreference, { message: 'Tema inválido.' })
  theme?: ThemePreference;

  @ApiProperty({ required: false, example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString({ message: 'Fuso horário inválido.' })
  @MinLength(1, { message: 'Fuso horário inválido.' })
  @MaxLength(64, { message: 'Fuso horário inválido.' })
  @IsTimeZone({ message: 'Fuso horário inválido.' })
  timezone?: string;
}
