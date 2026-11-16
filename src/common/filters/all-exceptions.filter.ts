import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode } from '../errors/error-code';

interface ErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
};

const STATUS_TO_MESSAGE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Requisicao invalida.',
  [HttpStatus.UNAUTHORIZED]: 'Nao autenticado.',
  [HttpStatus.FORBIDDEN]: 'Sem permissao.',
  [HttpStatus.NOT_FOUND]: 'Recurso nao encontrado.',
  [HttpStatus.CONFLICT]: 'Conflito.',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Arquivo grande demais.',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'Tipo de arquivo nao suportado.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Muitas requisicoes. Tente de novo em instantes.',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const { status, body } = this.mapException(exception);

    if (status >= 500) {
      this.logger.error(
        {
          err: exception,
          req: { method: request.method, url: request.originalUrl },
        },
        body.message,
      );
    }

    response.status(status).json({ error: body });
  }

  private mapException(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return { status, body: this.bodyFromHttpException(status, payload) };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: ErrorCode.INTERNAL_ERROR, message: 'Erro inesperado.' },
    };
  }

  private bodyFromHttpException(status: number, payload: string | object): ErrorBody {
    const defaultCode = STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
    const defaultMessage = STATUS_TO_MESSAGE[status] ?? 'Erro inesperado.';

    if (typeof payload === 'string') {
      return { code: defaultCode, message: payload };
    }

    const obj = payload as Record<string, unknown>;

    // Payload ja no formato { error: { code, message, fields? } }
    if (obj.error && typeof obj.error === 'object') {
      const inner = obj.error as Record<string, unknown>;
      return {
        code: typeof inner.code === 'string' ? inner.code : defaultCode,
        message: typeof inner.message === 'string' ? inner.message : defaultMessage,
        ...(inner.fields && typeof inner.fields === 'object'
          ? { fields: inner.fields as Record<string, string> }
          : {}),
      };
    }

    // Payload do ValidationPipe: message pode ser string[] (erros por campo).
    if (Array.isArray(obj.message)) {
      const fields: Record<string, string> = {};
      for (const entry of obj.message as string[]) {
        const [field, ...rest] = entry.split(/\s+/, 2);
        if (field) {
          fields[field] = rest.length > 0 ? entry : 'Valor invalido.';
        }
      }
      return {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Dados invalidos.',
        fields,
      };
    }

    const message = typeof obj.message === 'string' ? obj.message : defaultMessage;
    const code = typeof obj.code === 'string' ? obj.code : defaultCode;
    return { code, message };
  }
}
