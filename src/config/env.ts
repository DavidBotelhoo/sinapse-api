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

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),

  WEB_URL: z.string().url().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().min(1).default('localhost'),

  // Quantos proxies confiaveis ficam na frente da API (load balancer, CDN). 0 = nenhum: o IP
  // do cliente e o da conexao. Com 1, vem do X-Forwarded-For. Nao ligue sem proxy na frente:
  // qualquer um poderia mandar o cabecalho e escapar dos limites de requisicao.
  TRUST_PROXY: envInt(z.number().int().min(0).max(10), 0),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET precisa de pelo menos 32 caracteres'),

  // Onde ficam os arquivos (fotos de perfil e PDFs/Word importados).
  // - local: pasta uploads/ no disco da maquina. So para dev ou uma instancia com disco que
  //   nao se apaga a cada deploy.
  // - s3: bucket S3 ou compativel (Cloudflare R2, MinIO). O bucket fica PRIVADO: a API serve
  //   as fotos em /uploads/avatars e os arquivos importados nunca saem dela.
  STORAGE_DRIVER: z.preprocess(
    (v) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v),
    z.enum(['local', 's3']).default('local'),
  ),
  // R2: https://<account-id>.r2.cloudflarestorage.com. AWS S3: vazio (usa a regiao).
  STORAGE_ENDPOINT: emptyToUndefined(z.string().url()),
  // R2 usa "auto"; no AWS S3, a regiao do bucket (ex. sa-east-1).
  STORAGE_REGION: z.preprocess(
    (v) => (typeof v === 'string' && v.trim().length === 0 ? undefined : v),
    z.string().min(1).default('auto'),
  ),
  STORAGE_BUCKET: emptyToUndefined(z.string()),
  STORAGE_ACCESS_KEY: emptyToUndefined(z.string()),
  STORAGE_SECRET_KEY: emptyToUndefined(z.string()),
  // MinIO e alguns compativeis pedem o bucket no caminho da URL, nao no subdominio.
  STORAGE_FORCE_PATH_STYLE: envBoolean(false),
  // URL publica de /uploads da API (ex. https://api.sinapse.app/uploads). E a base do
  // avatarUrl devolvido ao front. Vazio = http://localhost:PORT/uploads (so serve em dev).
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

// Regras que dependem de mais de uma variavel.
const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.STORAGE_DRIVER === 's3') {
    if (!env.STORAGE_BUCKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_BUCKET'],
        message: 'obrigatória com STORAGE_DRIVER=s3 (nome do bucket)',
      });
    }
    // As duas juntas ou nenhuma (sem nenhuma, vale a cadeia padrao da AWS: papel IAM etc.).
    if (Boolean(env.STORAGE_ACCESS_KEY) !== Boolean(env.STORAGE_SECRET_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.STORAGE_ACCESS_KEY ? 'STORAGE_SECRET_KEY' : 'STORAGE_ACCESS_KEY'],
        message: 'STORAGE_ACCESS_KEY e STORAGE_SECRET_KEY vão juntas',
      });
    }
  }
  // Sem ela, o avatarUrl apontaria para localhost.
  if (env.NODE_ENV === 'production' && !env.STORAGE_PUBLIC_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['STORAGE_PUBLIC_URL'],
      message: 'obrigatória em produção (ex. https://api.sinapse.app/uploads)',
    });
  }
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
