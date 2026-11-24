import { randomBytes } from 'node:crypto';
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
  private dummyHash: Promise<string> | null = null;

  hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  verify(digest: string, plain: string): Promise<boolean> {
    return verify(digest, plain);
  }

  // Login com email que nao existe: faz o mesmo trabalho de conferir uma senha, para o tempo
  // de resposta nao revelar se o email tem conta. Sempre falso.
  async verifyAgainstNothing(plain: string): Promise<false> {
    this.dummyHash ??= this.hash(randomBytes(16).toString('hex'));
    await this.verify(await this.dummyHash, plain);
    return false;
  }
}
