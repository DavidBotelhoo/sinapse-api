# Sinapse API

API do Sinapse, app de flashcards por assinatura para estudantes de Medicina. NestJS + PostgreSQL (Prisma 7) + Redis (BullMQ). O front (`sinapse-web`) consome o contrato OpenAPI publicado em `/docs-json`.

## Requisitos

- Node 24 LTS (mínimo 20.19) e pnpm 9
- Docker (Postgres 16, Redis 7 e Mailpit pelo `docker-compose.yml`)

## Subir do zero

```bash
pnpm install
cp .env.example .env
# troque JWT_ACCESS_SECRET e BILLING_WEBHOOK_SECRET por valores seus:
openssl rand -hex 32

docker compose up -d        # postgres :5432, redis :6379, mailpit :1025 (UI em http://localhost:8025)
pnpm prisma generate        # cliente do Prisma em src/generated/prisma (não vai para o git)
pnpm prisma migrate dev     # cria as tabelas
pnpm prisma db seed         # curso Medicina (6 anos) e as matérias
pnpm start:dev              # API em http://localhost:3333/v1, docs em http://localhost:3333/docs
```

Para conferir: `curl http://localhost:3333/v1/health` responde `{"status":"ok",...}`.

Os emails de desenvolvimento (redefinição de senha) chegam no Mailpit. Para dar acesso vitalício a uma conta sua: `pnpm users:set-role voce@exemplo.com SUPER_ADMIN`.

## Variáveis de ambiente

A API valida tudo na inicialização (`src/config/env.ts`) e não sobe se faltar algo obrigatório. O `.env.example` tem valores que funcionam em desenvolvimento.

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` ou `production` (cookies `Secure` só em produção) |
| `PORT` | `3333` | Porta HTTP |
| `WEB_URL` | `http://localhost:3000` | Origem do front: CORS, conferência do `Origin` (CSRF) e links dos emails |
| `COOKIE_DOMAIN` | `localhost` | Domínio dos cookies de sessão (em produção, o domínio pai do front e da API) |
| `TRUST_PROXY` | `0` | Quantos proxies confiáveis ficam na frente da API (load balancer, CDN). Com `1`, o IP do cliente vem do `X-Forwarded-For`. Deixe `0` sem proxy |
| `DATABASE_URL` | obrigatória | Postgres |
| `REDIS_URL` | obrigatória | Redis (filas `imports` e `mail`) |
| `JWT_ACCESS_SECRET` | obrigatória | Assinatura do cookie de acesso, mínimo de 32 caracteres |
| `STORAGE_PUBLIC_URL` | `http://localhost:{PORT}/uploads` | URL pública das fotos de perfil |
| `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | vazias | Reservadas para o R2/S3 (ainda não usadas, veja abaixo) |
| `MAIL_FROM` | `Sinapse <nao-responda@sinapse.app>` | Remetente |
| `SMTP_URL` | `smtp://localhost:1025` | Servidor de email (Mailpit em desenvolvimento) |
| `BILLING_PROVIDER` | `fake` | Gateway de pagamento. Por enquanto só o provedor de teste |
| `BILLING_WEBHOOK_SECRET` | obrigatória | Segredo da assinatura do webhook, mínimo de 32 caracteres |
| `BILLING_PRICE_MONTHLY_CENTS`, `BILLING_PRICE_YEARLY_CENTS` | obrigatórias | Preços em centavos |
| `BILLING_TRIAL_DAYS` | `7` | Dias de teste grátis no cadastro |
| `BILLING_GRACE_DAYS` | `5` | Prazo para trocar o cartão depois de um pagamento recusado |
| `FSRS_REQUEST_RETENTION`, `FSRS_MAXIMUM_INTERVAL`, `FSRS_ENABLE_FUZZ`, `FSRS_WEIGHTS` | padrão do ts-fsrs | Parâmetros da repetição espaçada |

**Arquivos:** por enquanto o storage é só em disco, na pasta `uploads/`. As fotos de perfil ficam públicas em `/uploads/avatars`; os arquivos importados (PDF/Word) não são servidos e saem do disco quando viram cards ou depois de 24 h. O cliente R2/S3 ainda não existe. Em produção, com mais de uma instância ou disco temporário, ele precisa ser implementado antes (a interface é `StorageService`).

## Comandos

```bash
pnpm start:dev              # API com recarga automática
pnpm build && pnpm start:prod
pnpm lint
pnpm test                   # unitários
pnpm test:e2e               # e2e (veja abaixo)
pnpm prisma migrate dev     # nova migration em desenvolvimento
pnpm prisma migrate deploy  # aplica as migrations em produção
pnpm prisma studio          # navegar no banco
pnpm users:set-role <email> <USER|ADMIN|SUPER_ADMIN>   # ADMIN e SUPER_ADMIN têm acesso vitalício
pnpm billing:simulate <email> <aprovado|recusado|cancelado|teste-terminado> [--plano mensal|anual] [--dias-atras N]
                            # só em dev, com a API rodando: evento assinado do provedor de teste
```

**Testes e2e:** sobem a API inteira contra o banco do `DATABASE_URL` e o Redis do `.env` (os do `docker compose`). Cada teste cria contas próprias (`...@test.sinapse.local`) e apaga tudo no fim. Rode com o banco migrado e o seed aplicado.

## Contrato com o front

`/docs` (interface) e `/docs-json` (OpenAPI). Toda rota declara o DTO de resposta e os erros, sempre no formato `{ "error": { "code", "message", "fields"? } }`, com `message` em português pronta para mostrar. Mudou rota ou DTO: o front roda `pnpm api:types`.

Mais detalhes em `CLAUDE.md` e `docs/` (produto, domínio e schema).
