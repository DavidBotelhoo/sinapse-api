// Query strings repetidas (?year=1&year=2) chegam como array; uma so (?year=1) chega como
// valor solto. Estes transforms sempre entregam array (ou undefined se vazio).

function toArray<T>(value: unknown, map: (v: unknown) => T | null): T[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const mapped: T[] = [];
  for (const v of raw) {
    const m = map(v);
    if (m !== null) mapped.push(m);
  }
  return mapped;
}

export function toIntArray({ value }: { value: unknown }): number[] | undefined {
  return toArray(value, (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });
}

export function toStringArray({ value }: { value: unknown }): string[] | undefined {
  return toArray(value, (v) => (typeof v === 'string' && v.length > 0 ? v : null));
}

export function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
