import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator';
import { ErrorResponseDto } from '../../common/errors/error-response.dto';
import { CatalogService } from './catalog.service';
import { CourseResponseDto } from './dto/course-response.dto';

@ApiTags('catalog')
@Controller('courses')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get(':slug')
  @Public()
  @ApiOkResponse({ type: CourseResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  findBySlug(@Param('slug') slug: string): Promise<CourseResponseDto> {
    return this.catalog.findCourseBySlug(slug);
  }
}
