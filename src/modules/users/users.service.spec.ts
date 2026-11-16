import { UsersService } from './users.service';
import { PasswordService } from '../auth/password.service';
import { ErrorCode } from '../../common/errors/error-code';

type AnyFn = (...args: unknown[]) => unknown;

function makePrisma(userFns: Record<string, AnyFn>) {
  return {
    user: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      ...userFns,
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    authSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
}

function makeTokens() {
  return {
    hashRefresh: jest.fn().mockImplementation((raw: string) => `hashed:${raw}`),
  };
}

function makeMapper() {
  return { toMeResponse: jest.fn((u: { id: string }) => ({ id: u.id })) };
}

describe('UsersService.changePassword', () => {
  const USER = { id: 'u1', email: 'a@b.com', passwordHash: 'old-hash' };

  it('recusa com CURRENT_PASSWORD_WRONG se a senha atual nao confere', async () => {
    const prisma = makePrisma({
      findUniqueOrThrow: jest.fn().mockResolvedValue(USER),
    });
    const passwords = new PasswordService();
    jest.spyOn(passwords, 'verify').mockResolvedValue(false);

    const svc = new UsersService(
      prisma as never,
      passwords,
      makeTokens() as never,
      makeMapper() as never,
    );

    await expect(
      svc.changePassword('u1', { currentPassword: 'x', newPassword: 'outra-senha' }, undefined),
    ).rejects.toMatchObject({ response: { error: { code: ErrorCode.CURRENT_PASSWORD_WRONG } } });
  });

  it('recusa com NEW_PASSWORD_SAME_AS_CURRENT se nova == atual', async () => {
    const prisma = makePrisma({
      findUniqueOrThrow: jest.fn().mockResolvedValue(USER),
    });
    const passwords = new PasswordService();
    jest.spyOn(passwords, 'verify').mockResolvedValue(true);

    const svc = new UsersService(
      prisma as never,
      passwords,
      makeTokens() as never,
      makeMapper() as never,
    );

    await expect(
      svc.changePassword('u1', { currentPassword: 'x', newPassword: 'x' }, undefined),
    ).rejects.toMatchObject({
      response: { error: { code: ErrorCode.NEW_PASSWORD_SAME_AS_CURRENT } },
    });
  });

  it('troca senha, grava passwordChangedAt e mantem a sessao atual', async () => {
    const prisma = makePrisma({
      findUniqueOrThrow: jest.fn().mockResolvedValue(USER),
    });
    const passwords = new PasswordService();
    jest
      .spyOn(passwords, 'verify')
      .mockResolvedValueOnce(true) // current ok
      .mockResolvedValueOnce(false); // nova != atual
    jest.spyOn(passwords, 'hash').mockResolvedValue('novo-hash');

    const tokens = makeTokens();
    const svc = new UsersService(prisma as never, passwords, tokens as never, makeMapper() as never);

    await svc.changePassword(
      'u1',
      { currentPassword: 'atual', newPassword: 'nova-senha-forte' },
      'refresh-raw',
    );

    expect(tokens.hashRefresh).toHaveBeenCalledWith('refresh-raw');
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('UsersService.updateMe', () => {
  it('ignora campos nao enviados e devolve o perfil atualizado', async () => {
    const prisma = makePrisma({
      update: jest.fn().mockResolvedValue({ id: 'u1', firstName: 'Davi' }),
    });
    const mapper = makeMapper();
    const svc = new UsersService(
      prisma as never,
      new PasswordService(),
      makeTokens() as never,
      mapper as never,
    );

    await svc.updateMe('u1', { firstName: 'Davi' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { firstName: 'Davi' } }),
    );
    expect(mapper.toMeResponse).toHaveBeenCalled();
  });
});
