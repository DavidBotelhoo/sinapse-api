import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';
import { TokenService } from '../../modules/auth/token.service';
import type { CurrentUserInfo } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

const ACCESS_COOKIE = 'sn_access';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserInfo }>();
    const token = this.extractToken(req);
    if (!token) {
      throw new AppException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Nao autenticado.',
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    const payload = await this.tokens.verifyAccess(token);
    req.user = { id: payload.sub, email: payload.email };
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    return cookies[ACCESS_COOKIE];
  }
}
