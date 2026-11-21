import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportReason } from '../../../generated/prisma/enums';

export const REPORT_DETAILS_MAX = 500;

export class ReportDeckDto {
  @ApiProperty({ enum: ReportReason, enumName: 'ReportReason' })
  @IsEnum(ReportReason, { message: 'Escolha um motivo.' })
  reason!: ReportReason;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: REPORT_DETAILS_MAX,
    description: 'Opcional. Espacos nas pontas sao cortados; vazio vira null.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @IsString({ message: 'Detalhes invalidos.' })
  @MaxLength(REPORT_DETAILS_MAX, {
    message: `Use no maximo ${REPORT_DETAILS_MAX} caracteres.`,
  })
  details?: string | null;
}
