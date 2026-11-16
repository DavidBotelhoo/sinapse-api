import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({ example: 'davi@example.com' })
  @IsEmail({}, { message: 'Email invalido.' })
  @MaxLength(254, { message: 'Email longo demais.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({ example: 'minha-senha' })
  @IsString({ message: 'Informe a senha.' })
  @MaxLength(100, { message: 'Senha longa demais.' })
  password!: string;
}
