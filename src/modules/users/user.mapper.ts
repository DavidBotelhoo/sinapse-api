import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import type { UserModel, SubscriptionModel } from '../../generated/prisma/models';
import type { Env } from '../../config/env';
import { MeResponseDto, SubscriptionSummaryDto } from './dto/me-response.dto';

const EMPTY_SUBSCRIPTION: SubscriptionSummaryDto = {
  status: 'NONE',
  plan: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  paymentMethodLabel: null,
  graceUntil: null,
};

@Injectable()
export class UserMapper {
  private readonly storagePublicUrl: string;

  constructor(config: ConfigService<Env, true>) {
    const explicit = config.get('STORAGE_PUBLIC_URL', { infer: true });
    if (explicit) {
      this.storagePublicUrl = explicit.replace(/\/+$/, '');
    } else {
      const port = config.get('PORT', { infer: true });
      this.storagePublicUrl = `http://localhost:${port}/uploads`;
    }
  }

  toMeResponse(user: UserModel, subscription: SubscriptionModel | null): MeResponseDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarKey ? `${this.storagePublicUrl}/${user.avatarKey}` : null,
      theme: user.theme,
      timezone: user.timezone,
      courseId: user.courseId,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      subscription: subscription ? this.toSubscriptionSummary(subscription) : EMPTY_SUBSCRIPTION,
    };
  }

  private toSubscriptionSummary(sub: SubscriptionModel): SubscriptionSummaryDto {
    return {
      status: sub.status,
      plan: sub.plan,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      paymentMethodLabel: sub.paymentMethodLabel ?? null,
      graceUntil: sub.graceUntil?.toISOString() ?? null,
    };
  }
}
