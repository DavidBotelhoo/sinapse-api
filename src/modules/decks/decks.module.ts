import { Module } from '@nestjs/common';
import { DecksController } from './decks.controller';
import { CardsController } from './cards.controller';
import { DecksService } from './decks.service';
import { CardsService } from './cards.service';
import { CardStatusService } from './card-status.service';
import { DeckReportsService } from './deck-reports.service';

@Module({
  controllers: [DecksController, CardsController],
  providers: [DecksService, CardsService, CardStatusService, DeckReportsService],
  exports: [CardStatusService],
})
export class DecksModule {}
