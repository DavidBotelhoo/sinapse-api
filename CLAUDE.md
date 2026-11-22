# Sinapse — API (sinapse-api)

API do Sinapse, um app de flashcards por assinatura para estudantes (começando por Medicina). O front fica em outro repositório (`sinapse-web`, Next.js) e consome esta API pelo contrato OpenAPI que ela publica.

Antes de qualquer tarefa, leia:

1. `docs/produto.md`: o que o app faz, tela por tela, e as **decisões em aberto** (confirme antes de implementar a parte afetada). As telas aprovadas (PNG, SVG e HTML) estão no repositório do front, em `docs/telas/`: o que cada tela mostra é o que a API precisa devolver.
2. `docs/dominio.md`: modelo de dados, endpoints, cálculos e fluxos.
3. `docs/schema.prisma`: rascunho do schema (já validado), ponto de partida do `prisma/schema.prisma`.

## Stack

- **NestJS** (versão estável atual) + **TypeScript** em modo `strict`. Node 24 LTS (mínimo 20.19).
- **PostgreSQL 16+** com **Prisma 7** (use a versão estável 7.x; não use o 8 enquanto for RC). No Prisma 7: gerador `prisma-client` com `output` explícito, URL do banco em `prisma.config.ts` e driver adapter `@prisma/adapter-pg`.
- **Redis** + **BullMQ** via `@nestjs/bullmq` (filas `imports` e `mail`).
- **Contrato:** `@nestjs/swagger` com o plugin da CLI. OpenAPI em `/docs` (UI) e `/docs-json`. **O OpenAPI é o contrato com o front**: toda rota declara o DTO de resposta e os erros.
- **Validação:** `class-validator` + `class-transformer`, com `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`).
- **Autenticação:** `@nestjs/jwt`, senhas com `argon2`, `@nestjs/throttler` nas rotas `/auth/*`.
- **Configuração:** `@nestjs/config`, com as variáveis de ambiente validadas por `zod` na inicialização.
- **Repetição espaçada:** `ts-fsrs`.
- **Arquivos:** `@aws-sdk/client-s3` (Cloudflare R2 ou S3). Imagens com `sharp`.
- **Leitura de arquivos:** `unpdf` (ou `pdf-parse`) para PDF e `mammoth` para DOCX.
- **Logs:** `nestjs-pino`.
- **Testes:** Jest (padrão do Nest) e e2e com `supertest` num Postgres de teste.
- **Gerenciador de pacotes:** pnpm.

## Estrutura

```
src/
  main.ts                 bootstrap: prefixo /v1, CORS, cookies, ValidationPipe, Swagger
  app.module.ts
  config/                 schema zod das variáveis de ambiente
  prisma/                 PrismaService (PrismaClient + adapter pg)
  common/                 guards, decorators (@CurrentUser), filtro de erro, paginação por cursor
  modules/
    auth/                 register, login, refresh, logout, forgot/reset password
    users/                /me, avatar, senha
    catalog/              cursos e matérias
    decks/                decks, cards (edição na página do deck), favoritos, salvos, denúncias
    community/            listagem pública e prévia de 6 cards
    imports/              upload + processor da fila "imports"
    study/                visão de hoje, sessões (limite e ordem), reviews, FSRS
    stats/                /me/stats e /me/agenda
    billing/              BillingProvider, checkout, portal, webhook, histórico de cobranças
    storage/              cliente S3/R2
    mail/                 MailProvider + processor da fila "mail"
  generated/prisma/       cliente gerado pelo Prisma (não editar)
prisma/
  schema.prisma
  migrations/
  seed.ts                 curso Medicina (6 anos) e as matérias
prisma.config.ts
test/                     e2e
docker-compose.yml        postgres, redis, mailpit
```

## Convenções

