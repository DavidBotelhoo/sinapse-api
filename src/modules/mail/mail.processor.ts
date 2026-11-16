import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { renderPasswordResetEmail } from './templates/password-reset';
import type { MailJobData, MailJobName } from './mail.types';
import { MAIL_QUEUE } from './mail.types';
import { MailTransport } from './mail.transport';

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly transport: MailTransport) {
    super();
  }

  async process(job: Job<MailJobData, void, MailJobName>): Promise<void> {
    switch (job.name) {
      case 'password-reset': {
        const data = job.data;
        const rendered = renderPasswordResetEmail(data);
        await this.transport.send({
          to: data.to,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
        this.logger.log({ to: data.to }, 'Email de redefinicao enviado.');
        return;
      }
      default: {
        const name: string = job.name;
        this.logger.warn({ jobName: name }, 'Job de mail desconhecido.');
      }
    }
  }
}
