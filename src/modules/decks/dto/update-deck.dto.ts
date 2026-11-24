import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DeckVisibility } from '../../../generated/prisma/enums';

export class UpdateDeckDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Informe um nome.' })
  @MinLength(1, { message: 'Informe um nome.' })
  @MaxLength(120, { message: 'Use no máximo 120 caracteres.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt({ message: 'Ano inválido.' })
  @Min(1)
  @Max(12)
  year?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray({ message: 'Escolha ao menos uma matéria.' })
  @ArrayMinSize(1, { message: 'Escolha ao menos uma matéria.' })
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true, message: 'Matéria inválida.' })
  subjectIds?: string[];

  @ApiPropertyOptional({ enum: DeckVisibility })
  @IsOptional()
  @IsEnum(DeckVisibility, { message: 'Visibilidade inválida.' })
  visibility?: DeckVisibility;
}
