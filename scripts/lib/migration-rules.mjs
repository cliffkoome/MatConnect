// Pure rule checks for prisma/migrations, used by scripts/check-migrations.mjs and unit-tested in
// tests/unit/lib/migration-rules.test.ts. See docs/MIGRATIONS.md for the policy they enforce.

/** `20261019120000_add_vehicle_colour` — 14-digit UTC timestamp, then a snake_case description. */
export const MIGRATION_NAME = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)$/;

/** Marker a reviewer adds to a migration to acknowledge a destructive statement on purpose. */
export const DESTRUCTIVE_APPROVAL = /--\s*migration-safety:\s*destructive-approved\b(.*)$/im;

/** Statements that can lose data or take long locks on a populated table. */
export const DESTRUCTIVE_PATTERNS = [
  { id: "drop-table", pattern: /\bDROP\s+TABLE\b/i, hint: "Dropping a table deletes its data." },
  { id: "drop-column", pattern: /\bDROP\s+COLUMN\b/i, hint: "Dropping a column deletes its data — remove code usage first (expand/contract)." },
  { id: "truncate", pattern: /\bTRUNCATE\b/i, hint: "TRUNCATE deletes every row." },
  { id: "delete-without-where", pattern: /\bDELETE\s+FROM\s+"?\w+"?\s*(?:;|$)/im, hint: "DELETE without WHERE removes every row." },
  { id: "alter-type", pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+(?:SET\s+DATA\s+)?TYPE\b/i, hint: "Changing a column type rewrites the table and can fail or truncate values." },
  { id: "set-not-null", pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/i, hint: "SET NOT NULL fails if any row is NULL — backfill in an earlier migration." },
  { id: "rename", pattern: /\bRENAME\s+(?:COLUMN|TO)\b/i, hint: "Renames break the running app version during deploy — add the new name, migrate, then drop the old one." },
  { id: "drop-enum-value", pattern: /\bDROP\s+TYPE\b/i, hint: "Dropping/recreating an enum can fail on existing rows." },
];

/** Strips `--` line comments and block comments so commented-out SQL isn't flagged. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

export function findDestructiveStatements(sql) {
  const code = stripSqlComments(sql);
  return DESTRUCTIVE_PATTERNS.filter(({ pattern }) => pattern.test(code)).map(({ id, hint }) => ({ id, hint }));
}

/**
 * @param {object} input
 * @param {string[]} input.directories   migration folder names currently in prisma/migrations
 * @param {Record<string, string|null>} input.sql  folder → migration.sql contents (null if missing)
 * @param {string|null} input.lockfile   migration_lock.toml contents
 * @param {string[]} [input.baseDirectories]  folders that exist on the base branch (already shipped)
 * @param {{status: string, path: string}[]} [input.changedFiles]  `git diff --name-status base...HEAD -- prisma/migrations`
 * @returns {{ errors: string[], warnings: string[], newMigrations: string[] }}
 */
export function checkMigrations({ directories, sql, lockfile, baseDirectories = [], changedFiles = [] }) {
  const errors = [];
  const warnings = [];

  if (!lockfile || !/provider\s*=\s*"postgresql"/.test(lockfile)) {
    errors.push('prisma/migrations/migration_lock.toml must exist and declare provider = "postgresql".');
  }

  for (const dir of directories) {
    if (!MIGRATION_NAME.test(dir)) {
      errors.push(`${dir}: name must look like 20261019120000_short_description (UTC timestamp + snake_case).`);
    }
    const content = sql[dir];
    if (content == null) errors.push(`${dir}: missing migration.sql.`);
    else if (!stripSqlComments(content).trim()) errors.push(`${dir}: migration.sql is empty.`);
  }

  const timestamps = directories.map((d) => d.slice(0, 14));
  const dupes = timestamps.filter((t, i) => timestamps.indexOf(t) !== i);
  for (const t of new Set(dupes)) errors.push(`More than one migration uses timestamp ${t}.`);

  // Shipped migrations are immutable: the database records their checksum, and editing one makes
  // `migrate deploy` fail (or silently diverge environments).
  const base = new Set(baseDirectories);
  for (const { status, path } of changedFiles) {
    const dir = path.split("/")[2];
    if (!dir || !base.has(dir)) continue;
    if (status.startsWith("M")) errors.push(`${dir}: already merged — never edit an applied migration; add a new one.`);
    if (status.startsWith("D")) errors.push(`${dir}: already merged — never delete an applied migration.`);
    if (status.startsWith("R")) errors.push(`${dir}: already merged — never rename an applied migration.`);
  }
  for (const dir of baseDirectories) {
    if (!directories.includes(dir)) errors.push(`${dir}: exists on the base branch but is missing here.`);
  }

  const newMigrations = directories.filter((d) => !base.has(d)).sort();
  const latestBase = [...base].sort().at(-1);
  for (const dir of newMigrations) {
    if (latestBase && dir.slice(0, 14) <= latestBase.slice(0, 14)) {
      errors.push(
        `${dir}: timestamp is not after the latest merged migration (${latestBase}). ` +
          "Rebase and regenerate it with `npm run db:migrate:create` so migrations apply in order.",
      );
    }

    const content = sql[dir] ?? "";
    const destructive = findDestructiveStatements(content);
    if (destructive.length && !DESTRUCTIVE_APPROVAL.test(content)) {
      for (const { id, hint } of destructive) {
        errors.push(
          `${dir}: potentially destructive statement (${id}). ${hint} If intended, add ` +
            "`-- migration-safety: destructive-approved <reason>` to the migration after review.",
        );
      }
    } else if (destructive.length) {
      warnings.push(`${dir}: destructive statements approved (${destructive.map((d) => d.id).join(", ")}).`);
    }

    if (/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b(?!\s+CONCURRENTLY)/i.test(stripSqlComments(content)) && base.size > 0) {
      warnings.push(
        `${dir}: CREATE INDEX locks writes on the table while it builds. Fine for small tables; for large ones ` +
          "consider CREATE INDEX CONCURRENTLY in its own migration.",
      );
    }
  }

  return { errors, warnings, newMigrations };
}
