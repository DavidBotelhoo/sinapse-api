import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { DeckSubjectDto } from '../../decks/dto/common.dto';

export class MeStatsDto {
  @ApiProperty({
    example: 12,
    description: 'Dias seguidos com ao menos uma avaliacao (fuso do usuario).',
  })
  streak!: number;

  @ApiProperty({ description: 'Ja avaliou algum card hoje.' })
  studiedToday!: boolean;

  @ApiProperty({
    format: 'date',
    example: '2026-11-16',
    description: 'Segunda-feira da semana atual.',
  })
  weekStart!: string;

  @ApiProperty({
    type: Boolean,
    isArray: true,
    example: [true, true, true, true, true, true, false],
    description: 'Seg..dom: dias da semana atual com avaliacao.',
  })
  weekStudied!: boolean[];

  @ApiProperty({ example: 342, description: 'Avaliacoes na semana atual.' })
  cardsThisWeek!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 18,
    description: '% contra o mesmo periodo da semana anterior. Null se a anterior teve 0.',
  })
  cardsDeltaPct!: number | null;

  @ApiProperty({ example: 400, description: 'Minutos de estudo na semana atual.' })
  minutesThisWeek!: number;

  @ApiProperty({
    type: Number,
    isArray: true,
    example: [40, 75, 60, 120, 30, 55, 20],
    description: 'Seg..dom: minutos por dia na semana atual.',
  })
  minutesPerDay!: number[];

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 78,
    description: '(Dificil + Facil) / total, em %, nos ultimos 7 dias. Null sem avaliacoes.',
  })
  accuracy7d!: number | null;
}

export class AgendaQueryDto {
  @ApiPropertyOptional({
    default: 7,
    minimum: 1,
    maximum: 30,
    description: 'Quantos dias, a partir de hoje.',
  })
  @IsOptional()
  @IsInt({ message: 'Quantidade de dias invalida.' })
  @Min(1, { message: 'Quantidade de dias invalida.' })
  @Max(30, { message: 'Use no maximo 30 dias.' })
  @Transform(({ value }: { value: unknown }) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : value;
  })
  days: number = 7;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-11-16',
    description: 'Dia escolhido (fuso do usuario), dentro da janela. Padrao: hoje.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data invalida. Use AAAA-MM-DD.' })
  date?: string;
}

export class AgendaDayDto {
  @ApiProperty({ format: 'date', example: '2026-11-16' })
  date!: string;

  @ApiProperty({
    example: 32,
    description: 'Cards que vencem no dia (em hoje, inclui os atrasados).',
  })
  total!: number;

  @ApiProperty({ example: 5, description: 'Atrasados (so no primeiro dia, hoje).' })
  overdue!: number;
}

export class AgendaDeckDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 3 }) year!: number;
  @ApiProperty({ type: DeckSubjectDto, isArray: true }) subjects!: DeckSubjectDto[];

  @ApiProperty({ description: 'Vencem no dia escolhido.' }) due!: number;
  @ApiProperty({ description: 'Atrasados (so quando o dia escolhido e hoje).' }) overdue!: number;
  @ApiProperty() total!: number;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-11-15',
    description: 'Dia local do atrasado mais antigo ("atrasado desde ontem").',
  })
  overdueSince!: string | null;
}

export class AgendaDto {
  @ApiProperty({
    type: AgendaDayDto,
    isArray: true,
    description: 'Um item por dia, a partir de hoje.',
  })
  days!: AgendaDayDto[];

  @ApiProperty({ example: 57, description: 'Soma dos dias ("57 na semana").' })
  total!: number;

  @ApiProperty({ format: 'date', description: 'Dia escolhido.' })
  date!: string;

  @ApiProperty({
    type: AgendaDeckDto,
    isArray: true,
    description: 'Decks do dia escolhido; atrasados primeiro.',
  })
  decks!: AgendaDeckDto[];
}
