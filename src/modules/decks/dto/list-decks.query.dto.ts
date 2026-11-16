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

export enum DeckScope {
  ALL = 'all',
  MINE = 'mine',
  COMMUNITY = 'community',
  FAVORITES = 'favorites',
}

function toArray<T>(value: unknown, map: (v: unknown) => T | null): T[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const mapped: T[] = [];
  for (const v of raw) {
    const m = map(v);
    if (m !== null) mapped.push(m);
  }
  return mapped;
}

export class ListDecksQueryDto {
  @ApiPropertyOptional({ enum: DeckScope, default: DeckScope.ALL })
  @IsOptional()
  @IsEnum(DeckScope, { message: 'Escopo invalido.' })
  scope: DeckScope = DeckScope.ALL;

  @ApiPropertyOptional({ type: [Number], example: [1, 2] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true, message: 'Ano invalido.' })
  @Min(1, { each: true })
  @Max(12, { each: true })
  @Transform(({ value }: { value: unknown }) =>
    toArray(value, (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }),
  )
  year?: number[];

  @ApiPropertyOptional({ type: [String], example: ['uuid'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Materia invalida.' })
  @Transform(({ value }: { value: unknown }) =>
    toArray(value, (v) => (typeof v === 'string' && v.length > 0 ? v : null)),
  )
  subjectIds?: string[];

  @ApiPropertyOptional({ example: 'cardio' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
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
