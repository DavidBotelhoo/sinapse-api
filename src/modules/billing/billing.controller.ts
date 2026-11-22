import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser, type CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { BillingService } from './billing.service';
import {
  CheckoutDto,
  InvoiceListDto,
  InvoicesQueryDto,
  PlansDto,
  RedirectUrlDto,
  SubscriptionSummaryDto,
} from './dto/billing.dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // Publica: a landing tambem mostra os planos.
  @Public()
  @Get('plans')
  @ApiOkResponse({ type: PlansDto })
  plans(): PlansDto {
    return this.billing.plans();
  }

  @Get('subscription')
  @ApiCookieAuth('sn_access')
  @ApiOkResponse({ type: SubscriptionSummaryDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  subscription(@CurrentUser() user: CurrentUserInfo): Promise<SubscriptionSummaryDto> {
    return this.billing.subscription(user.id);
  }

  @Post('checkout')
  @ApiCookieAuth('sn_access')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RedirectUrlDto, description: 'URL do checkout do gateway.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponseDto,
    description: 'SUBSCRIPTION_ALREADY_ACTIVE: ja assina este plano ou tem acesso vitalicio.',
  })
  checkout(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: CheckoutDto,
  ): Promise<RedirectUrlDto> {
    return this.billing.checkout(user.id, dto.plan);
  }

  @Post('portal')
  @ApiCookieAuth('sn_access')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: RedirectUrlDto,
    description: 'URL para gerenciar o pagamento, trocar o cartao ou cancelar.',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponseDto,
    description: 'NO_PAID_SUBSCRIPTION: ainda nao ha assinatura paga.',
  })
  portal(@CurrentUser() user: CurrentUserInfo): Promise<RedirectUrlDto> {
    return this.billing.portal(user.id);
  }

  @Get('invoices')
  @ApiCookieAuth('sn_access')
  @ApiOkResponse({ type: InvoiceListDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  invoices(
    @CurrentUser() user: CurrentUserInfo,
    @Query() query: InvoicesQueryDto,
  ): Promise<InvoiceListDto> {
    return this.billing.invoices(user.id, query);
  }
}
