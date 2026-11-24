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

// Um PNG pequeno pode descrever uma imagem enorme (ex. 20000 x 20000) que ocuparia GBs de
// memoria ao decodificar. 40 MP cobre qualquer foto de celular.
export const MAX_AVATAR_PIXELS = 40_000_000;

export const avatarTooLarge = (): AppException =>
  new AppException({
    code: ErrorCode.AVATAR_TOO_LARGE,
    message: 'A imagem precisa ter no máximo 5 MB.',
    status: HttpStatus.PAYLOAD_TOO_LARGE,
  });

const avatarUnreadable = (): AppException =>
  new AppException({
    code: ErrorCode.AVATAR_FORMAT,
    message: 'Não conseguimos ler essa imagem. Use JPG, PNG ou WebP.',
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  });

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
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
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

    if (file.size > MAX_AVATAR_BYTES) throw avatarTooLarge();

    const kind = detectImageKind(file.buffer);
    if (!kind) {
      throw new AppException({
        code: ErrorCode.AVATAR_FORMAT,
        message: 'Use JPG, PNG ou WebP.',
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      });
    }

    await this.assertDimensions(file.buffer);

    // Cabecalho certo com o resto corrompido so aparece ao decodificar.
    let large: Buffer;
    let thumb: Buffer;
    try {
      [large, thumb] = await Promise.all([
        this.encode(file.buffer, AVATAR_LARGE_SIZE),
        this.encode(file.buffer, AVATAR_THUMB_SIZE),
      ]);
    } catch {
      throw avatarUnreadable();
    }

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

  // "Remover" foto: apaga as duas versoes e zera a chave. Sem foto, nao muda nada.
  async removeFor(userId: string): Promise<MeResponseDto> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarKey: true },
    });

    if (current.avatarKey) {
      const thumbKey = avatarThumbKey(current.avatarKey);
      // O storage ignora arquivo que nao existe.
      await Promise.all([
        this.storage.deleteObject(current.avatarKey),
        thumbKey ? this.storage.deleteObject(thumbKey) : Promise.resolve(),
      ]);
    }

    const user = current.avatarKey
      ? await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null } })
      : await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    return this.userMapper.toMeResponse(user, subscription);
  }

  // Le so o cabecalho (sem decodificar) para recusar imagens gigantes antes do trabalho pesado.
  private async assertDimensions(input: Buffer): Promise<void> {
    let width: number | undefined;
    let height: number | undefined;
    try {
      // Sem o limite padrao do sharp aqui: so o cabecalho e lido, e queremos o tamanho
      // declarado para responder com a mensagem certa.
      ({ width, height } = await sharp(input, { limitInputPixels: false }).metadata());
    } catch {
      throw avatarUnreadable();
    }
    if (!width || !height) throw avatarUnreadable();
    if (width * height > MAX_AVATAR_PIXELS) {
      throw new AppException({
        code: ErrorCode.AVATAR_TOO_LARGE,
        message: 'A imagem é grande demais. Use uma foto de até 40 megapixels.',
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
    }
  }

  private async encode(input: Buffer, size: number): Promise<Buffer> {
    return sharp(input, { failOn: 'error', limitInputPixels: MAX_AVATAR_PIXELS })
      .rotate() // respeita EXIF
      .resize(size, size, { fit: 'cover', position: 'attention' })
      .webp({ quality: 85 })
      .toBuffer();
  }
}
