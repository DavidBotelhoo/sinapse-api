import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    {
      // STORAGE_DRIVER escolhe onde ficam os arquivos: disco (dev) ou bucket S3/R2.
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): StorageService =>
        config.get('STORAGE_DRIVER', { infer: true }) === 's3'
          ? new S3StorageService(config)
          : new LocalStorageService(config),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
