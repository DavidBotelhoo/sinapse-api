export const MAIL_QUEUE = 'mail';

export type MailJobName = 'password-reset';

export interface PasswordResetJobData {
  to: string;
  firstName: string;
  resetUrl: string;
}

export type MailJobData = PasswordResetJobData;
