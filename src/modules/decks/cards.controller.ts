import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
@Controller()
export class CardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('decks/:id/cards')
  @ApiOkResponse({ type: CardListResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async list(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
    @Query() query: ListCardsQueryDto,
  ): Promise<CardListResponseDto> {
    const tz = await this.timezone(user.id);
    return this.cards.list(user.id, tz, deckId, query);
  }

  @Post('decks/:id/cards')
  @ApiCreatedResponse({ type: CardItemDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async create(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
    @Body() dto: CreateCardDto,
  ): Promise<CardItemDto> {
    return this.cards.create(user.id, deckId, dto);
  }

  @Patch('cards/:id')
  @ApiOkResponse({ type: CardItemDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) cardId: string,
    @Body() dto: UpdateCardDto,
  ): Promise<CardItemDto> {
    return this.cards.update(user.id, cardId, dto);
  }

  @Delete('cards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async delete(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) cardId: string,
  ): Promise<void> {
    await this.cards.delete(user.id, cardId);
  }

  private async timezone(userId: string): Promise<string> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    return u.timezone;
  }
}
