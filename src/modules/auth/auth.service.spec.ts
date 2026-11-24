import type { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import type { Env } from '../../config/env';

type AnyFn = (...args: unknown[]) => unknown;

function makeConfig(): ConfigService<Env, true> {
  return {
    get: (key: string) =>
      ({ WEB_URL: 'http://localhost:3000', BILLING_TRIAL_DAYS: 7 })[key] as unknown,
  } as unknown as ConfigService<Env, true>;
}

function makePrisma(user: Record<string, AnyFn> = {}, passwordReset: Record<string, AnyFn> = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      ...user,
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    passwordReset: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...passwordReset,
    },
    authSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  // Transacao interativa (callback) ou em lote (lista): o "tx" e o proprio mock.
  return {
    ...prisma,
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
        : Promise.all(arg as Array<Promise<unknown>>),
    ),
  };
}

function makeTokens() {
  return {
    issueFor: jest.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      refreshExpiresAt: new Date(Date.now() + 1_000_000),
    }),
    revokeByRefresh: jest.fn().mockResolvedValue(undefined),
    rotateRefresh: jest.fn(),
  };
}

function makeMail() {
  return { enqueuePasswordReset: jest.fn().mockResolvedValue(undefined) };
}

function makeUserMapper() {
  return { toMeResponse: jest.fn((u: { id: string }) => ({ id: u.id, email: 'x' })) };
}

const ctx = { userAgent: null, ip: null };

