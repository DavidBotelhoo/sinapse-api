import { ApiProperty } from '@nestjs/swagger';
import { ImportStatus } from '../../../generated/prisma/enums';

export class ImportCreatedDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ImportStatus }) status!: ImportStatus;
}

export class ImportPairDto {
  @ApiProperty() question!: string;
  @ApiProperty({ nullable: true }) answer!: string | null;
}

export class ImportDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ImportStatus }) status!: ImportStatus;
  @ApiProperty({ example: 50, description: '0..100.' }) progress!: number;
  @ApiProperty({ nullable: true }) pairsFound!: number | null;
  @ApiProperty({ nullable: true }) pairsMissingAnswer!: number | null;
  @ApiProperty() suggestedName!: string;
  @ApiProperty({ type: ImportPairDto, isArray: true })
  pairs!: ImportPairDto[];
  @ApiProperty({ nullable: true }) error!: string | null;
}
