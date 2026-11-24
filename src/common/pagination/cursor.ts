import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

// k: chave de ordenacao serializavel (ISO date, number com padding, etc.);
// id: tiebreak estavel.
export interface CursorPayload {
  id: string;
  k: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): CursorPayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as CursorPayload).id === 'string' &&
      typeof (parsed as CursorPayload).k === 'string'
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Cursor de listas ordenadas por data (createdAt desc, id desc). Devolve null se o cursor foi
// adulterado: id que nao e UUID ou data invalida iriam ao banco e virariam erro 500.
export function decodeDateCursor(raw: string): { id: string; date: Date } | null {
  const cursor = decodeCursor(raw);
  if (!cursor || !isUuid(cursor.id)) return null;
  const date = new Date(cursor.k);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== cursor.k) return null;
  return { id: cursor.id, date };
}

export function invalidCursorError(): AppException {
  return new AppException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Dados inválidos.',
    status: HttpStatus.BAD_REQUEST,
    fields: { cursor: 'Cursor inválido. Recarregue a lista.' },
  });
}
