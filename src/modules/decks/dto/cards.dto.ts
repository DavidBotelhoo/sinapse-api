import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { CardStatus } from '../card-status.service';

export enum CardsFilter {
  ALL = 'all',
  DUE = 'due',
  NEW = 'new',
  MASTERED = 'mastered',
}

export class ListCardsQueryDto {
  @ApiPropertyOptional({ enum: CardsFilter, default: CardsFilter.ALL })
  @IsOptional()
  @IsEnum(CardsFilter, { message: 'Filtro invalido.' })
  status: CardsFilter = CardsFilter.ALL;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }: { value: unknown }) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  })
  limit: number = 50;
}

export class CardItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 1 }) position!: number;
  @ApiProperty() question!: string;
  @ApiProperty() answer!: string;
  @ApiProperty({ enum: ['NEW', 'DUE_TODAY', 'OVERDUE', 'SCHEDULED', 'MASTERED'] })
  status!: CardStatus;
  @ApiProperty({ nullable: true, description: 'So quando SCHEDULED.' })
  dueInDays!: number | null;
}

export class CardListCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty() due!: number;
  @ApiProperty() new!: number;
  @ApiProperty() mastered!: number;
}

export class CardListResponseDto {
  @ApiProperty({ type: CardItemDto, isArray: true }) items!: CardItemDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
  @ApiProperty({ type: CardListCountsDto }) counts!: CardListCountsDto;
}

export class CreateCardDto {
  @ApiProperty()
  @IsString({ message: 'Informe a pergunta.' })
  @MinLength(1, { message: 'Informe a pergunta.' })
  @MaxLength(4000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  question!: string;

  @ApiProperty()
  @IsString({ message: 'Informe a resposta.' })
  @MaxLength(8000)
  answer!: string;
}

export class UpdateCardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Informe a pergunta.' })
  @MinLength(1, { message: 'Informe a pergunta.' })
  @MaxLength(4000)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  question?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Informe a resposta.' })
  @MaxLength(8000)
  answer?: string;
}

export class AppendImportDto {
  @ApiProperty()
  @IsString({ message: 'Importacao invalida.' })
  @MaxLength(80)
  importId!: string;
}
