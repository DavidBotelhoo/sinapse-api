import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { buildLoggerOptions } from './config/logger.config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './modules/storage/storage.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DecksModule } from './modules/decks/decks.module';
import { ImportsModule } from './modules/imports/imports.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [NestConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildLoggerOptions(config.get('NODE_ENV', { infer: true })),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    StorageModule,
    CatalogModule,
    DecksModule,
    ImportsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
