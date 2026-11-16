import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportsProcessor } from './imports.processor';
import { PatternPairExtractor } from './extract/pattern-pair-extractor';
import { PairExtractor } from './extract/pair-extractor';
import { IMPORTS_QUEUE } from './imports.types';

@Module({
  imports: [BullModule.registerQueue({ name: IMPORTS_QUEUE })],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    ImportsProcessor,
    PatternPairExtractor,
    { provide: PairExtractor, useExisting: PatternPairExtractor },
  ],
  exports: [ImportsService],
})
export class ImportsModule implements OnApplicationBootstrap {
  constructor(private readonly imports: ImportsService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.imports.ensureCleanupScheduled();
  }
}
