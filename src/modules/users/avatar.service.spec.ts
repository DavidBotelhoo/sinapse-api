import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { AvatarService } from './avatar.service';

// PNG de poucos bytes que declara no cabecalho (IHDR) um tamanho enorme: decodificar
// ocuparia GBs de memoria.
function pngHeaderOnly(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(16))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function file(buffer: Buffer): Express.Multer.File {
  return { buffer, size: buffer.length } as Express.Multer.File;
}

function setup() {
  const prisma = {
    user: { update: jest.fn().mockResolvedValue({ id: 'u1' }) },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const storage = { putObject: jest.fn().mockResolvedValue(undefined) };
  const mapper = { toMeResponse: jest.fn().mockReturnValue({ id: 'u1' }) };
  const svc = new AvatarService(prisma as never, storage as never, mapper as never);
  return { svc, prisma, storage };
}

describe('AvatarService.uploadFor', () => {
  it('imagem valida: grava as duas versoes e a chave', async () => {
    const { svc, prisma, storage } = setup();
    const png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: '#0e5c5e' },
    })
      .png()
      .toBuffer();
    await svc.uploadFor('u1', file(png));
    expect(storage.putObject).toHaveBeenCalledTimes(2);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { avatarKey: 'avatars/u1.webp' },
    });
  });

  it('cabecalho de PNG com o resto corrompido: 415, nao 500', async () => {
    const { svc, storage } = setup();
    const broken = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(2000, 7),
    ]);
    await expect(svc.uploadFor('u1', file(broken))).rejects.toMatchObject({
      status: 415,
      response: { error: { code: 'AVATAR_FORMAT' } },
    });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it.each([
    [7_000, 7_000], // 49 MP: acima do nosso limite (40 MP)
    [20_000, 20_000], // 400 MP: acima ate do limite padrao do sharp
  ])('imagem de %ix%i declarada no cabecalho: 413 antes de decodificar', async (w, h) => {
    const { svc, storage } = setup();
    await expect(svc.uploadFor('u1', file(pngHeaderOnly(w, h)))).rejects.toMatchObject({
      status: 413,
      response: { error: { code: 'AVATAR_TOO_LARGE' } },
    });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('formato que nao e imagem: 415', async () => {
    const { svc } = setup();
    await expect(
      svc.uploadFor('u1', file(Buffer.from('%PDF-1.7 qualquer coisa'))),
    ).rejects.toMatchObject({
      status: 415,
      response: { error: { code: 'AVATAR_FORMAT' } },
    });
  });
});
