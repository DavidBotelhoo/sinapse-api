export type SupportedMime = 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function detectMimeByMagic(buffer: Buffer): SupportedMime | null {
  if (buffer.length < 4) return null;
  // %PDF-
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }
  // PK zip (DOCX e um zip). Validacao real do DOCX acontece ao extrair.
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

export async function extractText(buffer: Buffer, mime: SupportedMime): Promise<string> {
  if (mime === 'application/pdf') {
    const { extractText: extractPdfText } = await import('unpdf');
    const result = await extractPdfText(new Uint8Array(buffer), { mergePages: true });
    if (typeof result.text === 'string') return result.text;
    return result.text.join('\n');
  }
  const mammoth = await import('mammoth');
  const res = await mammoth.default.extractRawText({ buffer });
  return res.value;
}

export function extensionFor(mime: SupportedMime): 'pdf' | 'docx' {
  return mime === 'application/pdf' ? 'pdf' : 'docx';
}
