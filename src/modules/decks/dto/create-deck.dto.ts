import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DeckVisibility } from '../../../generated/prisma/enums';

export class CreateDeckDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Importacao invalida.' })
  importId!: string;

  @ApiProperty({ example: 'Cardio — Insuficiencia cardiaca' })
  @IsString({ message: 'Informe um nome.' })
  @MinLength(1, { message: 'Informe um nome.' })
  @MaxLength(120, { message: 'Use no maximo 120 caracteres.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiProperty({ example: 3 })
  @IsInt({ message: 'Ano invalido.' })
  @Min(1, { message: 'Ano invalido.' })
  @Max(12, { message: 'Ano invalido.' })
  year!: number;

  @ApiProperty({ type: [String] })
  @IsArray({ message: 'Escolha ao menos uma materia.' })
  @ArrayMinSize(1, { message: 'Escolha ao menos uma materia.' })
  @ArrayMaxSize(10, { message: 'Muitas materias.' })
  @IsUUID('4', { each: true, message: 'Materia invalida.' })
  subjectIds!: string[];

  @ApiProperty({ enum: DeckVisibility, default: DeckVisibility.PRIVATE })
  @IsEnum(DeckVisibility, { message: 'Visibilidade invalida.' })
  visibility: DeckVisibility = DeckVisibility.PRIVATE;
}
