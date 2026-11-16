import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'senha-atual' })
  @IsString({ message: 'Informe a senha atual.' })
  @MinLength(1, { message: 'Informe a senha atual.' })
  @MaxLength(100, { message: 'Senha longa demais.' })
  currentPassword!: string;

  @ApiProperty({ example: 'nova-senha' })
  @IsString({ message: 'Informe a nova senha.' })
  @MinLength(8, { message: 'Use pelo menos 8 caracteres.' })
  @MaxLength(100, { message: 'Senha longa demais.' })
  newPassword!: string;
}
