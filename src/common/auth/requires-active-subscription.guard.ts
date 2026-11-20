import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../errors/error-response.dto';

// Protege estudo e importacao (docs/dominio.md > Assinatura).
// Erro previsto quando a assinatura estiver valendo:
//   403 { error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Assine o Sinapse para continuar estudando.' } }
//
// TODO(etapa 11): consultar a Subscription do usuario (TRIALING/ACTIVE, PAST_DUE ate graceUntil,
// CANCELED ate currentPeriodEnd) e aplicar a decisao em aberto 4 (periodo de teste).
// Por enquanto libera todo mundo.
@Injectable()
export class RequiresActiveSubscriptionGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    return true;
  }
}

// Aplica o guard e documenta o 403 no contrato, para o front ja tratar o caso.
export function RequiresActiveSubscription(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    UseGuards(RequiresActiveSubscriptionGuard),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      type: ErrorResponseDto,
      description: 'SUBSCRIPTION_REQUIRED: sem assinatura ativa (ainda nao bloqueia; etapa 11).',
    }),
  );
}
