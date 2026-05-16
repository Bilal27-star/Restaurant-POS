import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export function resolveDatabasePackageDir(bundleRoot: string): string {
  const npmLayout = path.join(bundleRoot, "node_modules", "@pos", "database");
  const vendorLayout = path.join(bundleRoot, "packages", "database");
  if (existsSync(path.join(npmLayout, "prisma", "schema.prisma"))) return npmLayout;
  if (existsSync(path.join(vendorLayout, "prisma", "schema.prisma"))) return vendorLayout;
  throw new Error(
    `Cannot resolve @pos/database (no prisma/schema.prisma under ${npmLayout} or ${vendorLayout}). bundleRoot=${bundleRoot}`,
  );
}

export function resolvePrismaCli(bundleRoot: string, dbPkgDir: string): string {
  const hoisted = path.join(bundleRoot, "node_modules", "prisma", "build", "index.js");
  if (existsSync(hoisted)) return hoisted;
  const nested = path.join(dbPkgDir, "node_modules", "prisma", "build", "index.js");
  if (existsSync(nested)) return nested;
  const require = createRequire(path.join(bundleRoot, "package.json"));
  const dir = path.dirname(require.resolve("prisma/package.json", { paths: [dbPkgDir, bundleRoot] }));
  return path.join(dir, "build", "index.js");
}

export function runPrismaMigrateDeploySync(
  databaseUrl: string,
  bundleRoot: string,
  log: (line: string) => void,
): void {
  const dbPkgDir = resolveDatabasePackageDir(bundleRoot);
  const prismaCli = resolvePrismaCli(bundleRoot, dbPkgDir);
  if (!existsSync(prismaCli)) {
    throw new Error(`Prisma CLI missing at ${prismaCli}`);
  }
  const schema = path.join(dbPkgDir, "prisma", "schema.prisma");
  log(`prisma: migrate deploy cwd=${dbPkgDir} schema=${schema}`);
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schema], {
    cwd: dbPkgDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}

export async function runPrismaMigrateDeployWithRetry(
  databaseUrl: string,
  bundleRoot: string,
  log: (line: string) => void,
): Promise<void> {
  const max = 5;
  let last: unknown;
  for (let attempt = 1; attempt <= max; attempt += 1) {
    try {
      log(`prisma: migrate attempt=${attempt}/${max}`);
      runPrismaMigrateDeploySync(databaseUrl, bundleRoot, log);
      return;
    } catch (err) {
      last = err;
      log(`prisma: migrate failed attempt=${attempt} ${String(err)}`);
      if (attempt === max) break;
      const backoffMs = Math.min(8000, 500 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw last;
}
