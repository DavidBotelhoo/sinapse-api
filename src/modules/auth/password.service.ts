import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import type { HashOptions } from 'argon2';

const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 1 << 16, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  verify(digest: string, plain: string): Promise<boolean> {
    return verify(digest, plain);
  }
}
