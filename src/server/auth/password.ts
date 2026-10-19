import bcrypt from "bcryptjs";

/** bcryptjs produces/accepts the same `$2a$`/`$2b$` hashes as the native `bcrypt` package used before. */
const ROUNDS = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Spend roughly the same time as a real hash so response timing doesn't reveal whether an account exists. */
export const dummyPasswordWork = () => bcrypt.hash(crypto.randomUUID(), ROUNDS);
