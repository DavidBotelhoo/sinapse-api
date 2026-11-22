// Simula eventos do provedor de teste contra a API rodando (pnpm start:dev), para ver as
// situacoes da tela de Assinatura. O evento sai assinado com BILLING_WEBHOOK_SECRET e passa
// pelo mesmo caminho de um gateway de verdade (POST /v1/webhooks/billing).
//
//   pnpm billing:simulate <email> <aprovado|recusado|cancelado|teste-terminado>
//                         [--plano mensal|anual] [--dias-atras N] [--api http://localhost:3333]
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { SubscriptionPlan } from '../src/generated/prisma/enums';
import type { BillingEventType } from '../src/modules/billing/billing-provider';
import {
  FAKE_SIGNATURE_HEADER,
  signFakePayload,
  type FakeEventInput,
} from '../src/modules/billing/fake/fake-webhook';
import { addPlanPeriod, priceFor } from '../src/modules/billing/plans';
import { toSubscriptionSummary } from '../src/modules/billing/subscription-summary';

const USAGE = `Uso: pnpm billing:simulate <email> <evento> [--plano mensal|anual] [--dias-atras N] [--api URL]

Eventos:
  aprovado         pagamento aprovado (assina ou renova; tela "Ativa")
  recusado         pagamento recusado (tela "Pagamento recusado", com prazo para trocar o cartao)
  cancelado        assinatura cancelada (acesso ate o fim do periodo pago)
  teste-terminado  teste gratis terminou (tela "Sem assinatura", so leitura)

--dias-atras N   data do evento N dias no passado (ex.: recusado --dias-atras 6 = prazo vencido)`;

const EVENTS: Record<string, BillingEventType> = {
  aprovado: 'payment.succeeded',
  recusado: 'payment.failed',
  cancelado: 'subscription.canceled',
  'teste-terminado': 'trial.ended',
};
const PLANS: Record<string, SubscriptionPlan> = {
  mensal: SubscriptionPlan.MONTHLY,
  anual: SubscriptionPlan.YEARLY,
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface Args {
  email: string;
  type: BillingEventType;
  plan: SubscriptionPlan | null;
  daysAgo: number;
  api: string;
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      flags.set(arg.slice(2), argv[i + 1] ?? '');
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  const [email, eventName] = positional;
  if (!email || !eventName) fail(USAGE);
  const type = EVENTS[eventName];
  if (!type) fail(`Evento desconhecido: ${eventName}\n\n${USAGE}`);

  const planFlag = flags.get('plano');
  const plan = planFlag ? PLANS[planFlag] : null;
  if (planFlag && !plan) fail(`Plano desconhecido: ${planFlag} (use mensal ou anual).`);

  const daysAgo = Number(flags.get('dias-atras') ?? '0');
  if (!Number.isInteger(daysAgo) || daysAgo < 0) fail('--dias-atras precisa ser um inteiro >= 0.');

  const port = process.env.PORT ?? '3333';
  return {
    email: email.trim().toLowerCase(),
    type,
    plan: plan ?? null,
    daysAgo,
    api: (flags.get('api') ?? `http://localhost:${port}`).replace(/\/+$/, ''),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (process.env.NODE_ENV === 'production') fail('Este comando nao roda em producao.');
  if ((process.env.BILLING_PROVIDER ?? 'fake') !== 'fake') {
    fail('So funciona com BILLING_PROVIDER=fake (provedor de teste).');
  }
  const secret = process.env.BILLING_WEBHOOK_SECRET ?? '';
  if (secret.length < 32) fail('BILLING_WEBHOOK_SECRET nao configurado no .env.');
  const prices = {
    monthlyCents: Number(process.env.BILLING_PRICE_MONTHLY_CENTS),
    yearlyCents: Number(process.env.BILLING_PRICE_YEARLY_CENTS),
  };
  if (!(prices.monthlyCents > 0 && prices.yearlyCents > 0)) {
    fail('Configure BILLING_PRICE_MONTHLY_CENTS e BILLING_PRICE_YEARLY_CENTS no .env.');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('DATABASE_URL nao definida.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const user = await prisma.user.findUnique({
      where: { email: args.email },
      include: { subscription: true },
    });
    if (!user) fail(`Nenhuma conta com o email ${args.email}.`);
    const sub = user.subscription;

    const occurredAt = new Date(Date.now() - args.daysAgo * MS_PER_DAY);
    const plan = args.plan ?? sub?.plan ?? SubscriptionPlan.MONTHLY;
    const short = user.id.slice(0, 8);
    const gateway = {
      customerId: sub?.providerCustomerId ?? `cus_teste_${short}`,
      subscriptionId: sub?.providerSubscriptionId ?? `sub_teste_${short}`,
      plan,
      paymentMethodLabel: sub?.paymentMethodLabel ?? 'Visa final 4242',
    };
    const charge = () => ({
      id: `in_teste_${randomUUID()}`,
      amountCents: priceFor(plan, prices),
      currency: 'BRL',
    });

    let data: FakeEventInput['data'];
    switch (args.type) {
      case 'payment.succeeded':
        data = {
          userId: user.id,
          ...gateway,
          currentPeriodEnd: addPlanPeriod(occurredAt, plan).toISOString(),
          invoice: charge(),
        };
        break;
      case 'payment.failed':
        data = { userId: user.id, ...gateway, invoice: charge() };
        break;
      case 'subscription.canceled':
        data = { userId: user.id, ...gateway };
        break;
      case 'trial.ended':
        data = { userId: user.id };
        break;
    }

    const event: FakeEventInput = {
      id: `evt_teste_${randomUUID()}`,
      type: args.type,
      createdAt: occurredAt.toISOString(),
      data,
    };
    const body = JSON.stringify(event);
    const signature = signFakePayload(body, secret, Math.floor(Date.now() / 1000));

    let res: Response;
    try {
      res = await fetch(`${args.api}/v1/webhooks/billing`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [FAKE_SIGNATURE_HEADER]: signature },
        body,
      });
    } catch {
      fail(`Nao consegui falar com a API em ${args.api}. Ela esta rodando (pnpm start:dev)?`);
    }
    const reply = (await res.json().catch(() => null)) as unknown;
    console.log(`\n${args.type} para ${user.email}: HTTP ${res.status}`, reply ?? '');
    if (!res.ok) process.exitCode = 1;

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { subscription: true },
    });
    console.log('\nAssinatura agora:', toSubscriptionSummary(after.role, after.subscription));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
