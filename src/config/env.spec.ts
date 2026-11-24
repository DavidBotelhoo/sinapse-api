import { validateEnv } from './env';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  BILLING_WEBHOOK_SECRET: 'y'.repeat(32),
  BILLING_PRICE_MONTHLY_CENTS: '2990',
  BILLING_PRICE_YEARLY_CENTS: '29900',
};

describe('validateEnv: TRUST_PROXY', () => {
  it('desligado (0) quando ausente ou vazio', () => {
    expect(validateEnv(BASE).TRUST_PROXY).toBe(0);
    expect(validateEnv({ ...BASE, TRUST_PROXY: '' }).TRUST_PROXY).toBe(0);
  });

  it('numero de proxies na frente da API', () => {
    expect(validateEnv({ ...BASE, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
  });

  it('recusa valor que nao e numero de proxies', () => {
    expect(() => validateEnv({ ...BASE, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => validateEnv({ ...BASE, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
  });
});
