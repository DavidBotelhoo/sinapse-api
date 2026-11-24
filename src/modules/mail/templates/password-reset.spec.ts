import { escapeHtml, renderPasswordResetEmail } from './password-reset';

describe('email de redefinicao de senha', () => {
  const resetUrl = 'http://localhost:3000/redefinir-senha?token=abc_DEF-123';

  it('leva o link nas versoes texto e HTML', () => {
    const mail = renderPasswordResetEmail({ to: 'a@b.com', resetUrl });
    expect(mail.subject).toBe('Redefinição de senha — Sinapse');
    expect(mail.text).toContain(resetUrl);
    expect(mail.html).toContain(`href="${resetUrl}"`);
  });

  it('nao usa nada digitado pelo usuario, nem se vier no job', () => {
    // Jobs antigos na fila ainda trazem firstName; o template ignora.
    const job = {
      to: 'a@b.com',
      resetUrl,
      firstName: '<a href="https://golpe.example">Clique</a>',
    };
    const mail = renderPasswordResetEmail(job);
    expect(mail.html).not.toContain('golpe');
    expect(mail.text).not.toContain('golpe');
  });

  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
