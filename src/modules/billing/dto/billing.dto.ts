import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  InvoiceStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../../../generated/prisma/enums';
import type { EffectiveStatus } from '../subscription-access';

const EFFECTIVE_STATUSES = ['NONE', ...Object.values(SubscriptionStatus)];

// Assinatura como o app deve mostrar (GET /billing/subscription e GET /me). O front nao
// calcula nada: hasAccess diz se pode estudar e importar.
export class SubscriptionSummaryDto {
  @ApiProperty({
    enum: EFFECTIVE_STATUSES,
    enumName: 'SubscriptionSummaryStatus',
    example: 'TRIALING',
    description:
      'Ja considera as datas: teste vencido, prazo de pagamento vencido ou cancelamento com o periodo encerrado aparecem como EXPIRED.',
  })
  status!: EffectiveStatus;

  @ApiProperty({ description: 'Pode estudar e importar. Sem acesso, so leitura.' })
  hasAccess!: boolean;

  @ApiProperty({ description: 'Acesso vitalicio (ADMIN e SUPER_ADMIN). As datas vem nulas.' })
  lifetime!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Ate quando o acesso vale. Null: vitalicio, sem data ou sem acesso.',
  })
  accessUntil!: string | null;

  @ApiProperty({ enum: SubscriptionPlan, nullable: true, example: null })
  plan!: SubscriptionPlan | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, example: null })
  trialEndsAt!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description: '"Renova em 15 dez 2026" ou, cancelada, "acesso ate".',
  })
  currentPeriodEnd!: string | null;

  @ApiProperty({ description: 'Cancelada: nao renova no fim do periodo.' })
  cancelAtPeriodEnd!: boolean;

  @ApiProperty({ type: String, nullable: true, example: 'Visa final 4417' })
  paymentMethodLabel!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description: 'Pagamento recusado: prazo para atualizar o cartao (o acesso continua ate la).',
  })
  graceUntil!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description: '"Pagamento recusado em 15 nov".',
  })
  paymentFailedAt!: string | null;
}

export class PlanOptionDto {
  @ApiProperty({ enum: SubscriptionPlan, enumName: 'SubscriptionPlan' }) plan!: SubscriptionPlan;
  @ApiProperty({ enum: ['MONTH', 'YEAR'] }) interval!: 'MONTH' | 'YEAR';
  @ApiProperty({ example: 2990, description: 'Preco em centavos.' }) priceCents!: number;
  @ApiProperty({ example: 2492, description: '"Equivale a R$ X por mes", em centavos.' })
  monthlyEquivalentCents!: number;
  @ApiProperty({ example: 2, description: '"2 meses gratis" (0 no mensal).' })
  freeMonths!: number;
}

export class PlansDto {
  @ApiProperty({ example: 'BRL' }) currency!: string;
  @ApiProperty({ example: 7, description: 'Dias de teste gratis no cadastro.' }) trialDays!: number;
  @ApiProperty({ type: PlanOptionDto, isArray: true }) plans!: PlanOptionDto[];
}

export class CheckoutDto {
  @ApiProperty({ enum: SubscriptionPlan, enumName: 'SubscriptionPlan' })
  @IsEnum(SubscriptionPlan, { message: 'Escolha o plano mensal ou anual.' })
  plan!: SubscriptionPlan;
}

export class RedirectUrlDto {
  @ApiProperty({ example: 'https://checkout.gateway.com/...' }) url!: string;
}

export class InvoicesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt({ message: 'Limite inválido.' })
  @Min(1, { message: 'Limite inválido.' })
  @Max(50, { message: 'Limite inválido.' })
  limit: number = 20;
}

export class InvoiceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time', description: 'Data do pagamento (ou da tentativa).' })
  date!: string;
  @ApiProperty({ enum: SubscriptionPlan, enumName: 'SubscriptionPlan' }) plan!: SubscriptionPlan;
  @ApiProperty({ example: 2990 }) amountCents!: number;
  @ApiProperty({ example: 'BRL' }) currency!: string;
  @ApiProperty({ enum: InvoiceStatus, enumName: 'InvoiceStatus' }) status!: InvoiceStatus;
  @ApiProperty({ type: String, nullable: true, example: 'Visa final 4417' })
  paymentMethodLabel!: string | null;
}

export class InvoiceListDto {
  @ApiProperty({ type: InvoiceDto, isArray: true }) items!: InvoiceDto[];
  @ApiProperty({ type: String, nullable: true, example: null }) nextCursor!: string | null;
}

export class WebhookAckDto {
  @ApiProperty({ example: true }) received!: boolean;
  @ApiProperty({ description: 'O evento ja tinha sido processado; nada foi refeito.' })
  duplicate!: boolean;
}
