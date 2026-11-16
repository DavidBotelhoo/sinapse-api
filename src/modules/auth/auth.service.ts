import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env';
import type { MeResponseDto } from '../users/dto/me-response.dto';
import { UserMapper } from '../users/user.mapper';
import { MailService } from '../mail/mail.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordService } from './password.service';
import type { IssuedTokens, SessionContext } from './token.service';
import { TokenService } from './token.service';

export interface AuthenticatedResult {
  user: MeResponseDto;
  tokens: IssuedTokens;
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

@Injectable()
export class AuthService {
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly userMapper: UserMapper,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true }).replace(/\/+$/, '');
  }

  async register(dto: RegisterDto, ctx: SessionContext): Promise<AuthenticatedResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new AppException({
        code: ErrorCode.EMAIL_ALREADY_REGISTERED,
        message: 'Esse email ja tem conta. Entre ou recupere a senha.',
        status: HttpStatus.CONFLICT,
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
      },
    });

    const tokens = await this.tokens.issueFor(user.id, user.email, ctx);

    return {
      user: this.userMapper.toMeResponse(user, null),
      tokens,
    };
  }

  async login(dto: LoginDto, ctx: SessionContext): Promise<AuthenticatedResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw this.invalidCredentials();
    }

    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw this.invalidCredentials();
    }

    const tokens = await this.tokens.issueFor(user.id, user.email, ctx);
    const subscription = await this.prisma.subscription.findUnique({ where: { userId: user.id } });

    return {
      user: this.userMapper.toMeResponse(user, subscription),
      tokens,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    await this.tokens.revokeByRefresh(refreshToken);
  }

  async refresh(refreshToken: string | undefined, ctx: SessionContext): Promise<IssuedTokens> {
    if (!refreshToken) {
      throw this.invalidSession();
    }
    const result = await this.tokens.rotateRefresh(refreshToken, ctx);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      refreshExpiresAt: result.refreshExpiresAt,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      return; // Resposta uniforme, exista ou nao.
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${this.webUrl}/redefinir-senha?token=${rawToken}`;
    await this.mail.enqueuePasswordReset({
      to: user.email,
      firstName: user.firstName,
      resetUrl,
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashResetToken(dto.token);
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });

    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
      throw new AppException({
        code: ErrorCode.INVALID_RESET_TOKEN,
        message: 'Este link expirou ou ja foi usado. Peca um novo.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const newHash = await this.passwords.hash(dto.password);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: newHash, passwordChangedAt: now },
      }),
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: now },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  private hashResetToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private invalidCredentials(): AppException {
    return new AppException({
      code: ErrorCode.INVALID_CREDENTIALS,
      message: 'Email ou senha nao conferem.',
      status: HttpStatus.UNAUTHORIZED,
    });
  }

  private invalidSession(): AppException {
    return new AppException({
      code: ErrorCode.SESSION_INVALID,
      message: 'Sessao invalida ou expirada. Entre de novo.',
      status: HttpStatus.UNAUTHORIZED,
    });
  }
}
