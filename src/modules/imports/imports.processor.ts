import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ImportStatus } from '../../generated/prisma/enums';
import { extractText, type SupportedMime } from './extract/text-extractors';
import { PatternPairExtractor } from './extract/pattern-pair-extractor';
import {
  IMPORTS_QUEUE,
  type ExtractJobData,
  type ImportsJobData,
  type ImportsJobName,
} from './imports.types';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

@Processor(IMPORTS_QUEUE)
export class ImportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly extractor: PatternPairExtractor,
  ) {
    super();
  }

  async process(job: Job<ImportsJobData, void, ImportsJobName>): Promise<void> {
    switch (job.name) {
      case 'extract':
        return this.runExtraction(job as Job<ExtractJobData>);
      case 'cleanup-stale':
        return this.runCleanup();
      default:
        this.logger.warn({ jobName: job.name }, 'Job de imports desconhecido.');
    }
  }

  private async runExtraction(job: Job<ExtractJobData>): Promise<void> {
    const { importJobId } = job.data;
    const record = await this.prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!record) {
      this.logger.warn({ importJobId }, 'ImportJob desapareceu antes da extracao.');
      return;
    }
    if (record.status === ImportStatus.CONSUMED || record.status === ImportStatus.READY) {
      return;
    }

    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: { status: ImportStatus.PROCESSING, error: null },
    });

    try {
      const buffer = await this.storage.getObject(record.fileKey);
      const text = await extractText(buffer, record.mimeType as SupportedMime);
      const pairs = await this.extractor.extract(text);
      const pairsFound = pairs.length;
      const pairsMissingAnswer = pairs.filter((p) => p.answer === null).length;

      await this.prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: ImportStatus.READY,
          pairs,
          pairsFound,
          pairsMissingAnswer,
          error: null,
        },
      });
    } catch (err) {
      this.logger.error({ err, importJobId }, 'Falha ao extrair pares do import.');
      await this.prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: ImportStatus.FAILED,
          error: 'Nao conseguimos ler esse arquivo. Tente outro PDF ou Word.',
        },
      });
      throw err;
    }
  }

  private async runCleanup(): Promise<void> {
    const threshold = new Date(Date.now() - STALE_AFTER_MS);
    const stale = await this.prisma.importJob.findMany({
      where: {
        createdAt: { lt: threshold },
        status: { not: ImportStatus.CONSUMED },
      },
      select: { id: true, fileKey: true },
      take: 100,
    });
    for (const job of stale) {
      await this.storage.deleteObject(job.fileKey);
      await this.prisma.importJob.delete({ where: { id: job.id } });
    }
    if (stale.length > 0) {
      this.logger.log({ removed: stale.length }, 'Imports expirados removidos.');
    }
  }
}
