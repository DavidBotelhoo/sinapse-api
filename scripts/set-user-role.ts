// Muda o papel de uma conta. ADMIN e SUPER_ADMIN tem acesso vitalicio (a assinatura nao vence).
//
//   pnpm users:set-role <email> <USER|ADMIN|SUPER_ADMIN>
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { UserRole } from '../src/generated/prisma/enums';

const USAGE = 'Uso: pnpm users:set-role <email> <USER|ADMIN|SUPER_ADMIN>';

async function main(): Promise<void> {
  const [email, roleArg] = process.argv.slice(2).filter((a) => a !== '--');
  const role = Object.values(UserRole).find((r) => r === roleArg?.toUpperCase());
  if (!email || !role) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL nao definida.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, role: true },
    });
    if (!user) {
      console.error(`Nenhuma conta com o email ${normalized}.`);
      process.exitCode = 1;
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { role } });
    console.log(`${normalized}: ${user.role} -> ${role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
