import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';
import type { Env } from '../../config/env';
import { SKIP_CSRF_KEY } from './skip-csrf.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly webUrlOrigin: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly reflector: Reflector,
  ) {
    this.webUrlOrigin = new URL(config.get('WEB_URL', { infer: true })).origin;
  }

  canActivate(ctx: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) {
      return true;
    }

    const origin = req.get('origin');
    if (origin && origin === this.webUrlOrigin) {
      return true;
    }

    throw new AppException({
      code: ErrorCode.CSRF_FORBIDDEN,
      message: 'Origem não autorizada.',
      status: HttpStatus.FORBIDDEN,
    });
  }
}
