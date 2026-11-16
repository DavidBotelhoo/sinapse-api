import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { StorageService, type PutObjectInput } from './storage.service';

@Injectable()
export class LocalStorageService extends StorageService {
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.root = resolve(process.cwd(), 'uploads');
    const explicit = config.get('STORAGE_PUBLIC_URL', { infer: true });
    if (explicit) {
      this.baseUrl = explicit.replace(/\/+$/, '');
    } else {
      const port = config.get('PORT', { infer: true });
      this.baseUrl = `http://localhost:${port}/uploads`;
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const target = resolve(this.root, input.key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.body);
  }

  async getObject(key: string): Promise<Buffer> {
    const target = resolve(this.root, key);
    return readFile(target);
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
