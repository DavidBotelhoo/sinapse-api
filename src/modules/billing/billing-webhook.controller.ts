import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { SkipCsrf } from '../../common/auth/skip-csrf.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { BillingWebhookService } from './billing-webhook.service';
import { WebhookAckDto } from './dto/billing.dto';
import { FAKE_SIGNATURE_HEADER } from './fake/fake-webhook';

// Chamado pelo gateway, nao pelo front: sem login nem CSRF; quem garante a origem e a
// assinatura do corpo. Sem limite de requisicoes (o gateway reenvia em rajadas).
@ApiTags('webhooks')
@Public()
@SkipCsrf()
@SkipThrottle()
@Controller('webhooks')
export class BillingWebhookController {
  constructor(private readonly webhooks: BillingWebhookService) {}

  @Post('billing')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: FAKE_SIGNATURE_HEADER,
    required: true,
    description: 'Provedor de teste: t=<unix>,v1=<HMAC-SHA256 hex de "t.corpo">.',
  })
  @ApiOkResponse({ type: WebhookAckDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'INVALID_WEBHOOK_SIGNATURE',
  })
  handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookAckDto> {
    return this.webhooks.handle(req.rawBody, headers);
  }
}
