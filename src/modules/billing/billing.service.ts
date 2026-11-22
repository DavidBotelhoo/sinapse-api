import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import type { Env } from '../../config/env';
import { SubscriptionStatus, type SubscriptionPlan } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingProvider } from './billing-provider';
import type {
  InvoiceListDto,
  InvoicesQueryDto,
  PlansDto,
  RedirectUrlDto,
  SubscriptionSummaryDto,
} from './dto/billing.dto';
import { BILLING_CURRENCY, buildPlans, priceFor, type PlanPrices } from './plans';
import { subscriptionAccess } from './subscription-access';
import { toSubscriptionSummary } from './subscription-summary';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BillingService {
  private readonly prices: PlanPrices;
  private readonly trialDays: number;
  private readonly accountUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: BillingProvider,
    config: ConfigService<Env, true>,
  ) {
    this.prices = {
      monthlyCents: config.get('BILLING_PRICE_MONTHLY_CENTS', { infer: true }),
      yearlyCents: config.get('BILLING_PRICE_YEARLY_CENTS', { infer: true }),
    };
    this.trialDays = config.get('BILLING_TRIAL_DAYS', { infer: true });
    const webUrl = config.get('WEB_URL', { infer: true }).replace(/\/+$/, '');
    this.accountUrl = `${webUrl}/perfil/assinatura`;
  }

  plans(): PlansDto {
    return {
      currency: BILLING_CURRENCY,
      trialDays: this.trialDays,
      plans: buildPlans(this.prices),
    };
  }

  async subscription(userId: string): Promise<SubscriptionSummaryDto> {
    const user = await this.loadUser(userId);
    return toSubscriptionSummary(user.role, user.subscription);
  }

  async checkout(userId: string, plan: SubscriptionPlan): Promise<RedirectUrlDto> {
    const user = await this.loadUser(userId);
    const access = subscriptionAccess(user.role, user.subscription, new Date());
    if (access.lifetime) {
      throw alreadyActive('Sua conta tem acesso vitalicio. Nao precisa assinar.');
    }
    const samePlan = user.subscription?.plan === plan;
    if (samePlan && access.status === SubscriptionStatus.ACTIVE) {
      throw alreadyActive('Voce ja assina este plano.');
    }
    if (samePlan && access.status === SubscriptionStatus.PAST_DUE) {
      throw alreadyActive('Voce ja assina este plano. Atualize o cartao em Gerenciar assinatura.');
    }

    return this.provider.createCheckout({
      userId,
      email: user.email,
      plan,
      priceCents: priceFor(plan, this.prices),
      currency: BILLING_CURRENCY,
      successUrl: `${this.accountUrl}?checkout=sucesso`,
      cancelUrl: `${this.accountUrl}?checkout=cancelado`,
    });
  }

  // "Gerenciar assinatura", "Atualizar cartao", "Trocar cartao" e "Cancelar assinatura".
  async portal(userId: string): Promise<RedirectUrlDto> {
    const user = await this.loadUser(userId);
    const customerId = user.subscription?.providerCustomerId;
    if (!customerId) {
      throw new AppException({
        code: ErrorCode.NO_PAID_SUBSCRIPTION,
        message: 'Voce ainda nao tem uma assinatura paga para gerenciar.',
        status: HttpStatus.CONFLICT,
      });
    }
    return this.provider.createPortal({ userId, customerId, returnUrl: this.accountUrl });
  }

  async invoices(userId: string, query: InvoicesQueryDto): Promise<InvoiceListDto> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const cursorDate = cursor ? new Date(cursor.k) : null;
    if (
      query.cursor &&
      (!cursor || !UUID_RE.test(cursor.id) || !cursorDate || Number.isNaN(cursorDate.getTime()))
    ) {
      throw new AppException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Dados invalidos.',
        status: HttpStatus.BAD_REQUEST,
        fields: { cursor: 'Cursor invalido. Recarregue a lista.' },
      });
    }

    const rows = await this.prisma.invoice.findMany({
      where: {
        userId,
        ...(cursor && cursorDate
          ? {
              OR: [
                { createdAt: { lt: cursorDate } },
                { createdAt: cursorDate, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map((inv) => ({
        id: inv.id,
        date: (inv.paidAt ?? inv.createdAt).toISOString(),
        plan: inv.plan,
        amountCents: inv.amountCents,
        currency: inv.currency,
        status: inv.status,
        paymentMethodLabel: inv.paymentMethodLabel,
      })),
      nextCursor:
        hasMore && last ? encodeCursor({ id: last.id, k: last.createdAt.toISOString() }) : null,
    };
  }

  private loadUser(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, role: true, subscription: true },
    });
  }
}

function alreadyActive(message: string): AppException {
  return new AppException({
    code: ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE,
    message,
    status: HttpStatus.CONFLICT,
  });
}
