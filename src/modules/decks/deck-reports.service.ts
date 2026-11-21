import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import type { Prisma } from '../../generated/prisma/client';
import { DeckVisibility, ReportStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import type { ReportDeckDto } from './dto/report-deck.dto';

// Quem pode denunciar: deck publico, nao excluido e de outra pessoa, que esteja na
// Comunidade ou que o usuario tenha salvo (quem salvou continua vendo um deck ocultado).
export function reportableDeckWhere(userId: string, deckId: string): Prisma.DeckWhereInput {
  return {
    id: deckId,
    deletedAt: null,
    visibility: DeckVisibility.PUBLIC,
    ownerId: { not: userId },
    OR: [{ hiddenAt: null }, { saves: { some: { userId } } }],
  };
}

@Injectable()
export class DeckReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Uma denuncia por usuario e deck: repetir troca o motivo e devolve para a fila (OPEN).
  async report(userId: string, deckId: string, dto: ReportDeckDto): Promise<void> {
    const deck = await this.prisma.deck.findFirst({
      where: reportableDeckWhere(userId, deckId),
      select: { id: true },
    });
    if (!deck) {
      throw new AppException({
        code: ErrorCode.DECK_NOT_FOUND,
        message: 'Deck nao encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }

    const details = dto.details ?? null;
    await this.prisma.deckReport.upsert({
      where: { deckId_reporterId: { deckId, reporterId: userId } },
      create: { deckId, reporterId: userId, reason: dto.reason, details },
      update: { reason: dto.reason, details, status: ReportStatus.OPEN, resolvedAt: null },
    });
  }
}
