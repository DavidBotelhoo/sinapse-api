import type { PasswordResetJobData } from '../mail.types';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!);
}

// O email não leva nada digitado pelo usuário (nem o nome): o cadastro não confirma o
// email, então alguém poderia criar conta com o email de outra pessoa e um "nome" com
// um link, e ela receberia esse texto num email legítimo do Sinapse.
export function renderPasswordResetEmail(data: PasswordResetJobData): RenderedMail {
  const subject = 'Redefinição de senha — Sinapse';
  const url = escapeHtml(data.resetUrl);

  const text = [
    'Olá.',
    '',
    'Recebemos um pedido para redefinir sua senha no Sinapse.',
    'Se foi você, abra o link abaixo para escolher uma nova senha. O link vale por 1 hora.',
    '',
    data.resetUrl,
    '',
    'Se não foi você, pode ignorar este email — sua senha continua a mesma.',
    '',
    '— Equipe Sinapse',
  ].join('\n');

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#1f2937; max-width:560px; margin:0 auto; padding:24px;">
    <p style="font-size:16px;">Olá.</p>
    <p>Recebemos um pedido para redefinir sua senha no Sinapse.</p>
    <p>Se foi você, clique no botão abaixo para escolher uma nova senha. O link vale por 1 hora.</p>
    <p style="text-align:center; margin:28px 0;">
      <a href="${url}" style="background:#0e5c5e; color:#ffffff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Redefinir senha</a>
    </p>
    <p style="font-size:12px; color:#6b7280; word-break:break-all;">Se o botão não funcionar, copie e cole este link no navegador:<br>${url}</p>
    <p style="margin-top:24px;">Se não foi você, pode ignorar este email — sua senha continua a mesma.</p>
    <p style="margin-top:24px; color:#6b7280;">— Equipe Sinapse</p>
  </body>
</html>`.trim();

  return { subject, text, html };
}
