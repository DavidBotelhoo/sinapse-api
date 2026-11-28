import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageService, s3ClientConfig } from './s3-storage.service';
import { StorageObjectNotFoundError } from './storage.service';

const BASE_ENV: Record<string, unknown> = {
  PORT: 3333,
  STORAGE_BUCKET: 'sinapse',
  STORAGE_REGION: 'auto',
  STORAGE_ENDPOINT: 'https://conta.r2.cloudflarestorage.com',
  STORAGE_ACCESS_KEY: 'chave',
  STORAGE_SECRET_KEY: 'segredo',
  STORAGE_FORCE_PATH_STYLE: false,
  STORAGE_PUBLIC_URL: 'https://api.sinapse.app/uploads/',
};

function configWith(env: Record<string, unknown>) {
  return { get: (key: string) => env[key] } as never;
}

function setup(env: Record<string, unknown> = BASE_ENV) {
  const client = { send: jest.fn(), destroy: jest.fn() };
  const svc = new S3StorageService(configWith(env), client);
  return { svc, client };
}

describe('s3ClientConfig', () => {
  it('R2: endpoint, regiao auto e as chaves do env', () => {
    const cfg = s3ClientConfig(configWith(BASE_ENV));
    expect(cfg).toMatchObject({
      region: 'auto',
      endpoint: 'https://conta.r2.cloudflarestorage.com',
      forcePathStyle: false,
      credentials: { accessKeyId: 'chave', secretAccessKey: 'segredo' },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  });

  it('AWS S3 sem chaves: sem endpoint nem credentials (cadeia padrao da AWS)', () => {
    const cfg = s3ClientConfig(
      configWith({
        ...BASE_ENV,
        STORAGE_ENDPOINT: undefined,
        STORAGE_REGION: 'sa-east-1',
        STORAGE_ACCESS_KEY: undefined,
        STORAGE_SECRET_KEY: undefined,
      }),
    );
    expect(cfg.region).toBe('sa-east-1');
    expect(cfg).not.toHaveProperty('endpoint');
    expect(cfg).not.toHaveProperty('credentials');
  });

  it('MinIO: bucket no caminho da URL', () => {
    const cfg = s3ClientConfig(configWith({ ...BASE_ENV, STORAGE_FORCE_PATH_STYLE: true }));
    expect(cfg.forcePathStyle).toBe(true);
  });
});

describe('S3StorageService', () => {
  it('putObject: grava no bucket com o tipo do arquivo', async () => {
    const { svc, client } = setup();
    client.send.mockResolvedValue({});
    const body = Buffer.from('foto');

    await svc.putObject({ key: 'avatars/u1.webp', body, contentType: 'image/webp' });

    const [command] = client.send.mock.calls[0] as [PutObjectCommand];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'sinapse',
      Key: 'avatars/u1.webp',
      Body: body,
      ContentType: 'image/webp',
    });
  });

  it('getObject: devolve o conteudo como Buffer', async () => {
    const { svc, client } = setup();
    client.send.mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
    });

    const buffer = await svc.getObject('imports/a.pdf');

    expect(buffer).toEqual(Buffer.from([1, 2, 3]));
    const [command] = client.send.mock.calls[0] as [GetObjectCommand];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: 'sinapse', Key: 'imports/a.pdf' });
  });

  it('getObject de chave que nao existe: StorageObjectNotFoundError', async () => {
    const { svc, client } = setup();
    client.send.mockRejectedValue(
      Object.assign(new Error('The specified key does not exist.'), {
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 },
      }),
    );

    await expect(svc.getObject('avatars/sumiu.webp')).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
  });

  it('getObject com outra falha (rede, permissao): o erro original sobe', async () => {
    const { svc, client } = setup();
    const denied = Object.assign(new Error('Access Denied'), {
      name: 'AccessDenied',
      $metadata: { httpStatusCode: 403 },
    });
    client.send.mockRejectedValue(denied);

    await expect(svc.getObject('avatars/u1.webp')).rejects.toBe(denied);
  });

  it('deleteObject: apaga a chave no bucket', async () => {
    const { svc, client } = setup();
    client.send.mockResolvedValue({});

    await svc.deleteObject('imports/a.pdf');

    const [command] = client.send.mock.calls[0] as [DeleteObjectCommand];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: 'sinapse', Key: 'imports/a.pdf' });
  });

  it('publicUrl: base de STORAGE_PUBLIC_URL, sem barra dobrada', () => {
    const { svc } = setup();
    expect(svc.publicUrl('avatars/u1-64.webp')).toBe(
      'https://api.sinapse.app/uploads/avatars/u1-64.webp',
    );
  });

  it('publicUrl sem STORAGE_PUBLIC_URL: a propria API local', () => {
    const { svc } = setup({ ...BASE_ENV, STORAGE_PUBLIC_URL: undefined });
    expect(svc.publicUrl('avatars/u1.webp')).toBe('http://localhost:3333/uploads/avatars/u1.webp');
  });

  it('fecha o cliente quando a API desliga', () => {
    const { svc, client } = setup();
    svc.onModuleDestroy();
    expect(client.destroy).toHaveBeenCalled();
  });
});
