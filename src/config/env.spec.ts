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

describe('validateEnv: storage', () => {
  const S3 = {
    ...BASE,
    STORAGE_DRIVER: 's3',
    STORAGE_BUCKET: 'sinapse',
    STORAGE_ACCESS_KEY: 'chave',
    STORAGE_SECRET_KEY: 'segredo',
  };

  it('padrao: disco, regiao auto e sem path style', () => {
    const env = validateEnv(BASE);
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.STORAGE_REGION).toBe('auto');
    expect(env.STORAGE_FORCE_PATH_STYLE).toBe(false);
  });

  it('s3 completo e valido', () => {
    expect(validateEnv(S3).STORAGE_DRIVER).toBe('s3');
  });

  it('s3 sem bucket: recusa', () => {
    expect(() => validateEnv({ ...S3, STORAGE_BUCKET: '' })).toThrow(/STORAGE_BUCKET/);
  });

  it('s3 com so uma das chaves: recusa', () => {
    expect(() => validateEnv({ ...S3, STORAGE_SECRET_KEY: '' })).toThrow(/STORAGE_SECRET_KEY/);
    expect(() => validateEnv({ ...S3, STORAGE_ACCESS_KEY: '' })).toThrow(/STORAGE_ACCESS_KEY/);
  });

  it('s3 sem nenhuma chave: aceita (papel IAM)', () => {
    expect(() =>
      validateEnv({ ...S3, STORAGE_ACCESS_KEY: '', STORAGE_SECRET_KEY: '' }),
    ).not.toThrow();
  });

  it('driver desconhecido: recusa', () => {
    expect(() => validateEnv({ ...BASE, STORAGE_DRIVER: 'gcs' })).toThrow(/STORAGE_DRIVER/);
  });

  it('producao sem STORAGE_PUBLIC_URL: recusa (avatarUrl apontaria para localhost)', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/STORAGE_PUBLIC_URL/);
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        STORAGE_PUBLIC_URL: 'https://api.sinapse.app/uploads',
      }),
    ).not.toThrow();
  });
});
