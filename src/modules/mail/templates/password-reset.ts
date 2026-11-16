import type { PasswordResetJobData } from '../mail.types';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

export function renderPasswordResetEmail(data: PasswordResetJobData): RenderedMail {
  const subject = 'Redefinicao de senha — Sinapse';
  const greeting = data.firstName ? `Ola, ${data.firstName}.` : 'Ola.';

  const text = [
    greeting,
    '',
    'Recebemos um pedido para redefinir sua senha no Sinapse.',
    'Se foi voce, abra o link abaixo para escolher uma nova senha. O link vale por 1 hora.',
    '',
    data.resetUrl,
    '',
    'Se nao foi voce, pode ignorar este email — sua senha continua a mesma.',
    '',
    '— Equipe Sinapse',
  ].join('\n');

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#1f2937; max-width:560px; margin:0 auto; padding:24px;">
    <p style="font-size:16px;">${greeting}</p>
    <p>Recebemos um pedido para redefinir sua senha no Sinapse.</p>
    <p>Se foi voce, clique no botao abaixo para escolher uma nova senha. O link vale por 1 hora.</p>
    <p style="text-align:center; margin:28px 0;">
      <a href="${data.resetUrl}" style="background:#0e5c5e; color:#ffffff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Redefinir senha</a>
    </p>
    <p style="font-size:12px; color:#6b7280; word-break:break-all;">Se o botao nao funcionar, copie e cole este link no navegador:<br>${data.resetUrl}</p>
    <p style="margin-top:24px;">Se nao foi voce, pode ignorar este email — sua senha continua a mesma.</p>
    <p style="margin-top:24px; color:#6b7280;">— Equipe Sinapse</p>
  </body>
</html>`.trim();

  return { subject, text, html };
}
