import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { BillingProvider } from './billing-provider';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingWebhookService } from './billing-webhook.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { FakeBillingProvider } from './fake/fake-billing.provider';

@Module({
  controllers: [BillingController, BillingWebhookController],
  providers: [
    BillingService,
    BillingWebhookService,
    {
      // BILLING_PROVIDER escolhe o gateway (decisao em aberto 5: por enquanto so o de teste).
      provide: BillingProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): BillingProvider => {
        const name = config.get('BILLING_PROVIDER', { infer: true });
        switch (name) {
          case 'fake':
            return new FakeBillingProvider(config);
        }
      },
    },
  ],
})
export class BillingModule {}
