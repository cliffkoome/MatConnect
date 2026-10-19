import { vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Deep Prisma mock. Use together with:
 *
 *   vi.mock("@/server/db", async () => (await import("../support/db-mock")).dbModule);
 *   import { dbMock } from "../support/db-mock";
 */
export const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

export function resetDbMock() {
  mockReset(dbMock);
  // Interactive transactions run the callback against the same mock; batch transactions resolve all.
  dbMock.$transaction.mockImplementation((async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(dbMock) : Promise.all(arg as unknown[])) as never);
}

export const dbModule = {
  db: dbMock,
  getDb: () => dbMock,
  resolveDriver: vi.fn(),
};
