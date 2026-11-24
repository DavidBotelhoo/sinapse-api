import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from './config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation/validation-pipe.factory';

// Pasta do storage local (StorageService em disco).
export const UPLOADS_DIR = resolve(process.cwd(), 'uploads');

// Configuração HTTP do app, a mesma no main.ts e nos testes e2e que a usam.
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Atrás de proxy (load balancer, CDN), o IP do cliente vem no X-Forwarded-For. Sem isso,
  // todo mundo teria o IP do proxy e dividiria os limites de requisição. 0 = desligado.
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) {
    app.set('trust proxy', trustProxy);
  }

  app.setGlobalPrefix('v1');
  app.use(cookieParser());

  // Só as fotos de perfil são públicas. Os arquivos importados (imports/) são privados e
  // ficam fora do ar.
  app.useStaticAssets(resolve(UPLOADS_DIR, 'avatars'), { prefix: '/uploads/avatars' });

  app.enableCors({
    origin: config.get('WEB_URL', { infer: true }),
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}
