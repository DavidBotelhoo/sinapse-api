import { Module } from '@nestjs/common';
import { UserMapper } from './user.mapper';

// Exporta pecas de users que o AuthModule precisa (UserMapper), sem puxar o controller
// de users nem criar ciclo entre AuthModule e UsersModule.
@Module({
  providers: [UserMapper],
  exports: [UserMapper],
})
export class UsersSharedModule {}
