# Sinapse — domínio da API

Complementa `docs/produto.md` com o que a API precisa saber: modelo de dados, endpoints, cálculos e fluxos. O rascunho do schema está em `docs/schema.prisma` (validado no Prisma 7.10).

## Modelo de dados

| Entidade | Para quê |
| --- | --- |
| `User` | Nome, sobrenome, email, senha (hash argon2) e data da última troca, avatar, tema, fuso horário, curso |
| `Course`, `Subject` | Catálogo: Medicina (6 anos) e as matérias dela. Preparado para outros cursos |
| `Deck` | Dono, curso, ano, nome, visibilidade (`PRIVATE`/`PUBLIC`), contadores desnormalizados, data da última mudança de conteúdo, ocultação por moderação |
| `DeckSubject` | Matérias do deck (uma ou mais) |
| `Card` | Pergunta, resposta, posição |
| `DeckSave` | Deck da comunidade salvo (aba "Da comunidade") |
| `DeckFavorite` | Deck favoritado (aba "Favoritos") |
| `CardState` | Estado FSRS **por usuário e por card**: `due`, estabilidade, dificuldade, repetições… |
| `ReviewLog` | Cada avaliação: nota, tempo gasto, quando. Base de todas as estatísticas |
| `StudySession` | Uma sessão: decks/matérias escolhidos, limite e ordem pedidos, ordem dos cards, contagem por nota |
| `ImportJob` | Importação de PDF/Word: arquivo, status, pares encontrados |
| `Subscription`, `BillingEvent`, `Invoice` | Assinatura (status vindo do gateway), eventos de webhook (idempotência) e cobranças (histórico de pagamentos) |
| `DeckReport` | Denúncia de um deck da comunidade ("Denunciar deck") |
| `AuthSession`, `PasswordReset` | Tokens de renovação (só o hash) e redefinição de senha |

## Endpoints (prefixo `/v1`)

Todos retornam JSON em camelCase, com datas em ISO-8601 UTC e IDs UUID. Listas usam cursor: `{ items, nextCursor }`.

**Autenticação**

| Método e rota | O que faz |
| --- | --- |
| `POST /auth/register` | firstName, lastName, email, password → cria o usuário e já entra (grava os cookies) |
| `POST /auth/login` | email, password → grava os cookies. Erro genérico: `INVALID_CREDENTIALS` |
| `POST /auth/refresh` | Troca o cookie de renovação (rotação com detecção de reuso) |
| `POST /auth/logout` | Revoga a sessão e apaga os cookies |
| `POST /auth/forgot-password` | Sempre responde 204, exista o email ou não |
| `POST /auth/reset-password` | token + nova senha |

**Usuário**

| Método e rota | O que faz |
| --- | --- |
| `GET /me` | Perfil (sem o hash da senha), `passwordChangedAt` + resumo da assinatura |
| `PATCH /me` | firstName, lastName, theme, timezone |
| `POST /me/avatar` | multipart, imagem até 5 MB → recorte quadrado de 256px e 64px |
| `POST /me/password` | senha atual + nova |

**Catálogo**

| Método e rota | O que faz |
| --- | --- |
| `GET /courses/:slug` | Curso, anos e matérias |

**Decks e cards**

| Método e rota | O que faz |
| --- | --- |
| `GET /decks` | `scope=all\|mine\|community\|favorites`, `year[]`, `subjectIds[]`, `q`, `cursor`. Abas de Flashcards. Cada item: ano, matérias, nome, `cardCount`, `isMine`, `visibility` (se é seu), dono `{ firstName, avatarUrl }` (se é da comunidade), `isFavorite`, `dueToday`, `overdue`, `masteryPct`. A resposta traz também `counts { all, mine, community, favorites }` com os mesmos filtros |
| `GET /decks/recent?limit=4` | Últimos decks estudados (pela última avaliação) |
| `POST /decks` | importId, name, year, subjectIds, visibility → cria deck e cards numa transação |
| `GET /decks/:id` | Detalhe (se for do usuário ou salvo por ele): `isMine`, `isSaved`, `isFavorite`, `saveCount`, `contentUpdatedAt`, dono e `myStats { masteryPct, dueToday, overdue, newCount, masteredCount, accuracy }` (`accuracy` nula sem avaliações) |
| `PATCH /decks/:id` | name, year, subjectIds, visibility (só o dono) |
| `DELETE /decks/:id` | Exclusão lógica (só o dono) |
| `GET /decks/:id/cards` | `status=all\|due\|new\|mastered`, `q`, `cursor`. Cada card: posição, pergunta, resposta e a situação para o usuário (`NEW`, `DUE_TODAY`, `OVERDUE`, `SCHEDULED` com `dueInDays`, `MASTERED`). Também traz `counts { all, due, new, mastered }` |
| `POST /decks/:id/cards` | Adicionar card à mão (só o dono) |
| `POST /decks/:id/imports` | `importId` → acrescenta ao deck os pares de outro arquivo ("Importar mais cards", só o dono) |
| `PATCH /cards/:id`, `DELETE /cards/:id` | Editar ou remover card (só o dono). Atualiza `contentUpdatedAt` do deck |
| `PUT /decks/:id/favorite`, `DELETE /decks/:id/favorite` | Favoritar |
| `PUT /decks/:id/save`, `DELETE /decks/:id/save` | Salvar deck da comunidade / "Remover dos meus flashcards" (mantém `saveCount` em dia) |
| `POST /decks/:id/report` | `reason` (`WRONG_CONTENT`, `COPYRIGHT`, `OFFENSIVE`, `SPAM`, `OTHER`) e `details` opcional. Um por usuário e deck |

