import { ApiProperty } from '@nestjs/swagger';

export class SubjectDto {
  @ApiProperty({ example: '7f1f2c6c-5a2a-4e2e-8f1e-9c7f9e0a1b2c' })
  id!: string;

  @ApiProperty({ example: 'anatomia' })
  slug!: string;

  @ApiProperty({ example: 'Anatomia' })
  name!: string;
}

export class CourseResponseDto {
  @ApiProperty({ example: '0a7c...' })
  id!: string;

  @ApiProperty({ example: 'medicina' })
  slug!: string;

  @ApiProperty({ example: 'Medicina' })
  name!: string;

  @ApiProperty({ example: 6 })
  years!: number;

  @ApiProperty({ type: SubjectDto, isArray: true })
  subjects!: SubjectDto[];
}
