import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { AgendaDto, AgendaQueryDto, MeStatsDto } from './dto/stats.dto';
import { StatsService } from './stats.service';

@ApiTags('stats')
@ApiCookieAuth('sn_access')
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
@Controller('me')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('stats')
  @ApiOkResponse({
    type: MeStatsDto,
    description: 'Cards de estatistica da tela Inicio (fuso do usuario).',
  })
  async getStats(@CurrentUser() user: CurrentUserInfo): Promise<MeStatsDto> {
    return this.stats.getStats(user.id);
  }

  @Get('agenda')
  @ApiOkResponse({
    type: AgendaDto,
    description: 'Agenda de revisao: total por dia e decks do dia escolhido.',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  async getAgenda(
    @CurrentUser() user: CurrentUserInfo,
    @Query() query: AgendaQueryDto,
  ): Promise<AgendaDto> {
    return this.stats.getAgenda(user.id, query);
  }
}
