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
