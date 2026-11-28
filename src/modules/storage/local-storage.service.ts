import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import {
  StorageObjectNotFoundError,
  StorageService,
  resolvePublicBaseUrl,
  type PutObjectInput,
} from './storage.service';

// Arquivos na pasta uploads/ do disco. Serve para dev e para uma unica instancia com disco
// persistente; com disco temporario ou mais de uma instancia, use STORAGE_DRIVER=s3.
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.root = resolve(process.cwd(), 'uploads');
    this.baseUrl = resolvePublicBaseUrl(config);
    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      this.logger.warn(
        'Storage em disco (STORAGE_DRIVER=local) em producao: os arquivos somem se o disco ' +
          'for temporario e nao sao vistos por outras instancias.',
      );
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const target = resolve(this.root, input.key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.body);
  }

  async getObject(key: string): Promise<Buffer> {
    const target = resolve(this.root, key);
    try {
      return await readFile(target);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EISDIR') throw new StorageObjectNotFoundError(key);
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const target = resolve(this.root, key);
    try {
      await unlink(target);
    } catch {
      // ignora se o arquivo nao existe
    }
  }

  publicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
