import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import type { Env } from '../../config/env';

export const MAIL_TRANSPORTER = Symbol('MAIL_TRANSPORTER');

export const mailTransporterProvider = {
  provide: MAIL_TRANSPORTER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): Transporter =>
    createTransport(config.get('SMTP_URL', { infer: true })),
};

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class MailTransport {
  private readonly from: string;

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
    config: ConfigService<Env, true>,
  ) {
    this.from = config.get('MAIL_FROM', { infer: true });
  }

  async send(input: SendMailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }
}
