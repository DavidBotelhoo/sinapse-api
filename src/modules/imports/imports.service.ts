import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ImportStatus } from '../../generated/prisma/enums';
import { detectMimeByMagic, extensionFor } from './extract/text-extractors';
import {
  IMPORTS_QUEUE,
  type ImportsJobData,
  type ImportsJobName,
  CLEANUP_JOB_ID,
} from './imports.types';
import type { ImportCreatedDto, ImportDetailDto, ImportPairDto } from './dto/import.dto';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024; // 20 MB

export const importTooLarge = (): AppException =>
  new AppException({
    code: ErrorCode.PAYLOAD_TOO_LARGE,
    message: 'O arquivo precisa ter no máximo 20 MB.',
    status: HttpStatus.PAYLOAD_TOO_LARGE,
  });

const STATUS_PROGRESS: Record<ImportStatus, number> = {
  PENDING: 0,
  PROCESSING: 25,
  READY: 100,
  FAILED: 0,
  CONSUMED: 100,
};

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(IMPORTS_QUEUE)
    private readonly queue: Queue<ImportsJobData, void, ImportsJobName>,
  ) {}

  async create(userId: string, file: Express.Multer.File | undefined): Promise<ImportCreatedDto> {
    if (!file) {
      throw new AppException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Envie um arquivo.',
        status: HttpStatus.BAD_REQUEST,
      });
    }
    if (file.size > MAX_IMPORT_BYTES) throw importTooLarge();

    const mime = detectMimeByMagic(file.buffer);
    if (!mime) {
      throw new AppException({
        code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        message: 'Use PDF ou Word (.pdf ou .docx).',
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      });
    }

    const importId = randomUUID();
    const key = `imports/${importId}.${extensionFor(mime)}`;
    await this.storage.putObject({ key, body: file.buffer, contentType: mime });

    const job = await this.prisma.importJob.create({
      data: {
        id: importId,
        userId,
        fileKey: key,
        fileName: file.originalname,
        mimeType: mime,
        sizeBytes: file.size,
        status: ImportStatus.PENDING,
      },
    });

    await this.queue.add(
      'extract',
      { importJobId: importId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { age: 24 * 3600 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    );

    return { id: job.id, status: job.status };
  }

  async getDetail(userId: string, importId: string): Promise<ImportDetailDto> {
    const job = await this.prisma.importJob.findFirst({ where: { id: importId, userId } });
    if (!job) {
      throw new AppException({
        code: ErrorCode.IMPORT_NOT_FOUND,
        message: 'Importação não encontrada.',
        status: HttpStatus.NOT_FOUND,
      });
    }
    return this.toDetail(job);
  }

  async ensureCleanupScheduled(): Promise<void> {
    // Idempotente: upsertJobScheduler sobrescreve a configuracao se ja existir.
    await this.queue.upsertJobScheduler(
      CLEANUP_JOB_ID,
      { every: 60 * 60 * 1000 }, // 1 h
      {
        name: 'cleanup-stale',
        data: {},
        opts: {
          removeOnComplete: { count: 5 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      },
    );
  }

  private toDetail(job: {
    id: string;
    status: ImportStatus;
    pairs: unknown;
    pairsFound: number | null;
    pairsMissingAnswer: number | null;
    fileName: string;
    error: string | null;
  }): ImportDetailDto {
    return {
      id: job.id,
      status: job.status,
      progress: STATUS_PROGRESS[job.status] ?? 0,
      pairsFound: job.pairsFound,
      pairsMissingAnswer: job.pairsMissingAnswer,
      suggestedName: suggestName(job.fileName),
      pairs: pairsFromJson(job.pairs),
      error: job.error,
    };
  }
}

export function suggestName(fileName: string): string {
  const base = basename(fileName, extname(fileName));
  return base.replace(/[\s_]+/g, ' ').trim();
}

function pairsFromJson(raw: unknown): ImportPairDto[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportPairDto[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const obj = item as { question?: unknown; answer?: unknown };
      if (typeof obj.question === 'string' && obj.question.length > 0) {
        out.push({
          question: obj.question,
          answer: typeof obj.answer === 'string' ? obj.answer : null,
        });
      }
    }
  }
  return out;
}

export { MAX_IMPORT_BYTES };
