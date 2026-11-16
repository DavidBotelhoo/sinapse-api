import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('ida-e-volta devolve o mesmo payload', () => {
    const payload = { id: 'a1b2', ts: '2026-11-15T20:30:00.000Z' };
    const encoded = encodeCursor(payload);

    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain('/');
    expect(decodeCursor(encoded)).toEqual(payload);
  });

  it('decodeCursor devolve null para entradas invalidas', () => {
    expect(decodeCursor('nao-e-base64url')).toBeNull();
    expect(decodeCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('{"id":123}').toString('base64url'))).toBeNull();
  });
});
