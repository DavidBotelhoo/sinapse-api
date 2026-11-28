import cookieParser from 'cookie-parser';
import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation/validation-pipe.factory';
import { AVATAR_FILES_PATH } from './modules/users/avatar-files.controller';

// Configuração HTTP do app, a mesma no main.ts e nos testes e2e que a usam.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Atrás de proxy (load balancer, CDN), o IP do cliente vem no X-Forwarded-For. Sem isso,
  // todo mundo teria o IP do proxy e dividiria os limites de requisição. 0 = desligado.
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) {
    app.set('trust proxy', trustProxy);
  }

  // As fotos de perfil ficam em /uploads/avatars, fora do /v1 (é a URL do avatarUrl). A rota
  // lê do storage (disco ou bucket); os arquivos importados não têm rota e ficam fora do ar.
  app.setGlobalPrefix('v1', {
    exclude: [{ path: `${AVATAR_FILES_PATH}/:file`, method: RequestMethod.GET }],
  });
  app.use(cookieParser());

  app.enableCors({
    origin: config.get('WEB_URL', { infer: true }),
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}
