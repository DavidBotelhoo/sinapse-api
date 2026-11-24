import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface SessionContext {
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const ACCESS_EXPIRES_SECONDS = 15 * 60; // 15 min
const REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessSecret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  async issueFor(userId: string, email: string, ctx: SessionContext): Promise<IssuedTokens> {
    const accessToken = await this.signAccess({ sub: userId, email });
    const refreshToken = this.generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS);

    await this.prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash: this.hashRefresh(refreshToken),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt: refreshExpiresAt,
      },
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.accessSecret });
    } catch {
      throw new AppException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Não autenticado.',
        status: HttpStatus.UNAUTHORIZED,
      });
    }
  }

  async rotateRefresh(raw: string, ctx: SessionContext): Promise<IssuedTokens & { email: string }> {
    const hash = this.hashRefresh(raw);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!session) {
      throw this.invalidSession();
    }

    if (session.revokedAt) {
      // Reuso de refresh ja rotacionado: revoga toda a cadeia do usuario.
      this.logger.warn(
        { userId: session.userId },
        'Refresh token reuse detectado. Revogando sessoes.',
      );
      await this.revokeAllSessions(session.userId);
      throw this.invalidSession();
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw this.invalidSession();
    }

    // Rotaciona na mesma transacao.
    const newToken = this.generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      }),
      this.prisma.authSession.create({
        data: {
          userId: session.userId,
          refreshTokenHash: this.hashRefresh(newToken),
          userAgent: ctx.userAgent,
          ip: ctx.ip,
          expiresAt: newExpiresAt,
        },
      }),
    ]);

    const accessToken = await this.signAccess({ sub: session.userId, email: session.user.email });

    return {
      accessToken,
      refreshToken: newToken,
      refreshExpiresAt: newExpiresAt,
      email: session.user.email,
    };
  }

  async revokeByRefresh(raw: string | undefined): Promise<void> {
    if (!raw) {
      return;
    }
    const hash = this.hashRefresh(raw);
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  hashRefresh(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private signAccess(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: ACCESS_EXPIRES_SECONDS,
    });
  }

  private invalidSession(): AppException {
    return new AppException({
      code: ErrorCode.SESSION_INVALID,
      message: 'Sessão inválida ou expirada. Entre de novo.',
      status: HttpStatus.UNAUTHORIZED,
    });
  }
}
