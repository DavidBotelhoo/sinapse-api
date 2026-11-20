import type { PrismaService } from '../../prisma/prisma.service';
import { resolveTimezone } from './user-day';

// Fuso do usuario logado (perfil), ja validado.
export async function loadUserTimezone(prisma: PrismaService, userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  return resolveTimezone(user.timezone);
}
