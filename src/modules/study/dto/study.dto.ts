import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { ReviewRating, StudyOrder } from '../../../generated/prisma/enums';
import { DeckOwnerDto, DeckSubjectDto } from '../../decks/dto/common.dto';

const CARD_STATUSES = ['NEW', 'DUE_TODAY', 'OVERDUE', 'SCHEDULED', 'MASTERED'] as const;
type CardStatusValue = (typeof CARD_STATUSES)[number];

// ---------- GET /study/overview ----------

export class StudyTodayDto {
  @ApiProperty({ example: 27, description: 'Vencem hoje (sem os atrasados).' }) dueToday!: number;
  @ApiProperty({ example: 5 }) overdue!: number;
  @ApiProperty({ example: 3, description: 'Decks com cards para hoje ou atrasados.' })
  deckCount!: number;
  @ApiProperty({ example: 20, description: '(dueToday + overdue) x tempo medio por card.' })
  estimatedMinutes!: number;
}

export class StudySubjectOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'farmacologia' }) slug!: string;
  @ApiProperty({ example: 'Farmacologia' }) name!: string;
  @ApiProperty({
    type: Number,
    isArray: true,
    example: [2],
    description: 'Anos dos decks dessa materia.',
  })
  years!: number[];
  @ApiProperty({ example: 84 }) cardCount!: number;
  @ApiProperty({ example: 15 }) dueToday!: number;
  @ApiProperty({ example: 0 }) overdue!: number;
  @ApiProperty({ example: 10, description: 'Nunca estudados.' }) newCount!: number;
}

export class StudyDeckOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 2 }) year!: number;
  @ApiProperty({ type: DeckSubjectDto, isArray: true }) subjects!: DeckSubjectDto[];
  @ApiProperty() cardCount!: number;
  @ApiProperty() isMine!: boolean;
  @ApiProperty({
    type: DeckOwnerDto,
    nullable: true,
    description: 'So quando o deck e da comunidade.',
  })
  owner!: DeckOwnerDto | null;
  @ApiProperty() dueToday!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty({ description: 'Nunca estudados.' }) newCount!: number;
}

export class StudyOverviewDto {
  @ApiProperty({ type: StudyTodayDto, description: '"Revisao de hoje".' })
  today!: StudyTodayDto;

  @ApiProperty({
    example: 40,
    description:
      'Tempo medio por card do usuario (40 s sem historico), para o tempo estimado de "Sua sessao".',
  })
  secondsPerCard!: number;

  @ApiProperty({
    type: StudySubjectOptionDto,
    isArray: true,
    description: 'Aba "Por tema"; pendentes primeiro.',
  })
  subjects!: StudySubjectOptionDto[];

  @ApiProperty({
    type: StudyDeckOptionDto,
    isArray: true,
    description: 'Aba "Por deck"; pendentes primeiro.',
  })
  decks!: StudyDeckOptionDto[];
}

// ---------- POST /study/sessions ----------

export enum StudyMode {
  TODAY = 'today',
}

export const SESSION_LIMITS = [10, 20, 30] as const;

export class CreateStudySessionDto {
  @ApiPropertyOptional({ type: [String], description: 'Decks escolhidos (proprios ou salvos).' })
  @IsOptional()
  @IsArray({ message: 'Decks invalidos.' })
  @ArrayMaxSize(200, { message: 'Decks demais.' })
  @IsUUID('4', { each: true, message: 'Deck invalido.' })
  deckIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Materias escolhidas.' })
  @IsOptional()
  @IsArray({ message: 'Materias invalidas.' })
  @ArrayMaxSize(200, { message: 'Materias demais.' })
  @IsUUID('4', { each: true, message: 'Materia invalida.' })
  subjectIds?: string[];

  @ApiPropertyOptional({
    type: Number,
    enum: SESSION_LIMITS,
    nullable: true,
    description: 'Quantos cards. null = todos. Padrao: 20 (ou todos com mode=today).',
  })
  @IsOptional()
  @IsIn(SESSION_LIMITS, { message: 'Escolha 10, 20, 30 ou todos.' })
  limit?: (typeof SESSION_LIMITS)[number] | null;

  @ApiPropertyOptional({ enum: StudyOrder, default: StudyOrder.DUE_FIRST })
  @IsOptional()
  @IsEnum(StudyOrder, { message: 'Ordem invalida.' })
  order?: StudyOrder;

  @ApiPropertyOptional({
    enum: StudyMode,
    description:
      '"today" = Revisao de hoje: so os que vencem hoje e os atrasados, de todos os decks.',
  })
  @IsOptional()
  @IsEnum(StudyMode, { message: 'Modo invalido.' })
  mode?: StudyMode;
}

