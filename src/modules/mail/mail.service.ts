import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MAIL_QUEUE } from './mail.types';
import type { MailJobData, MailJobName, PasswordResetJobData } from './mail.types';

@Injectable()
export class MailService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJobData, void, MailJobName>) {}

  async enqueuePasswordReset(data: PasswordResetJobData): Promise<void> {
    await this.queue.add('password-reset', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }
}
