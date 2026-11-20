import { ApiProperty } from '@nestjs/swagger';
import { DeckVisibility } from '../../../generated/prisma/enums';

export class DeckSubjectDto {
  @ApiProperty({ example: '7f1f2c6c-5a2a-4e2e-8f1e-9c7f9e0a1b2c' })
  id!: string;

  @ApiProperty({ example: 'cardiologia' })
  slug!: string;

  @ApiProperty({ example: 'Cardiologia' })
  name!: string;
}

export class DeckOwnerDto {
  @ApiProperty({ example: 'Davi' })
  firstName!: string;

  @ApiProperty({ nullable: true, example: null })
  avatarUrl!: string | null;
}

export class DeckListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 1 }) year!: number;
  @ApiProperty() cardCount!: number;
  @ApiProperty({ type: DeckSubjectDto, isArray: true }) subjects!: DeckSubjectDto[];

  @ApiProperty() isMine!: boolean;
  @ApiProperty({ enum: DeckVisibility, nullable: true, description: 'So quando isMine.' })
  visibility!: DeckVisibility | null;

  @ApiProperty({ type: DeckOwnerDto, nullable: true, description: 'So quando !isMine.' })
  owner!: DeckOwnerDto | null;

  @ApiProperty() isFavorite!: boolean;
  @ApiProperty() dueToday!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty({ example: 42, description: '0..100 arredondado.' }) masteryPct!: number;

  @ApiProperty({ format: 'date-time' }) contentUpdatedAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Ultima avaliacao do usuario neste deck ("ha 2 horas"). Null se nunca estudou.',
  })
  lastStudiedAt!: string | null;
}

export class DeckListCountsDto {
  @ApiProperty() all!: number;
  @ApiProperty() mine!: number;
  @ApiProperty() community!: number;
  @ApiProperty() favorites!: number;
}

export class DeckListResponseDto {
  @ApiProperty({ type: DeckListItemDto, isArray: true }) items!: DeckListItemDto[];
  @ApiProperty({ nullable: true, example: null }) nextCursor!: string | null;
  @ApiProperty({ type: DeckListCountsDto }) counts!: DeckListCountsDto;
}

export class MyStatsDto {
  @ApiProperty() masteryPct!: number;
  @ApiProperty() dueToday!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() newCount!: number;
  @ApiProperty() masteredCount!: number;
  @ApiProperty({ nullable: true, description: 'Null se nao houver avaliacoes.' })
  accuracy!: number | null;
}

export class DeckDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 1 }) year!: number;
  @ApiProperty() cardCount!: number;
  @ApiProperty({ type: DeckSubjectDto, isArray: true }) subjects!: DeckSubjectDto[];

  @ApiProperty() isMine!: boolean;
  @ApiProperty() isSaved!: boolean;
  @ApiProperty() isFavorite!: boolean;
  @ApiProperty({ enum: DeckVisibility }) visibility!: DeckVisibility;
  @ApiProperty() saveCount!: number;
  @ApiProperty({ type: DeckOwnerDto }) owner!: DeckOwnerDto;

  @ApiProperty({ format: 'date-time' }) contentUpdatedAt!: string;
  @ApiProperty({ type: MyStatsDto }) myStats!: MyStatsDto;
}