export class StudyCardDto {
  @ApiProperty() id!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty() question!: string;
  @ApiProperty() answer!: string;
  @ApiProperty({ example: 2 }) year!: number;
  @ApiProperty({ type: DeckSubjectDto, isArray: true }) subjects!: DeckSubjectDto[];
  @ApiProperty({
    enum: CARD_STATUSES,
    description: 'Situacao do card quando a sessao foi montada.',
  })
  status!: CardStatusValue;
}

export class StudySessionDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({ example: 20 }) total!: number;
  @ApiProperty({ enum: StudyOrder }) order!: StudyOrder;
  @ApiProperty({
    type: DeckSubjectDto,
    isArray: true,
    description: 'Materias da sessao, as com mais cards primeiro ("Farmacologia e Fisiologia").',
  })
  subjects!: DeckSubjectDto[];
  @ApiProperty({ type: StudyCardDto, isArray: true, description: 'Na ordem da sessao.' })
  cards!: StudyCardDto[];
}

// ---------- POST /study/sessions/:id/reviews ----------

export class CreateReviewDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Card invalido.' })
  cardId!: string;

  @ApiProperty({ enum: ReviewRating, description: 'Errei = AGAIN, Dificil = HARD, Facil = GOOD.' })
  @IsEnum(ReviewRating, { message: 'Avaliacao invalida.' })
  rating!: ReviewRating;

  @ApiProperty({
    example: 12000,
    minimum: 0,
    description: 'Tempo entre mostrar a pergunta e avaliar. Acima de 5 min conta como 5 min.',
  })
  @IsInt({ message: 'Tempo invalido.' })
  @Min(0, { message: 'Tempo invalido.' })
  durationMs!: number;
}

export class ReviewResultDto {
  @ApiProperty() cardId!: string;
  @ApiProperty({ enum: ReviewRating }) rating!: ReviewRating;
  @ApiProperty({ enum: CARD_STATUSES, description: 'Nova situacao do card.' })
  status!: CardStatusValue;
  @ApiProperty({ type: Number, nullable: true, description: 'So quando SCHEDULED.' })
  dueInDays!: number | null;
  @ApiProperty({ format: 'date-time', description: 'Quando o card volta.' }) due!: string;
  @ApiProperty({ example: 3, description: 'Cards ja avaliados nesta sessao.' }) reviewed!: number;
  @ApiProperty({ example: 20 }) total!: number;
}

// ---------- POST /study/sessions/:id/finish ----------

export class RatingCountsDto {
  @ApiProperty({ example: 4, description: 'Errei.' }) again!: number;
  @ApiProperty({ example: 6, description: 'Dificil.' }) hard!: number;
  @ApiProperty({ example: 10, description: 'Facil.' }) good!: number;
}

export class SessionStreakDto {
  @ApiProperty({ example: 13 }) days!: number;
  @ApiProperty({ description: 'Esta sessao teve a primeira avaliacao do dia (o streak subiu).' })
  increased!: boolean;
}

export class ToReviewCardDto {
  @ApiProperty() id!: string;
  @ApiProperty() deckId!: string;
  @ApiProperty() question!: string;
  @ApiProperty() answer!: string;
  @ApiProperty({ example: 2 }) year!: number;
  @ApiProperty({ type: DeckSubjectDto, isArray: true }) subjects!: DeckSubjectDto[];
  @ApiProperty({ format: 'date-time', description: 'Quando volta ("voltam em 10 min").' })
  due!: string;
}

export class StudySessionSummaryDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
  @ApiProperty({ format: 'date-time' }) finishedAt!: string;
  @ApiProperty({ example: 20, description: 'Cards na sessao.' }) total!: number;
  @ApiProperty({ example: 20, description: 'Cards avaliados.' }) reviewed!: number;
  @ApiProperty({ type: RatingCountsDto }) counts!: RatingCountsDto;
  @ApiProperty({ type: Number, nullable: true, example: 80, description: 'Null sem avaliacoes.' })
  accuracyPct!: number | null;
  @ApiProperty({ example: 840000 }) totalDurationMs!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 42000,
    description: 'Null sem avaliacoes.',
  })
  avgDurationMs!: number | null;
  @ApiProperty({ type: SessionStreakDto }) streak!: SessionStreakDto;
  @ApiProperty({ type: DeckSubjectDto, isArray: true }) subjects!: DeckSubjectDto[];
  @ApiProperty({
    type: ToReviewCardDto,
    isArray: true,
    description: '"Para rever": os cards com Errei.',
  })
  toReview!: ToReviewCardDto[];
}
