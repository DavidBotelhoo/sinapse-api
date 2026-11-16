import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { REFRESH_COOKIE } from '../auth/cookies.util';
import { AvatarService, MAX_AVATAR_BYTES } from './avatar.service';
import { MeResponseDto } from './dto/me-response.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiCookieAuth('sn_access')
@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly avatars: AvatarService,
  ) {}

  @Get()
  @ApiOkResponse({ type: MeResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  async getMe(@CurrentUser() user: CurrentUserInfo): Promise<MeResponseDto> {
    return this.users.getMe(user.id);
  }

  @Patch()
  @ApiOkResponse({ type: MeResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  async updateMe(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: UpdateMeDto,
  ): Promise<MeResponseDto> {
    return this.users.updateMe(user.id, dto);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Senha trocada; outras sessoes foram revogadas.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  async changePassword(
    @CurrentUser() user: CurrentUserInfo,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    await this.users.changePassword(user.id, dto, cookies[REFRESH_COOKIE]);
  }

  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'JPG, PNG ou WebP, ate 5 MB.' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.PAYLOAD_TOO_LARGE, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE, type: ErrorResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: CurrentUserInfo,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<MeResponseDto> {
    return this.avatars.uploadFor(user.id, file);
  }
}
