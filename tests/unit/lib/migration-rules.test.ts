import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs helper shared with the CLI script
import { checkMigrations, findDestructiveStatements, stripSqlComments } from "../../../scripts/lib/migration-rules.mjs";

type Input = Parameters<typeof checkMigrations>[0];
const LOCK = 'provider = "postgresql"\n';
const INIT = "20261019000000_init";

const run = (overrides: Partial<Input> = {}) =>
  checkMigrations({
    directories: [INIT],
    sql: { [INIT]: 'CREATE TABLE "x" ("id" SERIAL);' },
    lockfile: LOCK,
    ...overrides,
  }) as { errors: string[]; warnings: string[]; newMigrations: string[] };

describe("structure rules", () => {
  it("passes a well-formed history", () => {
    expect(run().errors).toEqual([]);
  });

  it("requires the postgresql lock file", () => {
    expect(run({ lockfile: null }).errors[0]).toMatch(/migration_lock\.toml/);
    expect(run({ lockfile: 'provider = "mysql"' }).errors[0]).toMatch(/postgresql/);
  });

  it.each(["init", "2026_init", "20261019000000-Init", "20261019000000_AddThing"])("rejects folder name %s", (name) => {
    const { errors } = run({ directories: [name], sql: { [name]: "SELECT 1;" } });
    expect(errors.some((e) => e.includes("name must look like"))).toBe(true);
  });

  it("rejects missing or comment-only migration.sql", () => {
    expect(run({ sql: { [INIT]: null } as never }).errors[0]).toMatch(/missing migration\.sql/);
    expect(run({ sql: { [INIT]: "-- nothing here\n/* nor here */" } }).errors[0]).toMatch(/empty/);
  });

  it("rejects duplicate timestamps", () => {
    const a = "20261020000000_a";
    const b = "20261020000000_b";
    const { errors } = run({ directories: [INIT, a, b], sql: { [INIT]: "SELECT 1;", [a]: "SELECT 1;", [b]: "SELECT 1;" } });
    expect(errors).toContain("More than one migration uses timestamp 20261020000000.");
  });
});

describe("immutability and ordering against the base branch", () => {
  const next = "20261101090000_add_vehicle_colour";
  const withNext = {
    directories: [INIT, next],
    sql: { [INIT]: "CREATE TABLE x();", [next]: 'ALTER TABLE "vehicles" ADD COLUMN "colour" TEXT;' },
    baseDirectories: [INIT],
  };

  it("accepts a new migration after the latest merged one", () => {
    expect(run(withNext)).toMatchObject({ errors: [], newMigrations: [next] });
  });

  it.each([
    ["M", "edit"],
    ["D", "delete"],
  ])("rejects status %s on a merged migration (%s)", (status, verb) => {
    const { errors } = run({ ...withNext, changedFiles: [{ status, path: `prisma/migrations/${INIT}/migration.sql` }] });
    expect(errors.some((e) => e.includes(`never ${verb}`))).toBe(true);
  });

  it("allows editing a migration that only exists on this branch", () => {
    const { errors } = run({ ...withNext, changedFiles: [{ status: "M", path: `prisma/migrations/${next}/migration.sql` }] });
    expect(errors).toEqual([]);
  });

  it("rejects merged migrations that disappeared", () => {
    const { errors } = run({ baseDirectories: [INIT, "20261020000000_gone"] });
    expect(errors.some((e) => e.includes("20261020000000_gone") && e.includes("missing"))).toBe(true);
  });

  it("rejects a new migration that sorts before the latest merged one", () => {
    const late = "20261102000000_merged_first";
    const early = "20261101000000_written_earlier";
    const { errors } = run({
      directories: [INIT, early, late],
      sql: { [INIT]: "SELECT 1;", [early]: "SELECT 1;", [late]: "SELECT 1;" },
      baseDirectories: [INIT, late],
    });
    expect(errors.some((e) => e.startsWith(early) && e.includes("not after the latest merged migration"))).toBe(true);
  });
});

describe("destructive statement guard", () => {
  const dir = "20261101090000_cleanup";
  const check = (sqlText: string) =>
    run({ directories: [INIT, dir], sql: { [INIT]: "SELECT 1;", [dir]: sqlText }, baseDirectories: [INIT] });

  it.each([
    ['ALTER TABLE "users" DROP COLUMN "legacy";', "drop-column"],
    ['DROP TABLE "old";', "drop-table"],
    ['TRUNCATE "feedback";', "truncate"],
    ['DELETE FROM "feedback";', "delete-without-where"],
    ['ALTER TABLE "users" ALTER COLUMN "name" SET DATA TYPE VARCHAR(20);', "alter-type"],
    ['ALTER TABLE "users" ALTER COLUMN "phone_number" SET NOT NULL;', "set-not-null"],
    ['ALTER TABLE "users" RENAME COLUMN "name" TO "full_name";', "rename"],
  ])("flags %s", (sqlText, id) => {
    expect(findDestructiveStatements(sqlText).map((d: { id: string }) => d.id)).toContain(id);
    expect(check(sqlText).errors.some((e) => e.includes(`(${id})`))).toBe(true);
  });

  it("accepts an approved destructive migration, with a warning", () => {
    const result = check('-- migration-safety: destructive-approved column unused since v2.1\nALTER TABLE "users" DROP COLUMN "legacy";');
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("drop-column"))).toBe(true);
  });

  it("ignores SQL inside comments and safe statements", () => {
    expect(findDestructiveStatements('-- DROP TABLE "x";\n/* TRUNCATE y */\nDELETE FROM "x" WHERE "id" = 1;')).toEqual([]);
    expect(check('ALTER TABLE "vehicles" ADD COLUMN "colour" TEXT;').errors).toEqual([]);
  });

  it("only applies to new migrations, not the merged history", () => {
    const { errors } = run({ sql: { [INIT]: 'DROP TABLE "legacy";' }, baseDirectories: [INIT] });
    expect(errors).toEqual([]);
  });

  it("stripSqlComments keeps code intact", () => {
    expect(stripSqlComments("SELECT 1; -- hi\n/* x */SELECT 2;")).toBe("SELECT 1; \nSELECT 2;");
  });
});
