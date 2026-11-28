import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AvatarFilesController } from './avatar-files.controller';
import { AvatarService } from './avatar.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersSharedModule } from './users-shared.module';

@Module({
  imports: [UsersSharedModule, forwardRef(() => AuthModule)],
  controllers: [UsersController, AvatarFilesController],
  providers: [UsersService, AvatarService],
})
export class UsersModule {}