describe('AuthService', () => {
  describe('register', () => {
    it('recusa com EMAIL_ALREADY_REGISTERED se email ja existe', async () => {
      const prisma = makePrisma({
        findUnique: jest.fn().mockResolvedValue({ id: 'u1' }),
      });
      const svc = new AuthService(
        prisma as never,
        new PasswordService(),
        makeTokens() as never,
        makeUserMapper() as never,
        makeMail() as never,
        makeConfig(),
      );

      await expect(
        svc.register(
          { firstName: 'A', lastName: 'B', email: 'a@b.com', password: 'uma-senha-forte' },
          ctx,
        ),
      ).rejects.toMatchObject({
        response: { error: { code: ErrorCode.EMAIL_ALREADY_REGISTERED } },
      });
    });

    it('cria usuario, emite tokens e devolve MeResponseDto', async () => {
      const prisma = makePrisma({
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com' }),
      });
      const passwords = new PasswordService();
      jest.spyOn(passwords, 'hash').mockResolvedValue('hash-ok');
      const tokens = makeTokens();

      const svc = new AuthService(
        prisma as never,
        passwords,
        tokens as never,
        makeUserMapper() as never,
        makeMail() as never,
        makeConfig(),
      );

      const result = await svc.register(
        { firstName: 'A', lastName: 'B', email: 'a@b.com', password: 'uma-senha-forte' },
        ctx,
      );
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscription: {
              create: {
                provider: 'none',
                status: 'TRIALING',
                trialEndsAt: expect.any(Date),
              },
            },
          }),
        }),
      );
      const trialEndsAt = (
        prisma.user.create.mock.calls[0] as [
          { data: { subscription: { create: { trialEndsAt: Date } } } },
        ]
      )[0].data.subscription.create.trialEndsAt;
      const days = (trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThanOrEqual(7);
      expect(tokens.issueFor).toHaveBeenCalledWith('u1', 'a@b.com', ctx);
      expect(result.user.id).toBe('u1');
    });
  });

  describe('login', () => {
    it('joga INVALID_CREDENTIALS se usuario nao existe, conferindo uma senha mesmo assim', async () => {
      const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(null) });
      const passwords = new PasswordService();
      // Mesmo trabalho de um login com senha errada: o tempo nao revela se o email tem conta.
      const dummy = jest.spyOn(passwords, 'verifyAgainstNothing').mockResolvedValue(false);
      const svc = new AuthService(
        prisma as never,
        passwords,
        makeTokens() as never,
        makeUserMapper() as never,
        makeMail() as never,
        makeConfig(),
      );
      await expect(
        svc.login({ email: 'nao@existe.com', password: 'qualquer' }, ctx),
      ).rejects.toMatchObject({ response: { error: { code: ErrorCode.INVALID_CREDENTIALS } } });
      expect(dummy).toHaveBeenCalledWith('qualquer');
    });

    it('joga INVALID_CREDENTIALS se senha nao bate', async () => {
      const prisma = makePrisma({
        findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: 'h' }),
      });
      const passwords = new PasswordService();
      jest.spyOn(passwords, 'verify').mockResolvedValue(false);

      const svc = new AuthService(
        prisma as never,
        passwords,
        makeTokens() as never,
        makeUserMapper() as never,
        makeMail() as never,
        makeConfig(),
      );
      await expect(svc.login({ email: 'a@b.com', password: 'errada' }, ctx)).rejects.toMatchObject({
        response: { error: { code: ErrorCode.INVALID_CREDENTIALS } },
      });
    });
  });

  describe('forgotPassword', () => {
    it('resposta uniforme (nao joga) quando email nao existe', async () => {
      const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(null) });
      const mail = makeMail();
      const svc = new AuthService(
        prisma as never,
        new PasswordService(),
        makeTokens() as never,
        makeUserMapper() as never,
        mail as never,
        makeConfig(),
      );
      await expect(svc.forgotPassword({ email: 'ninguem@x.com' })).resolves.toBeUndefined();
      expect(mail.enqueuePasswordReset).not.toHaveBeenCalled();
    });

    it('enfileira email quando usuario existe', async () => {
      const prisma = makePrisma({
        findUnique: jest.fn().mockResolvedValue({ id: 'u1', firstName: 'Davi', email: 'a@b.com' }),
      });
      const mail = makeMail();
      const svc = new AuthService(
        prisma as never,
        new PasswordService(),
        makeTokens() as never,
        makeUserMapper() as never,
        mail as never,
        makeConfig(),
      );
      await svc.forgotPassword({ email: 'a@b.com' });
      expect(prisma.passwordReset.create).toHaveBeenCalled();
      // Sem o nome: o email nao leva nada digitado pelo usuario.
      expect(mail.enqueuePasswordReset).toHaveBeenCalledWith({
        to: 'a@b.com',
        resetUrl: expect.stringContaining('/redefinir-senha?token='),
      });
    });
  });

  describe('resetPassword', () => {
    it('joga INVALID_RESET_TOKEN quando token nao existe', async () => {
      const prisma = makePrisma({}, { findUnique: jest.fn().mockResolvedValue(null) });
      const svc = new AuthService(
        prisma as never,
        new PasswordService(),
        makeTokens() as never,
        makeUserMapper() as never,
        makeMail() as never,
        makeConfig(),
      );
      await expect(
        svc.resetPassword({ token: 'x', password: 'nova-senha-forte' }),
      ).rejects.toMatchObject({ response: { error: { code: ErrorCode.INVALID_RESET_TOKEN } } });
    });

    it('joga INVALID_RESET_TOKEN quando token ja usado', async () => {
      const prisma = makePrisma(
        {},
        {
          findUnique: jest.fn().mockResolvedValue({
            id: 'r1',
            userId: 'u1',
            tokenHash: 'h',
            usedAt: new Date(),
            expiresAt: new Date(Date.now() + 100000),
          }),
        },
      );
      const svc = new AuthService(
        prisma as never,
        new PasswordService(),
        makeTokens() as never,
        makeUserMapper() as never,
        makeMail() as never,
        makeConfig(),
      );
      await expect(
        svc.resetPassword({ token: 'x', password: 'nova-senha-forte' }),
      ).rejects.toMatchObject({ response: { error: { code: ErrorCode.INVALID_RESET_TOKEN } } });
    });

    it('joga INVALID_RESET_TOKEN quando token expirou', async () => {
      const prisma = makePrisma(
        {},
        {
          findUnique: jest.fn().mockResolvedValue({
            id: 'r1',
            userId: 'u1',
            tokenHash: 'h',
            usedAt: null,
            expiresAt: new Date(Date.now() - 1000),
          }),
        },
      );
      const svc = new AuthService(
        prisma as never,
        new PasswordService(),
        makeTokens() as never,
        makeUserMapper() as never,
        makeMail() as never,
        makeConfig(),
      );
      await expect(
        svc.resetPassword({ token: 'x', password: 'nova-senha-forte' }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('troca senha, marca token como usado e revoga sessoes', async () => {
      const prisma = makePrisma(
        {},
        {
          findUnique: jest.fn().mockResolvedValue({
            id: 'r1',
            userId: 'u1',
            tokenHash: 'h',
            usedAt: null,
            expiresAt: new Date(Date.now() + 100000),
          }),
        },
      );
      const passwords = new PasswordService();
      jest.spyOn(passwords, 'hash').mockResolvedValue('novo-hash');

      const svc = new AuthService(
        prisma as never,
        passwords,
        makeTokens() as never,
        makeUserMapper() as never,
        makeMail() as never,
        makeConfig(),
      );
      await svc.resetPassword({ token: 'x', password: 'nova-senha-forte' });
      expect(prisma.passwordReset.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'r1', usedAt: null }) }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
      expect(prisma.authSession.updateMany).toHaveBeenCalled();
    });

    it('mesmo link usado duas vezes ao mesmo tempo: so o primeiro troca a senha', async () => {
      const prisma = makePrisma(
        {},
        {
          findUnique: jest.fn().mockResolvedValue({
            id: 'r1',
            userId: 'u1',
            tokenHash: 'h',
            usedAt: null,
            expiresAt: new Date(Date.now() + 100000),
          }),
          // O outro pedido marcou o token entre a leitura e a transacao.
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      );
      const passwords = new PasswordService();
      jest.spyOn(passwords, 'hash').mockResolvedValue('novo-hash');
      const svc = new AuthService(
        prisma as never,
        passwords,
        makeTokens() as never,
        makeUserMapper() as never,
        makeMail() as never,
        makeConfig(),
      );
      await expect(
        svc.resetPassword({ token: 'x', password: 'nova-senha-forte' }),
      ).rejects.toMatchObject({ response: { error: { code: ErrorCode.INVALID_RESET_TOKEN } } });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
