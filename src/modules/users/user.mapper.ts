import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import type { UserModel, SubscriptionModel } from '../../generated/prisma/models';
import type { Env } from '../../config/env';
import { toSubscriptionSummary } from '../billing/subscription-summary';
import type { MeResponseDto } from './dto/me-response.dto';

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
      role: user.role,
      courseId: user.courseId,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      subscription: toSubscriptionSummary(user.role, subscription),
    };
  }
}
