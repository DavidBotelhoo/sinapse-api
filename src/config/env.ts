import { z } from 'zod';

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.length === 0 ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),

  WEB_URL: z.string().url().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().min(1).default('localhost'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET precisa de pelo menos 32 caracteres'),

  STORAGE_ENDPOINT: emptyToUndefined(z.string().url()),
  STORAGE_BUCKET: emptyToUndefined(z.string()),
  STORAGE_ACCESS_KEY: emptyToUndefined(z.string()),
  STORAGE_SECRET_KEY: emptyToUndefined(z.string()),
  STORAGE_PUBLIC_URL: emptyToUndefined(z.string().url()),

  MAIL_FROM: z.string().min(1).default('Sinapse <nao-responda@sinapse.app>'),
  SMTP_URL: z.string().min(1).default('smtp://localhost:1025'),

  BILLING_PROVIDER: z.enum(['fake']).default('fake'),
  BILLING_WEBHOOK_SECRET: emptyToUndefined(z.string()),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `- ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${formatted}`);
  }
  return result.data;
}
