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
  [HttpStatus.BAD_REQUEST]: 'Requisição inválida.',
  [HttpStatus.UNAUTHORIZED]: 'Não autenticado.',
  [HttpStatus.FORBIDDEN]: 'Sem permissão.',
  [HttpStatus.NOT_FOUND]: 'Recurso não encontrado.',
  [HttpStatus.CONFLICT]: 'Conflito.',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Conteúdo grande demais.',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'Tipo de arquivo não suportado.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Muitas requisições. Tente de novo em instantes.',
};

const UNEXPECTED: ErrorBody = { code: ErrorCode.INTERNAL_ERROR, message: 'Erro inesperado.' };

// Converte qualquer exceção no formato { error: { code, message, fields? } }.
// - AppException (nossas regras) já vem nesse formato e passa como está.
// - Exceções do próprio Nest e das bibliotecas (ParseUUIDPipe, multer, throttler, JSON
//   malformado, rota inexistente) trazem mensagens em inglês: usamos a mensagem em
//   português do status, pronta para o usuário.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const { status, body } = mapException(exception);

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
}

export function mapException(exception: unknown): { status: number; body: ErrorBody } {
  if (!(exception instanceof HttpException)) {
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: UNEXPECTED };
  }
  const status = exception.getStatus();
  return { status, body: bodyFromHttpException(status, exception.getResponse()) };
}

function bodyFromHttpException(status: number, payload: string | object): ErrorBody {
  if (status >= 500) return UNEXPECTED;

  // Payload de AppException: { error: { code, message, fields? } }
  if (typeof payload === 'object' && 'error' in payload) {
    const inner = payload.error;
    if (inner && typeof inner === 'object') {
      const err = inner as Record<string, unknown>;
      if (typeof err.code === 'string' && typeof err.message === 'string') {
        return {
          code: err.code,
          message: err.message,
          ...(err.fields && typeof err.fields === 'object'
            ? { fields: err.fields as Record<string, string> }
            : {}),
        };
      }
    }
  }

  return {
    code: STATUS_TO_CODE[status] ?? ErrorCode.BAD_REQUEST,
    message: STATUS_TO_MESSAGE[status] ?? STATUS_TO_MESSAGE[HttpStatus.BAD_REQUEST]!,
  };
}
