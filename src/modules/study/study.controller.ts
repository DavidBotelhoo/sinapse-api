import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiresActiveSubscription } from '../../common/auth/requires-active-subscription.guard';
import { CurrentUser, type CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { uuidParam } from '../../common/validation/params';
import {
  CreateReviewDto,
  CreateStudySessionDto,
  ReviewResultDto,
  StudyOverviewDto,
  StudySessionDto,
  StudySessionSummaryDto,
} from './dto/study.dto';
import { StudyService } from './study.service';

const sessionIdPipe = uuidParam();

@ApiTags('study')
@ApiCookieAuth('sn_access')
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
@Controller('study')
export class StudyController {
  constructor(private readonly study: StudyService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Tela Estudar: Revisao de hoje e as opcoes por materia e por deck.' })
  @ApiOkResponse({ type: StudyOverviewDto })
  async overview(@CurrentUser() user: CurrentUserInfo): Promise<StudyOverviewDto> {
    return this.study.overview(user.id);
  }

  @Post('sessions')
  @RequiresActiveSubscription()
  @ApiOperation({
    summary: 'Monta uma sessao: atrasados, depois os de hoje, depois os novos; corta no limite.',
  })
  @ApiCreatedResponse({ type: StudySessionDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR (nada escolhido, ou mode=today com deckIds/subjectIds).',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'DECK_NOT_FOUND',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponseDto,
    description: 'NOTHING_TO_STUDY: nenhum card pendente ou novo na selecao.',
  })
  async create(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: CreateStudySessionDto,
  ): Promise<StudySessionDto> {
    return this.study.createSession(user.id, dto);
  }

  @Get('sessions/:id')
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR: id invalido.',
  })
  @ApiOperation({
    summary: 'Uma sessao com os cards, o que ja foi avaliado e se terminou (para retomar).',
  })
  @ApiOkResponse({ type: StudySessionDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'STUDY_SESSION_NOT_FOUND',
  })
  async get(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', sessionIdPipe) sessionId: string,
  ): Promise<StudySessionDto> {
    return this.study.getSession(user.id, sessionId);
  }

  @Post('sessions/:id/reviews')
  @RequiresActiveSubscription()
  @ApiOperation({ summary: 'Avalia um card da sessao (FSRS) e grava o ReviewLog.' })
  @ApiCreatedResponse({ type: ReviewResultDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR ou CARD_NOT_IN_SESSION.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'STUDY_SESSION_NOT_FOUND ou CARD_NOT_FOUND (card excluido durante a sessao).',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponseDto,
    description: 'STUDY_SESSION_FINISHED ou CARD_ALREADY_REVIEWED.',
  })
  async review(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', sessionIdPipe) sessionId: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResultDto> {
    return this.study.review(user.id, sessionId, dto);
  }

  @Post('sessions/:id/finish')
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR: id invalido.',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerra a sessao e devolve o resumo. Pode ser chamado de novo.' })
  @ApiOkResponse({ type: StudySessionSummaryDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'STUDY_SESSION_NOT_FOUND',
  })
  async finish(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', sessionIdPipe) sessionId: string,
  ): Promise<StudySessionSummaryDto> {
    return this.study.finish(user.id, sessionId);
  }

  @Post('sessions/:id/repeat')
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR: id invalido.',
  })
  @RequiresActiveSubscription()
  @ApiOperation({ summary: '"Estudar novamente": nova sessao com os mesmos cards.' })
  @ApiCreatedResponse({ type: StudySessionDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'STUDY_SESSION_NOT_FOUND',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponseDto,
    description: 'NOTHING_TO_STUDY: nenhum dos cards esta mais disponivel.',
  })
  async repeat(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', sessionIdPipe) sessionId: string,
  ): Promise<StudySessionDto> {
    return this.study.repeat(user.id, sessionId);
  }
}
