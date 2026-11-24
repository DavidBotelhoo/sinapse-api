import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import type { Env } from '../../config/env';
import { Prisma } from '../../generated/prisma/client';
import { InvoiceStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BillingProvider,
  InvalidWebhookSignatureError,
  type NormalizedBillingEvent,
} from './billing-provider';
import type { WebhookAckDto } from './dto/billing.dto';
import { applyBillingEvent, type InvoiceWrite } from './subscription-transition';

type Tx = Prisma.TransactionClient;

class DuplicateEventError extends Error {}

// POST /webhooks/billing: confere a assinatura, grava o BillingEvent e aplica o evento na
// mesma transacao. Evento repetido (mesmo providerEventId) responde 200 sem refazer nada; se
// o processamento falhar, nada fica gravado e o reenvio do gateway processa de novo.
@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);
  private readonly graceDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: BillingProvider,
    config: ConfigService<Env, true>,
  ) {
    this.graceDays = config.get('BILLING_GRACE_DAYS', { infer: true });
  }

  async handle(
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookAckDto> {
    const event = this.parse(rawBody, headers);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.billingEvent
          .create({
            data: {
              provider: this.provider.name,
              providerEventId: event.eventId,
              type: event.rawType,
              payload: event.payload as Prisma.InputJsonValue,
            },
          })
          .catch((err: unknown) => {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              throw new DuplicateEventError();
            }
            throw err;
          });
        await this.apply(tx, event);
        await tx.billingEvent.update({
          where: { providerEventId: event.eventId },
          data: { processedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof DuplicateEventError) return { received: true, duplicate: true };
      throw err;
    }
    return { received: true, duplicate: false };
  }

  private parse(
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): NormalizedBillingEvent {
    try {
      if (!rawBody || rawBody.length === 0) {
        throw new InvalidWebhookSignatureError('corpo vazio');
      }
      return this.provider.parseWebhook(rawBody, headers);
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) {
        this.logger.warn(err.message);
        throw new AppException({
          code: ErrorCode.INVALID_WEBHOOK_SIGNATURE,
          message: 'Assinatura do webhook inválida.',
          status: HttpStatus.BAD_REQUEST,
        });
      }
      throw err;
    }
  }

  private async apply(tx: Tx, event: NormalizedBillingEvent): Promise<void> {
    if (!event.type) return; // so fica registrado

    const user = await tx.user.findUnique({ where: { id: event.userId }, select: { id: true } });
    if (!user) {
      this.logger.warn(`Evento ${event.eventId} para usuario inexistente; so registrado.`);
      return;
    }

    // Um evento por vez para o mesmo usuario (dois webhooks juntos nao se atropelam).
    await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "userId" = ${user.id}::uuid FOR UPDATE`;
    const current = await tx.subscription.findUnique({ where: { userId: user.id } });

    const result = applyBillingEvent(current, event, {
      providerName: this.provider.name,
      graceDays: this.graceDays,
    });
    if (result.subscription) {
      await tx.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...result.subscription },
        update: result.subscription,
      });
    }
    if (result.invoice) {
      await this.saveInvoice(tx, user.id, result.invoice, event.occurredAt);
    }
  }

  // Historico de pagamentos: a data da cobranca e a do evento; uma cobranca paga nunca volta
  // para recusada (evento atrasado), e cobranca de outra pessoa nao e mexida.
  private async saveInvoice(
    tx: Tx,
    userId: string,
    invoice: InvoiceWrite,
    occurredAt: Date,
  ): Promise<void> {
    const existing = await tx.invoice.findUnique({
      where: { providerInvoiceId: invoice.providerInvoiceId },
      select: { userId: true, status: true },
    });
    if (!existing) {
      await tx.invoice.create({ data: { ...invoice, userId, createdAt: occurredAt } });
      return;
    }
    if (existing.userId !== userId) return;
    if (existing.status === InvoiceStatus.PAID && invoice.status !== InvoiceStatus.PAID) return;
    await tx.invoice.update({
      where: { providerInvoiceId: invoice.providerInvoiceId },
      data: invoice,
    });
  }
}
