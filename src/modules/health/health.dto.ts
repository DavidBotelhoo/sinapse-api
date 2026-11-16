import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 42.1, description: 'Tempo (segundos) desde o boot.' })
  uptimeSeconds!: number;

  @ApiProperty({ example: '0.1.0' })
  version!: string;
}
