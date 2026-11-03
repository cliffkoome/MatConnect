-- Move identity to Neon Auth (Managed Better Auth). Users, credentials and sessions now live in the
-- `neon_auth` schema; `users` keeps the app profile (role, phone, disabled) and links to it by id.
--
-- migration-safety: destructive-approved MatConnect has not gone live on Neon (the first deploy never ran) and starts with no user data, so the password, Google ID, 2FA and token columns and revoked_tokens hold nothing; Neon Auth replaces all of them.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "auth_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- DropIndex
DROP INDEX "users_google_id_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password",
DROP COLUMN "google_id",
DROP COLUMN "two_factor_secret",
DROP COLUMN "two_factor_enabled",
DROP COLUMN "tokens_valid_from";

-- DropTable
DROP TABLE "revoked_tokens";