**Comunidade**

| Método e rota | O que faz |
| --- | --- |
| `GET /community/decks` | `year[]`, `subjectIds[]`, `q`, `sort=popular\|recent`, `cursor`. Cada item: ano, matérias, nome, `cardCount`, `saveCount`, `isSaved` e dono = `{ firstName, avatarUrl }`, nada além disso. Traz `total` (para "1.248 decks públicos"). Decks ocultados pela moderação não aparecem |
| `GET /community/decks/:id` | Prévia de um deck público: os dados acima, `contentUpdatedAt` e `previewCards` com os **6 primeiros** cards. Os demais só depois de salvar |

**Importação**

| Método e rota | O que faz |
| --- | --- |
| `POST /imports` | multipart (`.pdf`/`.docx`, até 20 MB, conferido pelos bytes iniciais) → `{ id, status }` |
| `GET /imports/:id` | status, progresso (0–100), pairsFound, pairsMissingAnswer, `suggestedName` (do nome do arquivo), prévia dos pares (os sem resposta marcados) |

**Estudo**

| Método e rota | O que faz |
| --- | --- |
| `GET /study/overview` | "Revisão de hoje" (`dueToday`, `overdue`, `deckCount`, `estimatedMinutes`) e as opções da tela Estudar: por matéria e por deck, com `cardCount`, `dueToday`, `overdue` e o ano |
| `POST /study/sessions` | `deckIds` e/ou `subjectIds`, `limit` (10, 20, 30 ou nulo = todos; padrão 20), `order` (`DUE_FIRST` padrão, `SHUFFLE`). Também aceita `mode=today` para a "Revisão de hoje" → `{ sessionId, cards, total }` |
| `POST /study/sessions/:id/reviews` | cardId, rating (`AGAIN`/`HARD`/`GOOD`), durationMs → atualiza CardState e grava ReviewLog |
| `POST /study/sessions/:id/finish` | Fecha e devolve o resumo: contagem por nota, taxa de acerto, tempo total e médio, streak (e se aumentou) e os cards errados ("Para rever") |
| `POST /study/sessions/:id/repeat` | Nova sessão com os mesmos cards ("Estudar novamente") |

**Estatísticas**

| Método e rota | O que faz |
| --- | --- |
| `GET /me/stats` | streak, semana (dias estudados), cardsThisWeek, cardsDeltaPct, minutesThisWeek, minutesPerDay[7], accuracy7d |
| `GET /me/agenda?days=7` | Por dia: total vencendo; por deck no dia escolhido (`date=`) |

**Assinatura**

| Método e rota | O que faz |
| --- | --- |
| `GET /billing/plans` | Planos e preços |
| `GET /billing/subscription` | Assinatura atual: plano, status, `trialEndsAt`, `currentPeriodEnd`, `paymentMethodLabel`, `graceUntil` (prazo para atualizar o cartão quando o pagamento foi recusado) |
| `GET /billing/invoices` | Histórico de pagamentos: data, plano, valor, cartão, status |
| `POST /billing/checkout` | plan → URL de checkout do gateway |
| `POST /billing/portal` | URL para gerenciar pagamento ou cancelar |
| `POST /webhooks/billing` | Webhook do gateway (assinatura verificada, idempotente via BillingEvent) |

Erros: `{ "error": { "code": "DECK_NOT_FOUND", "message": "Deck não encontrado.", "fields": { "email": "…" } } }`, com mensagens em português, prontas para mostrar. Recurso privado de outro usuário responde **404**, não 403.

## Cálculos

Todos os cálculos de data usam o `timezone` do usuário. A semana vai de segunda a domingo.

