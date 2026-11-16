import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionSummaryDto {
  @ApiProperty({
    example: 'NONE',
    enum: ['NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'],
  })
  status!: 'NONE' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

  @ApiProperty({ nullable: true, enum: ['MONTHLY', 'YEARLY'], example: null })
  plan!: 'MONTHLY' | 'YEARLY' | null;

  @ApiProperty({ nullable: true, example: null })
  trialEndsAt!: string | null;

  @ApiProperty({ nullable: true, example: null })
  currentPeriodEnd!: string | null;

  @ApiProperty({ nullable: true, example: null })
  paymentMethodLabel!: string | null;

  @ApiProperty({ nullable: true, example: null })
  graceUntil!: string | null;
}

export class MeResponseDto {
  @ApiProperty({ example: '7f1f2c6c-5a2a-4e2e-8f1e-9c7f9e0a1b2c' })
  id!: string;

  @ApiProperty({ example: 'Davi' })
  firstName!: string;

  @ApiProperty({ example: 'Botelho' })
  lastName!: string;

  @ApiProperty({ example: 'davi@example.com' })
  email!: string;

  @ApiProperty({ nullable: true, example: 'https://cdn.exemplo.com/avatars/abc.webp' })
  avatarUrl!: string | null;

  @ApiProperty({ enum: ['SYSTEM', 'LIGHT', 'DARK'], example: 'SYSTEM' })
  theme!: 'SYSTEM' | 'LIGHT' | 'DARK';

  @ApiProperty({ example: 'America/Sao_Paulo' })
  timezone!: string;

  @ApiProperty({ nullable: true, example: null })
  courseId!: string | null;

  @ApiProperty({ nullable: true, example: null })
  emailVerifiedAt!: string | null;

  @ApiProperty({ nullable: true, example: null })
  passwordChangedAt!: string | null;

  @ApiProperty({ type: SubscriptionSummaryDto })
  subscription!: SubscriptionSummaryDto;
}
