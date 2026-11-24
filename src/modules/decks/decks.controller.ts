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
import { RequiresActiveSubscription } from '../../common/auth/requires-active-subscription.guard';
import { CurrentUser, type CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { loadUserTimezone } from '../../common/time/user-timezone';
import { optionalIntQuery, uuidParam } from '../../common/validation/params';
import { PrismaService } from '../../prisma/prisma.service';
import { DeckReportsService } from './deck-reports.service';
import { DecksService } from './decks.service';
import { CreateDeckDto } from './dto/create-deck.dto';
import { UpdateDeckDto } from './dto/update-deck.dto';
import { ListDecksQueryDto } from './dto/list-decks.query.dto';
import { AppendImportDto } from './dto/cards.dto';
import { ReportDeckDto } from './dto/report-deck.dto';
import { DeckDetailDto, DeckListItemDto, DeckListResponseDto } from './dto/common.dto';

const BAD_ID = 'VALIDATION_ERROR: id invalido.';
const DECK_404 =
  'DECK_NOT_FOUND: deck que o usuario nao tem (ou de outra pessoa, se so o dono pode).';
const IMPORT_ERRORS = {
  notFound: 'IMPORT_NOT_FOUND (importacao de outra pessoa ou inexistente) ou DECK_NOT_FOUND.',
  badRequest: 'VALIDATION_ERROR ou IMPORT_NOT_READY (o arquivo ainda esta sendo lido).',
  conflict: 'IMPORT_ALREADY_USED: essa importacao ja virou cards.',
};

@ApiTags('decks')
@ApiCookieAuth('sn_access')
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
@Controller('decks')
export class DecksController {
  constructor(
    private readonly decks: DecksService,
    private readonly reports: DeckReportsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOkResponse({ type: DeckListResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR: filtro ou cursor invalido.',
  })
  async list(
    @CurrentUser() user: CurrentUserInfo,
    @Query() query: ListDecksQueryDto,
  ): Promise<DeckListResponseDto> {
    const timezone = await loadUserTimezone(this.prisma, user.id);
    return this.decks.list(user.id, timezone, query);
  }

  @Get('recent')
  @ApiOkResponse({ type: DeckListItemDto, isArray: true })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR: limit nao e numero.',
  })
  async recent(
    @CurrentUser() user: CurrentUserInfo,
    @Query('limit', optionalIntQuery('limit')) limit?: number,
  ): Promise<DeckListItemDto[]> {
    const tz = await loadUserTimezone(this.prisma, user.id);
    const clamped = Math.min(Math.max(limit ?? 4, 1), 20);
    return this.decks.recent(user.id, tz, clamped);
  }

  @Post()
  @RequiresActiveSubscription()
  @ApiCreatedResponse({ type: DeckDetailDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: IMPORT_ERRORS.badRequest,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'IMPORT_NOT_FOUND',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponseDto,
    description: IMPORT_ERRORS.conflict,
  })
  async create(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: CreateDeckDto,
  ): Promise<DeckDetailDto> {
    return this.decks.create(user.id, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: DeckDetailDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto, description: BAD_ID })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto, description: DECK_404 })
  async detail(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
  ): Promise<DeckDetailDto> {
    const tz = await loadUserTimezone(this.prisma, user.id);
    return this.decks.findDetail(user.id, tz, deckId);
  }

  @Patch(':id')
  @ApiOkResponse({ type: DeckDetailDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto, description: DECK_404 })
  async update(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
    @Body() dto: UpdateDeckDto,
  ): Promise<DeckDetailDto> {
    return this.decks.update(user.id, deckId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto, description: BAD_ID })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto, description: DECK_404 })
  async delete(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
  ): Promise<void> {
    await this.decks.delete(user.id, deckId);
  }

  @Post(':id/imports')
  @RequiresActiveSubscription()
  @ApiOkResponse({ type: DeckDetailDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: IMPORT_ERRORS.badRequest,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: IMPORT_ERRORS.notFound,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponseDto,
    description: IMPORT_ERRORS.conflict,
  })
  async appendImport(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
    @Body() dto: AppendImportDto,
  ): Promise<DeckDetailDto> {
    return this.decks.appendImport(user.id, deckId, dto.importId);
  }

  @Put(':id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto, description: BAD_ID })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto, description: DECK_404 })
  async favorite(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
  ): Promise<void> {
    await this.decks.addFavorite(user.id, deckId);
  }

  @Delete(':id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Sem favorito, responde igual.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto, description: BAD_ID })
  async unfavorite(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
  ): Promise<void> {
    await this.decks.removeFavorite(user.id, deckId);
  }

  @Put(':id/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto, description: BAD_ID })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'DECK_NOT_FOUND: deck privado, excluido, ocultado ou do proprio usuario.',
  })
  async save(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
  ): Promise<void> {
    await this.decks.save(user.id, deckId);
  }

  @Delete(':id/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Se nao estava salvo, responde igual.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto, description: BAD_ID })
  async unsave(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
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
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description:
      'DECK_NOT_FOUND: deck privado, excluido, do proprio usuario ou ocultado (para quem nao salvou).',
  })
  async report(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
    @Body() dto: ReportDeckDto,
  ): Promise<void> {
    await this.reports.report(user.id, deckId, dto);
  }
}
