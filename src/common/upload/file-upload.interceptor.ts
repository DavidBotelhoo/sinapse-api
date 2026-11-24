import {
  mixin,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import type { AppException } from '../errors/app.exception';

// Um arquivo no campo `field`, até `maxBytes`. Acima do limite o multer corta o envio e
// responde "File too large"; aqui isso vira o erro do domínio (código e mensagem em
// português com o limite, ex. AVATAR_TOO_LARGE).
export function FileUpload(
  field: string,
  maxBytes: number,
  tooLarge: () => AppException,
): Type<NestInterceptor> {
  const Inner = FileInterceptor(field, { limits: { fileSize: maxBytes, files: 1 } });

  class FileUploadInterceptor implements NestInterceptor {
    private readonly inner: NestInterceptor = new Inner();

    async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
      try {
        return await this.inner.intercept(ctx, next);
      } catch (err) {
        if (err instanceof PayloadTooLargeException) throw tooLarge();
        throw err;
      }
    }
  }

  return mixin(FileUploadInterceptor);
}
