import { z } from 'zod';

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.length === 0 ? undefined : v), schema.optional());

// "true"/"false" vindos do ambiente (z.coerce.boolean trataria "false" como true).
const envBoolean = (fallback: boolean) =>
  z.preprocess((v) => {
    if (typeof v !== 'string' || v.length === 0) return undefined;
    return v.toLowerCase() === 'true' || v === '1';
  }, z.boolean().default(fallback));

// Inteiro do ambiente com valor padrao ("" ou ausente = padrao).
const envInt = (schema: z.ZodNumber, fallback: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v),
    z.coerce.number().pipe(schema).default(fallback),
  );

// Lista de pesos do FSRS separada por virgula ("0.40255,1.18385,..."). Vazio = padrao do ts-fsrs.
const numberList = z.preprocess(
  (v) =>
    typeof v === 'string' && v.trim().length > 0
      ? v.split(',').map((part) => Number(part.trim()))
      : undefined,
  z.array(z.number().finite()).min(1).optional(),
);

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

  // Assinatura. Precos em centavos vem SO da configuracao (decisao em aberto 3); sem padrao
  // no codigo de proposito: a API nao sobe sem eles.
  BILLING_PROVIDER: z.enum(['fake']).default('fake'),
  BILLING_WEBHOOK_SECRET: z
    .string()
    .min(32, 'BILLING_WEBHOOK_SECRET precisa de pelo menos 32 caracteres (openssl rand -hex 32)'),
  BILLING_PRICE_MONTHLY_CENTS: z.coerce
    .number()
    .int()
    .positive('BILLING_PRICE_MONTHLY_CENTS: preco do plano mensal em centavos'),
  BILLING_PRICE_YEARLY_CENTS: z.coerce
    .number()
    .int()
    .positive('BILLING_PRICE_YEARLY_CENTS: preco do plano anual em centavos'),
  BILLING_TRIAL_DAYS: envInt(z.number().int().min(0).max(90), 7),
  BILLING_GRACE_DAYS: envInt(z.number().int().min(0).max(30), 5),

  // Parametros do FSRS (ts-fsrs). Os padroes sao os da biblioteca; ficam aqui para otimizar depois.
  FSRS_REQUEST_RETENTION: emptyToUndefined(z.coerce.number().gt(0).lt(1)),
  FSRS_MAXIMUM_INTERVAL: emptyToUndefined(z.coerce.number().int().positive()),
  FSRS_ENABLE_FUZZ: envBoolean(false),
  FSRS_WEIGHTS: numberList,
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
