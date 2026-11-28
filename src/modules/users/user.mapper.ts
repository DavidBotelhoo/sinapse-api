import { Injectable } from '@nestjs/common';
import type { UserModel, SubscriptionModel } from '../../generated/prisma/models';
import { toSubscriptionSummary } from '../billing/subscription-summary';
import { StorageService } from '../storage/storage.service';
import type { MeResponseDto } from './dto/me-response.dto';

@Injectable()
export class UserMapper {
  constructor(private readonly storage: StorageService) {}

  toMeResponse(user: UserModel, subscription: SubscriptionModel | null): MeResponseDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarKey ? this.storage.publicUrl(user.avatarKey) : null,
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
