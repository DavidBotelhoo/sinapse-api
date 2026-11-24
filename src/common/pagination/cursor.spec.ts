import { decodeCursor, decodeDateCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('ida-e-volta devolve o mesmo payload', () => {
    const payload = { id: 'a1b2', k: '2026-11-15T20:30:00.000Z' };
    const encoded = encodeCursor(payload);

    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('/');
    expect(decodeCursor(encoded)).toEqual(payload);
  });

  it('decodeCursor devolve null para entradas invalidas', () => {
    expect(decodeCursor('nao-e-base64url')).toBeNull();
    expect(decodeCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('{"id":123}').toString('base64url'))).toBeNull();
    // payload antigo (ts em vez de k) agora deve ser rejeitado
    expect(
      decodeCursor(Buffer.from('{"id":"x","ts":"2026-01-01"}').toString('base64url')),
    ).toBeNull();
  });

  describe('decodeDateCursor (listas por data)', () => {
    const id = '0c4d4c55-7d7c-4a5e-9f1e-3f0a2b1c9d8e';
    const enc = (payload: object) => Buffer.from(JSON.stringify(payload)).toString('base64url');

    it('devolve id e data de um cursor valido', () => {
      const k = '2026-11-15T20:30:00.000Z';
      expect(decodeDateCursor(encodeCursor({ id, k }))).toEqual({ id, date: new Date(k) });
    });

    it('recusa cursor adulterado (iria ao banco e viraria 500)', () => {
      expect(decodeDateCursor(enc({ id: 'nao-uuid', k: '2026-11-15T20:30:00.000Z' }))).toBeNull();
      expect(decodeDateCursor(enc({ id, k: 'lixo' }))).toBeNull();
      expect(decodeDateCursor(enc({ id, k: '2026-11-15' }))).toBeNull();
      expect(decodeDateCursor('%%%')).toBeNull();
    });
  });
});
