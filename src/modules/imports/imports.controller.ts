import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type CurrentUserInfo } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { ImportsService, MAX_IMPORT_BYTES } from './imports.service';
import { ImportCreatedDto, ImportDetailDto } from './dto/import.dto';

@ApiTags('imports')
@ApiCookieAuth('sn_access')
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  async create(
    @CurrentUser() user: CurrentUserInfo,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportCreatedDto> {
    return this.imports.create(user.id, file);
  }

  @Get(':id')
  @ApiOkResponse({ type: ImportDetailDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async detail(
    @CurrentUser() user: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe({ version: '4' })) importId: string,
  ): Promise<ImportDetailDto> {
    return this.imports.getDetail(user.id, importId);
  }
}
