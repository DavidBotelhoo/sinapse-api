import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { loadUserTimezone } from '../../common/time/user-timezone';
import { uuidParam } from '../../common/validation/params';
import { PrismaService } from '../../prisma/prisma.service';
import { CardsService } from './cards.service';
import {
  CardItemDto,
  CardListResponseDto,
  CreateCardDto,
  ListCardsQueryDto,
  UpdateCardDto,
} from './dto/cards.dto';

@ApiCookieAuth('sn_access')
@ApiTags('cards')
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
@ApiResponse({
  status: HttpStatus.BAD_REQUEST,
  type: ErrorResponseDto,
  description: 'VALIDATION_ERROR: id, filtro, cursor ou campos invalidos.',
})
@Controller()
export class CardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('decks/:id/cards')
  @ApiOkResponse({ type: CardListResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'DECK_NOT_FOUND',
  })
  async list(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
    @Query() query: ListCardsQueryDto,
  ): Promise<CardListResponseDto> {
    const tz = await loadUserTimezone(this.prisma, user.id);
    return this.cards.list(user.id, tz, deckId, query);
  }

  @Post('decks/:id/cards')
  @ApiCreatedResponse({ type: CardItemDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'DECK_NOT_FOUND (so o dono adiciona cards)',
  })
  async create(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
    @Body() dto: CreateCardDto,
  ): Promise<CardItemDto> {
    return this.cards.create(user.id, deckId, dto);
  }

  @Patch('cards/:id')
  @ApiOkResponse({ type: CardItemDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'CARD_NOT_FOUND (so o dono edita)',
  })
  async update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) cardId: string,
    @Body() dto: UpdateCardDto,
  ): Promise<CardItemDto> {
    const tz = await loadUserTimezone(this.prisma, user.id);
    return this.cards.update(user.id, tz, cardId, dto);
  }

  @Delete('cards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'CARD_NOT_FOUND (so o dono remove)',
  })
  async delete(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) cardId: string,
  ): Promise<void> {
    await this.cards.delete(user.id, cardId);
  }
}