- REST com prefixo `/v1`. JSON em camelCase, datas em ISO-8601 UTC, IDs UUID.
- Listas paginadas por cursor: `{ items, nextCursor }`.
- Erros sempre no formato `{ error: { code, message, fields? } }`, com `code` em MAIÚSCULAS_COM_UNDERLINE e `message` em português, pronta para o usuário. Um filtro global converte as exceções.
- Controllers finos; a regra de negócio fica nos services. Toda consulta é filtrada pelo usuário logado. Recurso privado de outro usuário responde 404.
- Datas de negócio (streak, semana, agenda) calculadas no `timezone` do usuário. Semana de segunda a domingo.
- Na Comunidade, o dono do deck é só `{ firstName, avatarUrl }`. Nunca devolva sobrenome nem email de outra pessoa.
- Nada de lógica de assinatura no front: o status vem do webhook.

## Autenticação

- Dois cookies `httpOnly`, `Secure`, `SameSite=Lax`, com `Domain=${COOKIE_DOMAIN}` (o domínio pai, para o front em `app`/raiz e a API em `api.`):
  - `sn_access`: JWT de 15 minutos.
  - `sn_refresh`: 30 dias, opaco. Guarde só o hash em `AuthSession`, troque a cada uso e, se um token já usado aparecer de novo, revogue a sessão inteira.
- CORS liberado só para `WEB_URL`, com `credentials: true`. Em métodos que não são GET, confira o cabeçalho `Origin` (proteção CSRF).
- Recuperação de senha: token aleatório de uso único, válido por 1 hora, guardado como hash. O endpoint de pedido sempre responde 204.

## Variáveis de ambiente

```
NODE_ENV=development
PORT=3333
WEB_URL=http://localhost:3000
COOKIE_DOMAIN=localhost
DATABASE_URL=postgresql://sinapse:sinapse@localhost:5432/sinapse
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=
STORAGE_ENDPOINT=  STORAGE_BUCKET=  STORAGE_ACCESS_KEY=  STORAGE_SECRET_KEY=  STORAGE_PUBLIC_URL=
MAIL_FROM="Sinapse <nao-responda@sinapse.app>"   SMTP_URL=smtp://localhost:1025
BILLING_PROVIDER=fake   BILLING_WEBHOOK_SECRET=            # segredo: obrigatório, mínimo 32 caracteres
BILLING_PRICE_MONTHLY_CENTS=   BILLING_PRICE_YEARLY_CENTS=  # obrigatórios, em centavos (sem padrão no código)
BILLING_TRIAL_DAYS=7   BILLING_GRACE_DAYS=5                # teste grátis no cadastro; prazo para trocar o cartão
FSRS_REQUEST_RETENTION=  FSRS_MAXIMUM_INTERVAL=  FSRS_ENABLE_FUZZ=false  FSRS_WEIGHTS=   # opcionais; vazio = padrão do ts-fsrs
```

## Comandos

```
docker compose up -d        # postgres, redis, mailpit
pnpm prisma migrate dev     # migrations
pnpm prisma db seed         # Medicina + matérias
pnpm start:dev              # API em http://localhost:3333 (docs em /docs)
pnpm lint
pnpm test                   # unitários
pnpm test:e2e               # e2e
pnpm users:set-role <email> <USER|ADMIN|SUPER_ADMIN>   # papel da conta (ADMIN e SUPER_ADMIN: acesso vitalício)
pnpm billing:simulate <email> <aprovado|recusado|cancelado|teste-terminado> [--plano mensal|anual] [--dias-atras N]
                            # só em dev, com a API rodando: evento assinado do provedor de teste
```

## Como trabalhar

- Antes de terminar qualquer tarefa: `pnpm lint`, `pnpm test` e, se mexeu em rotas, abra `/docs-json` e confira se o contrato reflete a mudança.
- Mudou um endpoint ou DTO? Avise no PR: o front precisa rodar `pnpm api:types`.
- Teste unitário obrigatório para: mapeamento das notas para o FSRS, streak (inclusive virada de dia e fuso), taxa de acerto, situação de cada card e domínio do deck, montagem da sessão (limite e ordem), extração de pares do arquivo importado.
- Ordem sugerida: setup (Nest, Prisma, docker, config) → schema + seed → auth → `/me` → catálogo → decks e cards → importação → estudo + FSRS → estatísticas e agenda → comunidade e denúncias → assinatura e cobranças (com o provider fake até o gateway ser escolhido).
- Ao chegar numa decisão em aberto de `docs/produto.md`, pergunte antes de implementar; se precisar seguir, use a recomendação registrada e deixe isso explícito.
