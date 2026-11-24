import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiresActiveSubscription } from '../../common/auth/requires-active-subscription.guard';
import { CurrentUser, type CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { FileUpload } from '../../common/upload/file-upload.interceptor';
import { uuidParam } from '../../common/validation/params';
import { ImportsService, MAX_IMPORT_BYTES, importTooLarge } from './imports.service';
import { ImportCreatedDto, ImportDetailDto } from './dto/import.dto';

@ApiTags('imports')
@ApiCookieAuth('sn_access')
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponseDto })
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  @RequiresActiveSubscription()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF ou DOCX, ate 20 MB.' },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: ImportCreatedDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.PAYLOAD_TOO_LARGE, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE, type: ErrorResponseDto })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    type: ErrorResponseDto,
    description: 'TOO_MANY_REQUESTS: ate 10 envios por minuto.',
  })
  @UseInterceptors(FileUpload('file', MAX_IMPORT_BYTES, importTooLarge))
  async create(
    @CurrentUser() user: CurrentUserInfo,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCreatedDto> {
    return this.imports.create(user.id, file);
  }

  @Get(':id')
  @ApiOkResponse({ type: ImportDetailDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR: id invalido.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description: 'IMPORT_NOT_FOUND',
  })
  async detail(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', uuidParam()) importId: string,
  ): Promise<ImportDetailDto> {
    return this.imports.getDetail(user.id, importId);
  }
}
