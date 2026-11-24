import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import type { MeResponseDto } from './dto/me-response.dto';
import type { UpdateMeDto } from './dto/update-me.dto';
import type { ChangePasswordDto } from './dto/change-password.dto';
import { UserMapper } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly userMapper: UserMapper,
  ) {}

  async getMe(userId: string): Promise<MeResponseDto> {
    const [user, subscription] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.subscription.findUnique({ where: { userId } }),
    ]);
    return this.userMapper.toMeResponse(user, subscription);
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<MeResponseDto> {
    const data: Record<string, unknown> = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.theme !== undefined) data.theme = dto.theme;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    return this.userMapper.toMeResponse(user, subscription);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentRefreshToken: string | undefined,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const okCurrent = await this.passwords.verify(user.passwordHash, dto.currentPassword);
    if (!okCurrent) {
      throw new AppException({
        code: ErrorCode.CURRENT_PASSWORD_WRONG,
        message: 'A senha atual não confere.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const sameAsCurrent = await this.passwords.verify(user.passwordHash, dto.newPassword);
    if (sameAsCurrent) {
      throw new AppException({
        code: ErrorCode.NEW_PASSWORD_SAME_AS_CURRENT,
        message: 'Escolha uma senha diferente da atual.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const newHash = await this.passwords.hash(dto.newPassword);
    const now = new Date();
    const currentHash = currentRefreshToken
      ? this.tokens.hashRefresh(currentRefreshToken)
      : undefined;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash, passwordChangedAt: now },
      }),
      this.prisma.authSession.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(currentHash ? { NOT: { refreshTokenHash: currentHash } } : {}),
        },
        data: { revokedAt: now },
      }),
    ]);
  }
}
