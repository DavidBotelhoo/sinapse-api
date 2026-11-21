import { HttpStatus, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UserMapper } from './user.mapper';
import { AVATAR_LARGE_SIZE, AVATAR_THUMB_SIZE, avatarKeyFor, avatarThumbKey } from './public-owner';
import type { MeResponseDto } from './dto/me-response.dto';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

const AVATAR_MIME = 'image/webp';

type ImageKind = 'jpeg' | 'png' | 'webp';

function detectImageKind(buffer: Buffer): ImageKind | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

@Injectable()
export class AvatarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly userMapper: UserMapper,
  ) {}

  async uploadFor(userId: string, file: Express.Multer.File | undefined): Promise<MeResponseDto> {
    if (!file) {
      throw new AppException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Envie uma imagem.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    if (file.size > MAX_AVATAR_BYTES) {
      throw new AppException({
        code: ErrorCode.AVATAR_TOO_LARGE,
        message: 'A imagem precisa ter no maximo 5 MB.',
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
    }

    const kind = detectImageKind(file.buffer);
    if (!kind) {
      throw new AppException({
        code: ErrorCode.AVATAR_FORMAT,
        message: 'Use JPG, PNG ou WebP.',
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      });
    }

    const [large, thumb] = await Promise.all([
      this.encode(file.buffer, AVATAR_LARGE_SIZE),
      this.encode(file.buffer, AVATAR_THUMB_SIZE),
    ]);

    const key = avatarKeyFor(userId);
    const thumbKey = avatarThumbKey(key)!;

    await Promise.all([
      this.storage.putObject({ key, body: large, contentType: AVATAR_MIME }),
      this.storage.putObject({ key: thumbKey, body: thumb, contentType: AVATAR_MIME }),
    ]);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: key },
    });

    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    return this.userMapper.toMeResponse(user, subscription);
  }

  private async encode(input: Buffer, size: number): Promise<Buffer> {
    return sharp(input, { failOn: 'error' })
      .rotate() // respeita EXIF
      .resize(size, size, { fit: 'cover', position: 'attention' })
      .webp({ quality: 85 })
      .toBuffer();
  }
}
