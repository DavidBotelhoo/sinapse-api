import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

// getObject de uma chave que nao existe. Os dois drivers lancam este erro (e nao o do disco ou
// do S3) para quem chama poder responder 404 sem conhecer o driver.
export class StorageObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Arquivo nao encontrado no storage: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}

export abstract class StorageService {
  abstract putObject(input: PutObjectInput): Promise<void>;
  /** Lanca StorageObjectNotFoundError se a chave nao existe. */
  abstract getObject(key: string): Promise<Buffer>;
  /** Chave que nao existe nao e erro. */
  abstract deleteObject(key: string): Promise<void>;
  abstract publicUrl(key: string): string;
}

// Base das URLs publicas (avatarUrl): STORAGE_PUBLIC_URL ou, sem ela, a propria API local.
// Em producao a validacao do env exige STORAGE_PUBLIC_URL.
export function resolvePublicBaseUrl(config: ConfigService<Env, true>): string {
  const explicit = config.get('STORAGE_PUBLIC_URL', { infer: true });
  if (explicit) return explicit.replace(/\/+$/, '');
  return `http://localhost:${config.get('PORT', { infer: true })}/uploads`;
}
