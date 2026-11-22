import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { subscriptionAccess } from '../../modules/billing/subscription-access';
import { PrismaService } from '../../prisma/prisma.service';
import type { CurrentUserInfo } from '../decorators/current-user.decorator';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';
import { ErrorResponseDto } from '../errors/error-response.dto';

// Protege estudo e importacao (docs/dominio.md > Assinatura). Sem acesso (teste terminado,
// prazo do pagamento vencido, cancelada e periodo encerrado, sem assinatura) a conta fica so
// leitura: ve os decks, mas nao estuda nem importa. ADMIN e SUPER_ADMIN passam sempre.
@Injectable()
export class RequiresActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserInfo }>();
    const userId = req.user?.id;
    if (!userId) {
      throw new AppException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Nao autenticado.',
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        subscription: {
          select: { status: true, trialEndsAt: true, currentPeriodEnd: true, graceUntil: true },
        },
      },
    });
    if (user && subscriptionAccess(user.role, user.subscription, new Date()).hasAccess) {
      return true;
    }
    throw new AppException({
      code: ErrorCode.SUBSCRIPTION_REQUIRED,
      message:
        'Assine o Sinapse para voltar a estudar e importar arquivos. Seus decks continuam salvos.',
      status: HttpStatus.FORBIDDEN,
    });
  }
}

// Aplica o guard e documenta o 403 no contrato.
export function RequiresActiveSubscription(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    UseGuards(RequiresActiveSubscriptionGuard),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      type: ErrorResponseDto,
      description: 'SUBSCRIPTION_REQUIRED: sem assinatura ativa (conta so leitura).',
    }),
  );
}
