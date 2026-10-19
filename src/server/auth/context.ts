import "server-only";
import { env } from "@/server/env";
import { createTokenService, type TokenService } from "./tokens";

let service: TokenService | undefined;

/** Token service bound to the configured secrets. */
export function tokens(): TokenService {
  if (!service) {
    const { JWT_SECRET, JWT_REFRESH_SECRET } = env();
    service = createTokenService({ accessSecret: JWT_SECRET, refreshSecret: JWT_REFRESH_SECRET });
  }
  return service;
}
