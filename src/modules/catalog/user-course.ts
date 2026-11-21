import type { PrismaService } from '../../prisma/prisma.service';

export const DEFAULT_COURSE_SLUG = 'medicina';

// Curso do usuario; sem curso escolhido, vale Medicina (o unico curso por enquanto).
export async function resolveUserCourseId(prisma: PrismaService, userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { courseId: true },
  });
  if (user.courseId) return user.courseId;
  const fallback = await prisma.course.findUniqueOrThrow({
    where: { slug: DEFAULT_COURSE_SLUG },
    select: { id: true },
  });
  return fallback.id;
}
