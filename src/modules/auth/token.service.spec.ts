import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { TokenService } from './token.service';
import type { Env } from '../../config/env';
import { AppException } from '../../common/errors/app.exception';

type AnyFn = (...args: unknown[]) => unknown;

function makeConfig(): ConfigService<Env, true> {
  return {
    get: (key: string) => (key === 'JWT_ACCESS_SECRET' ? 'x'.repeat(32) : undefined),
  } as unknown as ConfigService<Env, true>;
}

function makePrisma(overrides: Record<string, Record<string, AnyFn>> = {}) {
  return {
    authSession: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...(overrides.authSession ?? {}),
    },
    $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
}

describe('TokenService', () => {
  const jwt = new JwtService();
  const ctx = { userAgent: 'jest', ip: '127.0.0.1' };

  it('issueFor cria AuthSession e devolve access + refresh', async () => {
    const prisma = makePrisma();
    const svc = new TokenService(jwt, prisma as never, makeConfig());

    const result = await svc.issueFor('u1', 'a@b.com', ctx);

    expect(result.accessToken).toMatch(/^eyJ/);
    expect(result.refreshToken.length).toBeGreaterThan(40);
    expect(prisma.authSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1' }) }),
    );
  });

  it('rotateRefresh rotaciona e devolve novos tokens', async () => {
    const existing = {
      id: 's1',
      userId: 'u1',
      refreshTokenHash: 'hash-valido',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1_000_000),
      user: { id: 'u1', email: 'a@b.com' },
    };
    const prisma = makePrisma({
      authSession: { findUnique: jest.fn().mockResolvedValue(existing) },
    });
    const svc = new TokenService(jwt, prisma as never, makeConfig());

    const result = await svc.rotateRefresh('token-raw', ctx);

    expect(result.accessToken).toMatch(/^eyJ/);
    expect(result.refreshToken).toBeTruthy();
    expect(result.email).toBe('a@b.com');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rotateRefresh detecta reuso e revoga toda a cadeia do usuario', async () => {
    const reusedSession = {
      id: 's1',
      userId: 'u1',
      refreshTokenHash: 'hash',
      revokedAt: new Date(), // ja revogado
      expiresAt: new Date(Date.now() + 1_000_000),
      user: { id: 'u1', email: 'a@b.com' },
    };
    const prisma = makePrisma({
      authSession: { findUnique: jest.fn().mockResolvedValue(reusedSession) },
    });
    const svc = new TokenService(jwt, prisma as never, makeConfig());

    await expect(svc.rotateRefresh('token-raw', ctx)).rejects.toBeInstanceOf(AppException);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1', revokedAt: null }),
      }),
    );
  });

  it('rotateRefresh falha com 401 se sessao nao existe', async () => {
    const prisma = makePrisma({
      authSession: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const svc = new TokenService(jwt, prisma as never, makeConfig());

    await expect(svc.rotateRefresh('qualquer', ctx)).rejects.toBeInstanceOf(AppException);
  });

  it('rotateRefresh revoga sessao expirada e devolve 401', async () => {
    const expired = {
      id: 's1',
      userId: 'u1',
      refreshTokenHash: 'h',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'u1', email: 'a@b.com' },
    };
    const prisma = makePrisma({
      authSession: { findUnique: jest.fn().mockResolvedValue(expired) },
    });
    const svc = new TokenService(jwt, prisma as never, makeConfig());

    await expect(svc.rotateRefresh('token-raw', ctx)).rejects.toBeInstanceOf(AppException);
    expect(prisma.authSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } }),
    );
  });

  it('verifyAccess devolve o payload para um JWT valido', async () => {
    const prisma = makePrisma();
    const svc = new TokenService(jwt, prisma as never, makeConfig());
    const issued = await svc.issueFor('u1', 'a@b.com', ctx);

    const payload = await svc.verifyAccess(issued.accessToken);
    expect(payload.sub).toBe('u1');
    expect(payload.email).toBe('a@b.com');
  });

  it('verifyAccess joga 401 para JWT invalido', async () => {
    const prisma = makePrisma();
    const svc = new TokenService(jwt, prisma as never, makeConfig());
    await expect(svc.verifyAccess('nao-eh-jwt')).rejects.toBeInstanceOf(AppException);
  });
});
