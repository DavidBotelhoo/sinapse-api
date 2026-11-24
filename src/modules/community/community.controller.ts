import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { uuidParam } from '../../common/validation/params';
import { CommunityService } from './community.service';
import {
  CommunityDeckDetailDto,
  CommunityDeckListDto,
  CommunityDecksQueryDto,
} from './dto/community.dto';

@ApiTags('community')
@ApiCookieAuth('sn_access')
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('decks')
  @ApiOkResponse({ type: CommunityDeckListDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR: filtro invalido ou cursor de outra ordem.',
  })
  list(
    @CurrentUser() user: CurrentUserInfo,
    @Query() query: CommunityDecksQueryDto,
  ): Promise<CommunityDeckListDto> {
    return this.community.list(user.id, query);
  }

  @Get('decks/:id')
  @ApiOkResponse({ type: CommunityDeckDetailDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR: id invalido.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'DECK_NOT_FOUND: deck privado, excluido ou ocultado pela moderacao.',
  })
  preview(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) deckId: string,
  ): Promise<CommunityDeckDetailDto> {
    return this.community.preview(user.id, deckId);
  }
}
