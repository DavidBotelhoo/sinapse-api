import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { DeckReportsService } from './deck-reports.service';
import { DecksService } from './decks.service';
import { CreateDeckDto } from './dto/create-deck.dto';
import { UpdateDeckDto } from './dto/update-deck.dto';
import { ListDecksQueryDto } from './dto/list-decks.query.dto';
import { AppendImportDto } from './dto/cards.dto';
import { ReportDeckDto } from './dto/report-deck.dto';
import {
  DeckDetailDto,
  DeckListItemDto,
  DeckListResponseDto,
} from './dto/common.dto';

@ApiTags('decks')
@ApiCookieAuth('sn_access')
@Controller('decks')
export class DecksController {
  constructor(
    private readonly decks: DecksService,
    private readonly reports: DeckReportsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOkResponse({ type: DeckListResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  async list(
    @CurrentUser() user: CurrentUserInfo,
    @Query() query: ListDecksQueryDto,
  ): Promise<DeckListResponseDto> {
    const timezone = await this.timezone(user.id);
    return this.decks.list(user.id, timezone, query);
  }

  @Get('recent')
  @ApiOkResponse({ type: DeckListItemDto, isArray: true })
  async recent(
    @CurrentUser() user: CurrentUserInfo,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<DeckListItemDto[]> {
    const tz = await this.timezone(user.id);
    const clamped = Math.min(Math.max(limit ?? 4, 1), 20);
    return this.decks.recent(user.id, tz, clamped);
  }

  @Post()
  @ApiCreatedResponse({ type: DeckDetailDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async create(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: CreateDeckDto,
  ): Promise<DeckDetailDto> {
    return this.decks.create(user.id, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: DeckDetailDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async detail(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
  ): Promise<DeckDetailDto> {
    const tz = await this.timezone(user.id);
    return this.decks.findDetail(user.id, tz, deckId);
  }

  @Patch(':id')
  @ApiOkResponse({ type: DeckDetailDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
    @Body() dto: UpdateDeckDto,
  ): Promise<DeckDetailDto> {
    return this.decks.update(user.id, deckId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async delete(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
  ): Promise<void> {
    await this.decks.delete(user.id, deckId);
  }

  @Post(':id/imports')
  @ApiOkResponse({ type: DeckDetailDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async appendImport(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
    @Body() dto: AppendImportDto,
  ): Promise<DeckDetailDto> {
    return this.decks.appendImport(user.id, deckId, dto.importId);
  }

  @Put(':id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async favorite(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
  ): Promise<void> {
    await this.decks.addFavorite(user.id, deckId);
  }

  @Delete(':id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async unfavorite(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
  ): Promise<void> {
    await this.decks.removeFavorite(user.id, deckId);
  }

  @Put(':id/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async save(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
  ): Promise<void> {
    await this.decks.save(user.id, deckId);
  }

  @Delete(':id/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async unsave(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
  ): Promise<void> {
    await this.decks.unsave(user.id, deckId);
  }

  @Post(':id/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'Denuncia registrada. Uma por usuario e deck: repetir troca o motivo e reabre a denuncia.',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description:
      'DECK_NOT_FOUND: deck privado, excluido, do proprio usuario ou ocultado (para quem nao salvou).',
  })
  async report(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) deckId: string,
    @Body() dto: ReportDeckDto,
  ): Promise<void> {
    await this.reports.report(user.id, deckId, dto);
  }

  private async timezone(userId: string): Promise<string> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    return u.timezone;
  }
}
