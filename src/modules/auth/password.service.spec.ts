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

  it('verifyAgainstNothing sempre falha e reaproveita o hash ficticio', async () => {
    const local = new PasswordService();
    const hashSpy = jest.spyOn(local, 'hash');
    expect(await local.verifyAgainstNothing('qualquer')).toBe(false);
    expect(await local.verifyAgainstNothing('outra')).toBe(false);
    expect(hashSpy).toHaveBeenCalledTimes(1);
  });
});
