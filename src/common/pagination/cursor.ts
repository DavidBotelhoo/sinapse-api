export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CursorPayload {
  id: string;
  ts: string; // ISO-8601
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
      typeof (parsed as CursorPayload).ts === 'string'
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}
