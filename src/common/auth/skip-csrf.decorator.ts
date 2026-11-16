import { SetMetadata } from '@nestjs/common';

export const SKIP_CSRF_KEY = 'auth:skipCsrf';

export const SkipCsrf = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_CSRF_KEY, true);
