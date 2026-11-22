import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
import {
  BillingProvider,
  type CheckoutInput,
  type NormalizedBillingEvent,
  type PortalInput,
} from '../billing-provider';
import {
  FAKE_PROVIDER_NAME,
  FAKE_SIGNATURE_HEADER,
  parseFakeEvent,
  verifyFakeSignature,
} from './fake-webhook';

// Provedor de teste: nao cobra nada. O checkout e o portal so devolvem o usuario para a
// tela de Assinatura; os eventos (aprovado, recusado, cancelado, teste terminado) chegam
// pelo webhook, gerados por `pnpm billing:simulate`.
@Injectable()
export class FakeBillingProvider extends BillingProvider {
  readonly name = FAKE_PROVIDER_NAME;
  private readonly secret: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.secret = config.get('BILLING_WEBHOOK_SECRET', { infer: true });
  }

  createCheckout(input: CheckoutInput): Promise<{ url: string }> {
    const url = new URL(input.successUrl);
    url.searchParams.set('provedor', 'teste');
    url.searchParams.set('plano', input.plan);
    return Promise.resolve({ url: url.toString() });
  }

  createPortal(input: PortalInput): Promise<{ url: string }> {
    const url = new URL(input.returnUrl);
    url.searchParams.set('portal', 'teste');
    return Promise.resolve({ url: url.toString() });
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): NormalizedBillingEvent {
    const header = headers[FAKE_SIGNATURE_HEADER];
    verifyFakeSignature(
      rawBody,
      Array.isArray(header) ? header[0] : header,
      this.secret,
      Math.floor(Date.now() / 1000),
    );
    return parseFakeEvent(rawBody);
  }
}
