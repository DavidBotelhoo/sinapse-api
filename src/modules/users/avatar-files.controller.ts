import { Controller, Get, HttpStatus, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { StorageObjectNotFoundError, StorageService } from '../storage/storage.service';

// Caminho fora do prefixo /v1 (ver app.setup.ts): e a URL que vai no avatarUrl.
export const AVATAR_FILES_PATH = 'uploads/avatars';

// So nome de arquivo simples: sem barra nem "..", entao nunca sai da pasta avatars/.
const AVATAR_FILE = /^[A-Za-z0-9_-]+\.(webp|png|jpe?g)$/i;

const CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const notFound = (): AppException =>
  new AppException({
    code: ErrorCode.NOT_FOUND,
    message: 'Recurso não encontrado.',
    status: HttpStatus.NOT_FOUND,
  });

// Fotos de perfil, publicas e sem login, lidas do storage (disco ou bucket privado). Os
// arquivos importados nao tem rota: ficam fora do ar.
// Sem limite de requisicoes: uma tela da Comunidade carrega varias fotos de uma vez, e elas
// nao podem gastar o limite das chamadas da API.
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller(AVATAR_FILES_PATH)
export class AvatarFilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':file')
  async get(@Param('file') file: string, @Res() res: Response): Promise<void> {
    const contentType = CONTENT_TYPES[file.slice(file.lastIndexOf('.') + 1).toLowerCase()];
    if (!AVATAR_FILE.test(file) || !contentType) throw notFound();

    let body: Buffer;
    try {
      body = await this.storage.getObject(`avatars/${file}`);
    } catch (err) {
      if (err instanceof StorageObjectNotFoundError) throw notFound();
      throw err;
    }

    // A chave da foto nao muda quando a pessoa troca de foto: o navegador sempre confere
    // (ETag do Express responde 304 se nao mudou), como o servidor de estaticos fazia.
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(body);
  }
}
