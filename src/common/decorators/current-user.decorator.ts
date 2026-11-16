import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

// Formato injetado pelo futuro JwtAuthGuard (etapa 2).
export interface CurrentUserInfo {
  id: string;
  email: string;
}

export const CurrentUser = createParamDecorator<keyof CurrentUserInfo | undefined>(
  (field, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserInfo }>();
    const user = req.user;
    if (!user) {
      return undefined;
    }
    return field ? user[field] : user;
  },
);
