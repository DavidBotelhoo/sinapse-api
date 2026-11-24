import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { PrismaService } from '../../prisma/prisma.service';
import type { CourseResponseDto } from './dto/course-response.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async findCourseBySlug(slug: string): Promise<CourseResponseDto> {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        subjects: {
          orderBy: { name: 'asc' },
          select: { id: true, slug: true, name: true },
        },
      },
    });

    if (!course) {
      throw new AppException({
        code: ErrorCode.COURSE_NOT_FOUND,
        message: 'Curso não encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }

    return {
      id: course.id,
      slug: course.slug,
      name: course.name,
      years: course.years,
      subjects: course.subjects,
    };
  }
}
