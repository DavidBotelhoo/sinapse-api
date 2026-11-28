import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { StorageObjectNotFoundError } from '../storage/storage.service';
import { AvatarFilesController } from './avatar-files.controller';

function setup() {
  const storage = { getObject: jest.fn() };
  const res = { set: jest.fn(), send: jest.fn() };
  const controller = new AvatarFilesController(storage as never);
  return { controller, storage, res };
}

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AppException) return err.getStatus();
    throw err;
  }
  throw new Error('esperava erro');
}

describe('AvatarFilesController', () => {
  it('le a foto do storage e responde com o tipo certo', async () => {
    const { controller, storage, res } = setup();
    const body = Buffer.from('webp');
    storage.getObject.mockResolvedValue(body);

    await controller.get('u1-64.webp', res as never);

    expect(storage.getObject).toHaveBeenCalledWith('avatars/u1-64.webp');
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      }),
    );
    expect(res.send).toHaveBeenCalledWith(body);
  });

  it('foto antiga em JPG ou PNG: tipo pela extensao', async () => {
    const { controller, storage, res } = setup();
    storage.getObject.mockResolvedValue(Buffer.from('x'));

    await controller.get('legado.JPG', res as never);

    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'image/jpeg' }));
  });

  it.each(['../imports/a.pdf', '..', 'a.pdf', 'a.webp.pdf', 'sem-extensao', '.webp', 'a b.webp'])(
    'nome fora do padrao (%s): 404 sem ler o storage',
    async (file) => {
      const { controller, storage, res } = setup();
      expect(await statusOf(controller.get(file, res as never))).toBe(HttpStatus.NOT_FOUND);
      expect(storage.getObject).not.toHaveBeenCalled();
    },
  );

  it('foto que nao existe: 404', async () => {
    const { controller, storage, res } = setup();
    storage.getObject.mockRejectedValue(new StorageObjectNotFoundError('avatars/u1.webp'));

    expect(await statusOf(controller.get('u1.webp', res as never))).toBe(HttpStatus.NOT_FOUND);
    expect(res.send).not.toHaveBeenCalled();
  });

  it('falha do storage (rede, permissao) nao vira 404', async () => {
    const { controller, storage, res } = setup();
    const boom = new Error('bucket fora do ar');
    storage.getObject.mockRejectedValue(boom);

    await expect(controller.get('u1.webp', res as never)).rejects.toBe(boom);
  });
});
