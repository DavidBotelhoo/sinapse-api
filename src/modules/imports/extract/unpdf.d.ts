// Shim: unpdf publica tipos em .d.mts (ESM only). Nosso moduleResolution ainda
// e o legado, entao declaramos a assinatura que usamos.
declare module 'unpdf' {
  export function extractText(
    data: Uint8Array | ArrayBuffer | Buffer,
    options?: { mergePages?: boolean },
  ): Promise<{ totalPages: number; text: string | string[] }>;
}
