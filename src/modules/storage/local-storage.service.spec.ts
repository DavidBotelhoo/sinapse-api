import { randomUUID } from 'node:crypto';
import { LocalStorageService } from './local-storage.service';
import { StorageObjectNotFoundError } from './storage.service';

function setup() {
  const env: Record<string, unknown> = { PORT: 3333, NODE_ENV: 'test' };
  return new LocalStorageService({ get: (key: string) => env[key] } as never);
}

describe('LocalStorageService', () => {
  it('grava, le e apaga um arquivo', async () => {
    const svc = setup();
    const key = `imports/spec-${randomUUID()}.pdf`;
    const body = Buffer.from('%PDF-1.7 conteudo');

    await svc.putObject({ key, body, contentType: 'application/pdf' });
    await expect(svc.getObject(key)).resolves.toEqual(body);

    await svc.deleteObject(key);
    await expect(svc.getObject(key)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  it('getObject de chave que nao existe: StorageObjectNotFoundError', async () => {
    await expect(setup().getObject(`avatars/${randomUUID()}.webp`)).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
  });

  it('deleteObject de chave que nao existe nao e erro', async () => {
    await expect(setup().deleteObject(`avatars/${randomUUID()}.webp`)).resolves.toBeUndefined();
  });
});
