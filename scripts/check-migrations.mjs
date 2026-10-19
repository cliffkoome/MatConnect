#!/usr/bin/env node
// Enforces the migration rules in docs/MIGRATIONS.md.
//
//   npm run db:migrate:check                          # local: structure + destructive-SQL checks
//   MIGRATIONS_BASE_REF=origin/main npm run db:migrate:check   # CI: also immutability + ordering
//
// Schema drift (schema.prisma vs migrations) is checked separately with `prisma migrate diff`
// in CI, because it needs a shadow database.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkMigrations } from "./lib/migration-rules.mjs";

const MIGRATIONS = "prisma/migrations";
const baseRef = process.env.MIGRATIONS_BASE_REF;

const directories = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const sql = Object.fromEntries(
  directories.map((d) => {
    const file = join(MIGRATIONS, d, "migration.sql");
    return [d, existsSync(file) ? readFileSync(file, "utf8") : null];
  }),
);
const lockPath = join(MIGRATIONS, "migration_lock.toml");
const lockfile = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null;

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

let baseDirectories = [];
let changedFiles = [];
if (baseRef) {
  try {
    baseDirectories = git("ls-tree", "-d", "--name-only", `${baseRef}:${MIGRATIONS}`)
      .split("\n")
      .filter(Boolean);
  } catch {
    baseDirectories = []; // base branch has no migrations yet
  }
  changedFiles = git("diff", "--name-status", `${baseRef}...HEAD`, "--", MIGRATIONS)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { status, path: paths[0] };
    });
}

const { errors, warnings, newMigrations } = checkMigrations({ directories, sql, lockfile, baseDirectories, changedFiles });

console.log(`Checked ${directories.length} migration(s)${baseRef ? ` against ${baseRef}` : ""}.`);
if (newMigrations.length && baseRef) console.log(`New in this branch: ${newMigrations.join(", ")}`);
for (const w of warnings) console.warn(`⚠️  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`❌ ${e}`);
  console.error(`\n${errors.length} migration rule violation(s). See docs/MIGRATIONS.md.`);
  process.exit(1);
}
console.log("✅ Migration rules passed.");
