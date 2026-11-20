import { Module } from '@nestjs/common';
import { DecksModule } from '../decks/decks.module';
import { StatsModule } from '../stats/stats.module';
import { FsrsService } from './fsrs/fsrs.service';
import { StudyController } from './study.controller';
import { StudyService } from './study.service';

@Module({
  imports: [DecksModule, StatsModule],
  controllers: [StudyController],
  providers: [StudyService, FsrsService],
})
export class StudyModule {}
