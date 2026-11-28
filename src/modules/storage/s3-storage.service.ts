import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import {
  StorageObjectNotFoundError,
  StorageService,
  resolvePublicBaseUrl,
  type PutObjectInput,
} from './storage.service';

// Cliente do bucket a partir do env (STORAGE_DRIVER=s3). A validacao do env ja garantiu
// STORAGE_BUCKET e as duas chaves juntas (ou nenhuma).
export function s3ClientConfig(config: ConfigService<Env, true>): S3ClientConfig {
  const endpoint = config.get('STORAGE_ENDPOINT', { infer: true });
  const accessKeyId = config.get('STORAGE_ACCESS_KEY', { infer: true });
  const secretAccessKey = config.get('STORAGE_SECRET_KEY', { infer: true });
  return {
    region: config.get('STORAGE_REGION', { infer: true }),
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: config.get('STORAGE_FORCE_PATH_STYLE', { infer: true }),
    // Sem chaves, o SDK usa a cadeia padrao da AWS (papel IAM, variaveis AWS_*).
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    // Checksum so quando a operacao exige: os compativeis (R2, MinIO) nem sempre aceitam os
    // cabecalhos que o SDK manda por padrao.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    // Sem limite, um bucket que nao responde prende a requisicao (e o worker) para sempre.
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
  };
}

type S3Sender = Pick<S3Client, 'send' | 'destroy'>;

// Bucket privado (S3, Cloudflare R2, MinIO). Nada fica publico no bucket: as fotos de perfil
// saem pela API em /uploads/avatars (AvatarFilesController) e os arquivos importados so sao
// lidos pelo worker.
@Injectable()
export class S3StorageService extends StorageService implements OnModuleDestroy {
  private readonly bucket: string;
  private readonly baseUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly client: S3Sender = new S3Client(s3ClientConfig(config)),
  ) {
    super();
    this.bucket = config.get('STORAGE_BUCKET', { infer: true })!;
    this.baseUrl = resolvePublicBaseUrl(config);
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) throw new StorageObjectNotFoundError(key);
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if (isNotFound(err)) throw new StorageObjectNotFoundError(key);
      throw err;
    }
  }

  // DeleteObject do S3 ja responde sucesso para chave que nao existe.
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}

function isNotFound(err: unknown): boolean {
  if (err instanceof StorageObjectNotFoundError) return true;
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
}
