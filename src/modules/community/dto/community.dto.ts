import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { DeckOwnerDto, DeckSubjectDto } from '../../decks/dto/common.dto';

export enum CommunitySort {
  POPULAR = 'popular',
  RECENT = 'recent',
}

export const COMMUNITY_PAGE_DEFAULT = 20;
export const COMMUNITY_PAGE_MAX = 50;
export const PREVIEW_CARD_COUNT = 6;

export class CommunityDecksQueryDto {
  @ApiPropertyOptional({ type: [Number], example: [1, 2] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true, message: 'Ano invalido.' })
  @Min(1, { each: true, message: 'Ano invalido.' })
  @Max(12, { each: true, message: 'Ano invalido.' })
  @Transform(toIntArray)
  year?: number[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Materia invalida.' })
  @Transform(toStringArray)
  subjectIds?: string[];

  @ApiPropertyOptional({
    example: 'farmaco',
    description: 'Busca no nome do deck e no nome das materias (materia sem diferenciar acento).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Use no maximo 80 caracteres.' })
  @Transform(trimString)
  q?: string;

  @ApiPropertyOptional({
    enum: CommunitySort,
    enumName: 'CommunitySort',
    default: CommunitySort.POPULAR,
    description: 'popular: mais salvos primeiro. recent: conteudo atualizado mais recentemente.',
  })
  @IsOptional()
  @IsEnum(CommunitySort, { message: 'Ordem invalida.' })
  sort: CommunitySort = CommunitySort.POPULAR;

  @ApiPropertyOptional({ description: 'nextCursor da pagina anterior, com a mesma ordem.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ default: COMMUNITY_PAGE_DEFAULT, minimum: 1, maximum: COMMUNITY_PAGE_MAX })
  @IsOptional()
  @IsInt({ message: 'Limite invalido.' })
  @Min(1, { message: 'Limite invalido.' })
  @Max(COMMUNITY_PAGE_MAX, { message: 'Limite invalido.' })
  limit: number = COMMUNITY_PAGE_DEFAULT;
}

// Deck publico visto por qualquer pessoa. O dono e so { firstName, avatarUrl }.
export class CommunityDeckDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 1 }) year!: number;
  @ApiProperty({ type: DeckSubjectDto, isArray: true }) subjects!: DeckSubjectDto[];
  @ApiProperty() cardCount!: number;
  @ApiProperty({ description: 'Quantas pessoas salvaram.' }) saveCount!: number;
  @ApiProperty({ description: 'O usuario logado salvou este deck.' }) isSaved!: boolean;
  @ApiProperty({
    description: 'O deck e do usuario logado (o front troca "Salvar" pelo link do deck).',
  })
  isMine!: boolean;
  @ApiProperty({ type: DeckOwnerDto }) owner!: DeckOwnerDto;
}

export class CommunityDeckListDto {
  @ApiProperty({ type: CommunityDeckDto, isArray: true }) items!: CommunityDeckDto[];
  @ApiProperty({ type: String, nullable: true, example: null }) nextCursor!: string | null;
  @ApiProperty({ example: 1248, description: 'Total de decks com os mesmos filtros.' })
  total!: number;
}

export class CommunityPreviewCardDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 1 }) position!: number;
  @ApiProperty() question!: string;
  @ApiProperty() answer!: string;
}

export class CommunityDeckDetailDto extends CommunityDeckDto {
  @ApiProperty({ format: 'date-time' }) contentUpdatedAt!: string;

  @ApiProperty({
    type: CommunityPreviewCardDto,
    isArray: true,
    description: `Os ${PREVIEW_CARD_COUNT} primeiros cards. Os demais so em /decks/:id/cards, depois de salvar.`,
  })
  previewCards!: CommunityPreviewCardDto[];
}
