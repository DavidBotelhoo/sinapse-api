import { ApiProperty } from '@nestjs/swagger';
import type { Type } from '@nestjs/common';

export function PaginatedDto<T>(itemType: Type<T>): Type<{ items: T[]; nextCursor: string | null }> {
  class Page {
    @ApiProperty({ type: itemType, isArray: true })
    items!: T[];

    @ApiProperty({ type: String, nullable: true, example: null })
    nextCursor!: string | null;
  }

  Object.defineProperty(Page, 'name', { value: `Paginated${itemType.name}` });
  return Page;
}
