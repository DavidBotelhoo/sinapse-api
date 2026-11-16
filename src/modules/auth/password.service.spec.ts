import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hash e verify fazem round-trip', async () => {
    const digest = await svc.hash('senha-super-segura');
    expect(digest).toMatch(/^\$argon2id\$/);
    expect(await svc.verify(digest, 'senha-super-segura')).toBe(true);
    expect(await svc.verify(digest, 'outra-senha')).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (salt aleatorio)', async () => {
    const a = await svc.hash('mesma-senha');
    const b = await svc.hash('mesma-senha');
    expect(a).not.toBe(b);
  });
});
