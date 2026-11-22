-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "lastEventAt" TIMESTAMP(3),
ADD COLUMN     "paymentFailedAt" TIMESTAMP(3),
ALTER COLUMN "plan" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- Contas criadas antes desta etapa entram no teste grátis de 7 dias a partir de agora
-- (quem se cadastra depois ganha o teste no próprio cadastro, com BILLING_TRIAL_DAYS).
INSERT INTO "Subscription" ("id", "userId", "provider", "status", "trialEndsAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u."id", 'none', 'TRIALING', now() + interval '7 days', now(), now()
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."userId" = u."id");