- **Streak:** dias consecutivos com ao menos um `ReviewLog`, contando para trás a partir de hoje. Se hoje ainda não tem revisão, comece de ontem (a sequência só quebra quando o dia acaba).
- **Cards estudados:** número de `ReviewLog` na semana atual. Variação = (atual − mesmo período da semana anterior) ÷ semana anterior.
- **Horas estudadas:** soma de `durationMs` na semana atual (cada avaliação já vem limitada a 5 minutos) e o total por dia.
- **Taxa de acerto:** (`HARD` + `GOOD`) ÷ total de `ReviewLog` nos últimos 7 dias.
- **Agenda:** `CardState.due` agrupado por dia no fuso do usuário, para os decks que ele tem (próprios + salvos). Vencidos de dias anteriores contam em "Hoje", marcados como atrasados.
- **Situação de um card** (para o usuário): sem `CardState` ou `state = NEW` → `NEW`; `due` antes do início de hoje → `OVERDUE`; `due` hoje → `DUE_TODAY`; `state = REVIEW` e `scheduledDays >= 21` → `MASTERED` (mesmo com `due` no futuro); senão `SCHEDULED` com `dueInDays`.
- **Domínio de um deck:** cards `MASTERED` ÷ `cardCount`, arredondado.
- **Situação de um deck ou matéria:** `overdue > 0` → "N atrasados"; senão `dueToday > 0` → "N para hoje"; senão "Em dia". `dueToday` não inclui os atrasados.
- **Tempo estimado:** cards × média de `durationMs` das últimas 200 avaliações do usuário (40 s sem histórico), arredondado para minutos.
- **Montagem da sessão:** junta os cards dos decks e das matérias escolhidos que o usuário tem (próprios + salvos). `DUE_FIRST`: atrasados (mais antigos primeiro), depois os de hoje, depois os novos na ordem do deck. `SHUFFLE`: os mesmos cards embaralhados. Corta em `limit`.

## FSRS

- Biblioteca `ts-fsrs` (exige Node 20+). Uma instância de `fsrs()` com os parâmetros padrão; guarde os parâmetros em config para poder otimizar depois.
- Mapeamento: Errei → `Rating.Again`, Difícil → `Rating.Hard`, Fácil → `Rating.Good`. Não existe `Easy` por enquanto.
- O primeiro estudo de um card cria o `CardState` com `createEmptyCard()`. Depois de cada avaliação, grave o card devolvido pelo `ts-fsrs` e o `ReviewLog` na mesma transação.
- Não confie no relógio do cliente: o `now` é o do servidor. O `durationMs` vem do cliente, limitado entre 0 e 300000.

## Importação de PDF e Word

1. `POST /imports` valida tipo e tamanho, envia o arquivo para o storage (R2/S3), cria o `ImportJob` (`PENDING`) e coloca na fila `imports`.
2. O worker extrai o texto (PDF: `unpdf` ou `pdf-parse`; DOCX: `mammoth`) e separa os pares:
   - primeiro por padrão ("P:"/"R:", "Pergunta:"/"Resposta:", pergunta numerada seguida da resposta);
   - se não achar padrão, opcionalmente usa um LLM atrás da interface `PairExtractor` (decisão em aberto 2).
3. Grava `pairs`, `pairsFound` e `pairsMissingAnswer` e muda para `READY` (ou `FAILED` com uma mensagem em português).
4. O front mostra a prévia; `POST /decks` com o `importId` cria o deck e os cards e marca o job como `CONSUMED`.
5. Arquivos e jobs não consumidos são apagados depois de 24 h (job agendado).

## Assinatura

- O gateway ainda não foi escolhido (precisa aceitar Pix e cartão recorrente no Brasil). Implemente a interface `BillingProvider` e, em desenvolvimento, um `FakeBillingProvider`.
- O status vem **só** do webhook. Um guard `RequiresActiveSubscription` protege estudo e importação, conforme a decisão em aberto 4 (período de teste).
- Do meio de pagamento, guarde apenas um rótulo como "Visa final 4417", nunca o número do cartão.
- Status e o que o front mostra: `TRIALING`/`ACTIVE` → plano atual com renovação; `PAST_DUE` → aviso "Não conseguimos cobrar seu cartão" com o prazo `graceUntil` (o acesso continua até lá); `CANCELED` com período pago em curso → acesso até `currentPeriodEnd`; `EXPIRED` ou sem assinatura depois do teste → "Seu teste grátis terminou", só leitura.
- Cada cobrança confirmada pelo webhook vira um `Invoice` (valor em centavos, status, data, rótulo do cartão). É o histórico da aba Assinatura.

## Moderação

- `POST /decks/:id/report` grava um `DeckReport` (um por usuário e deck; repetir atualiza o motivo). Só para decks públicos que não são do usuário.
- Ocultar um deck é ação de admin (decisão em aberto 7): `Deck.hiddenAt` preenchido tira o deck da Comunidade e da prévia, mas quem já salvou continua estudando.
