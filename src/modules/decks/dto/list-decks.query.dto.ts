import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toIntArray, toStringArray, trimString } from '../../../common/validation/query-array';

export enum DeckScope {
  ALL = 'all',
  MINE = 'mine',
  COMMUNITY = 'community',
  FAVORITES = 'favorites',
}

export class ListDecksQueryDto {
  @ApiPropertyOptional({ enum: DeckScope, default: DeckScope.ALL })
  @IsOptional()
  @IsEnum(DeckScope, { message: 'Escopo inválido.' })
  scope: DeckScope = DeckScope.ALL;

  @ApiPropertyOptional({ type: [Number], example: [1, 2] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true, message: 'Ano inválido.' })
  @Min(1, { each: true })
  @Max(12, { each: true })
  @Transform(toIntArray)
  year?: number[];

  @ApiPropertyOptional({ type: [String], example: ['uuid'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Matéria inválida.' })
  @Transform(toStringArray)
  subjectIds?: string[];

  @ApiPropertyOptional({ example: 'cardio' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trimString)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }: { value: unknown }) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  })
  limit: number = 20;
}
