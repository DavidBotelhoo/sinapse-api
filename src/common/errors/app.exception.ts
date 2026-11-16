import { HttpException, HttpStatus } from '@nestjs/common';

interface AppExceptionPayload {
  code: string;
  message: string;
  status?: HttpStatus;
  fields?: Record<string, string>;
}

export class AppException extends HttpException {
  constructor({ code, message, status = HttpStatus.BAD_REQUEST, fields }: AppExceptionPayload) {
    super({ error: { code, message, ...(fields ? { fields } : {}) } }, status);
  }
}
