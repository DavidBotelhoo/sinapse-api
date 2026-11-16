import { Module } from '@nestjs/common';
import { DecksController } from './decks.controller';
import { CardsController } from './cards.controller';
import { DecksService } from './decks.service';
import { CardsService } from './cards.service';
import { CardStatusService } from './card-status.service';

@Module({
  controllers: [DecksController, CardsController],
  providers: [DecksService, CardsService, CardStatusService],
  exports: [CardStatusService],
})
export class DecksModule {}
