/**
 * Production desktop backend bundle — run before `tauri build` (see `tauri.conf.json` `beforeBuildCommand`).
 *
 * Produces a fully self-contained `resources/bundled-api/`:
 *   - `dist/` (compiled API + desktop-runtime)
 *   - `packages/database` + `packages/contracts` (vendored sources; no `workspace:` / `workspace:^` / `workspace:~` specs)
 *   - `node_modules/` from `npm install --omit=dev` (then **materialize** `node_modules/@pos/*` as real directories — npm may symlink `file:` deps)
 *   - Prisma Client generated with **binary** engines for `native`, `darwin-arm64`, `darwin` (Intel), `windows`
 *   - `pos-bundled-manifest.json` — build metadata (Node/Prisma/API versions) for support diagnostics
 *   - `resources/node-runtime/bin/` — official Node binary for the **host** OS/arch (macOS arm64/x64, Windows x64)
 *
 * After installation, only `resource_dir` + app data are needed — no monorepo paths.
 *
 * Usage (from repo root or any cwd):
 *   node apps/tauri-pos/src-tauri/scripts/package-bundled-backend.mjs
 *
 * Flags:
 *   --skip-api-build   Skip `pnpm --filter @pos/api run build` (e.g. if you already built).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../../");
const resources = path.join(root, "apps/tauri-pos/src-tauri/resources");
const bundledApi = path.join(resources, "bundled-api");
const apiRoot = path.join(root, "apps/api");
const nodeBinDir = path.join(resources, "node-runtime", "bin");

const NODE_VER = process.env.DESKTOP_NODE_VERSION ?? "20.18.1";


const skipApiBuild = process.argv.includes("--skip-api-build");

function runPnpm(args, options = {}) {
  const pnpmExec = process.env.npm_execpath;

  // Prefer the package manager already running the workflow.
  // GitHub Actions + Corepack on Windows may fail with pnpm.cmd spawnSync.
  if (pnpmExec && fs.existsSync(pnpmExec)) {
    return execFileSync(process.execPath, [pnpmExec, ...args], {
      stdio: "inherit",
      cwd: root,
      ...options,
    });
  }

  const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

  return execFileSync(pnpmBin, args, {
    stdio: "inherit",
    cwd: root,
    shell: process.platform === "win32",
    ...options,
  });
}

function validateTauriConfigOrExit() {
  const p = path.join(root, "apps/tauri-pos/src-tauri/tauri.conf.json");
  try {
    JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.error(`package-bundled-backend: invalid JSON in ${p}`);
    console.error(e);
    process.exit(1);
  }
}

/** Rewrite any `file:../…` specs under vendored packages to `file:./…` so npm never leaves the bundle root. */
function normalizeBundledPackageJsonFileSpecs(pkgJsonPath, bundleRoot) {
  if (!fs.existsSync(pkgJsonPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  let changed = false;
  for (const section of DEP_SECTIONS) {
    const o = pkg[section];
    if (!o || typeof o !== "object") continue;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v !== "string" || !v.startsWith("file:")) continue;
      const spec = v.slice("file:".length);
      if (spec.startsWith("./") || spec.startsWith(".\\")) continue;
      if (!spec.includes("..")) continue;
      const abs = path.resolve(path.dirname(pkgJsonPath), spec);
      const rel = path.relative(bundleRoot, abs).split(path.sep).join("/");
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
      o[k] = `file:./${rel}`;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`package-bundled-backend: normalized file: specs in ${path.relative(root, pkgJsonPath)}`);
  }
}

function stripVendoredNoise(pkgDir) {
  for (const name of ["node_modules", "dist", ".turbo", "target"]) {
    const p = path.join(pkgDir, name);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  }
}

function copyTreeFiltered(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  stripVendoredNoise(dest);
}

function isWorkspaceProtocol(v) {
  return typeof v === "string" && /^workspace:/i.test(v.trim());
}

function removeWorkspaceDeps(obj = {}) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isWorkspaceProtocol(v)) continue;
    result[k] = v;
  }
  return result;
}

/** Runtime bundle must not reference monorepo-only paths (`file:../config/typescript`, etc.). */
function sanitizeVendoredPackageJson(sub, packageName) {
  sub.devDependencies = {};
  sub.peerDependencies = {};
  sub.optionalDependencies = removeWorkspaceDeps(sub.optionalDependencies || {});
  delete sub.workspaces;

  if (packageName === "database") {
    delete sub.prisma;
    if (sub.scripts) {
      delete sub.scripts.postinstall;
      delete sub.scripts["db:seed"];
    }
  }

  const exp = sub.exports?.["."];
  if (exp && typeof exp === "object") {
    exp.types = "./dist/index.d.ts";
    exp.default = "./dist/index.js";
    if ("import" in exp) exp.import = "./dist/index.js";
  }
}

const DEP_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

function collectBundledApiPackageJsonPaths(bundleRoot) {
  const files = [
    path.join(bundleRoot, "package.json"),
    path.join(bundleRoot, "packages", "database", "package.json"),
    path.join(bundleRoot, "packages", "contracts", "package.json"),
  ];
  const atPos = path.join(bundleRoot, "node_modules", "@pos");
  if (fs.existsSync(atPos)) {
    for (const name of fs.readdirSync(atPos)) {
      const pkgJson = path.join(atPos, name, "package.json");
      if (fs.existsSync(pkgJson)) files.push(pkgJson);
    }
  }
  return files.filter((f) => fs.existsSync(f));
}

/** Fail the build if any dependency spec still uses the pnpm workspace protocol (npm cannot resolve it after install). */
function assertBundledApiNoWorkspaceProtocol(bundleRoot) {
  for (const file of collectBundledApiPackageJsonPaths(bundleRoot)) {
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const key of DEP_SECTIONS) {
      const o = pkg[key];
      if (!o || typeof o !== "object") continue;
      for (const [depName, spec] of Object.entries(o)) {
        if (isWorkspaceProtocol(spec)) {
          throw new Error(
            `package-bundled-backend: ${file} declares ${depName}=${JSON.stringify(spec)} — workspace protocol is not allowed in bundled-api`,
          );
        }
      }
    }
  }
}

function materializeSymlinkedPath(p, bundleRoot) {
  if (!fs.existsSync(p)) return;
  if (!fs.lstatSync(p).isSymbolicLink()) return;
  let resolved;
  try {
    resolved = fs.realpathSync(p);
  } catch (err) {
    console.warn(
      `package-bundled-backend: removing broken symlink ${path.relative(bundleRoot, p)} (${err instanceof Error ? err.message : String(err)})`,
    );
    fs.rmSync(p, { recursive: false, force: true });
    return;
  }
  const tmp = `${p}.materialize-tmp`;
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(resolved, tmp, { recursive: true });
  fs.rmSync(p, { recursive: false, force: true });
  fs.renameSync(tmp, p);
  console.log(`package-bundled-backend: materialized ${path.relative(bundleRoot, p)}`);
}

/** Replace any symlink under node_modules whose target is outside the bundle or missing. */
function materializeAllNodeModulesSymlinks(bundleRoot) {
  const nm = path.join(bundleRoot, "node_modules");
  if (!fs.existsSync(nm)) return;

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isSymbolicLink()) {
        materializeSymlinkedPath(full, bundleRoot);
        continue;
      }
      if (ent.isDirectory() && ent.name !== ".bin") {
        walk(full);
      }
    }
  };
  walk(nm);
}

/**
 * npm often symlinks `file:` deps. Replace symlinks under critical scopes with real directories
 * so Windows installers and macOS signed bundles never depend on link semantics.
 */
function materializeCriticalNpmSymlinks(bundleRoot) {
  const nm = path.join(bundleRoot, "node_modules");
  if (!fs.existsSync(nm)) return;
  for (const scope of ["@pos", "@prisma"]) {
    const dir = path.join(nm, scope);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      materializeSymlinkedPath(path.join(dir, name), bundleRoot);
    }
  }
  materializeSymlinkedPath(path.join(nm, "prisma"), bundleRoot);
}

function assertNoBrokenPosScopeSymlinks(bundleRoot) {
  const nm = path.join(bundleRoot, "node_modules");
  const atPos = path.join(nm, "@pos");
  if (!fs.existsSync(atPos)) {
    throw new Error(`package-bundled-backend: missing ${atPos}`);
  }
  for (const name of fs.readdirSync(atPos)) {
    const p = path.join(atPos, name);
    if (fs.lstatSync(p).isSymbolicLink()) {
      throw new Error(`package-bundled-backend: ${p} is still a symlink after materialize`);
    }
    if (name === "tsconfig") {
      throw new Error(
        `package-bundled-backend: ${p} must not be installed in the runtime bundle (devDependency leak)`,
      );
    }
  }
}

function assertCriticalPackagesNotSymlinked(bundleRoot) {
  assertNoBrokenPosScopeSymlinks(bundleRoot);
  const nm = path.join(bundleRoot, "node_modules");
  const atPrisma = path.join(nm, "@prisma");
  if (fs.existsSync(atPrisma)) {
    for (const name of fs.readdirSync(atPrisma)) {
      const p = path.join(atPrisma, name);
      if (fs.lstatSync(p).isSymbolicLink()) {
        throw new Error(`package-bundled-backend: ${p} is still a symlink after materialize`);
      }
    }
  }
  const prismaCli = path.join(nm, "prisma");
  if (fs.existsSync(prismaCli) && fs.lstatSync(prismaCli).isSymbolicLink()) {
    throw new Error(`package-bundled-backend: ${prismaCli} is still a symlink after materialize`);
  }
}

/** Runtime smoke: Node must resolve @pos/* and @prisma/client from the bundle root (same layout as installed app). */
function assertBundledNodeResolution(bundleRoot) {
  const entry = path.join(bundleRoot, "package.json");
  const snippet = `
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(${JSON.stringify(entry)});
for (const id of ['@pos/database', '@pos/contracts', '@prisma/client']) {
  const r = require.resolve(id);
  if (!r) throw new Error('resolve failed ' + id);
  console.log('package-bundled-backend: resolve ok', id, '->', r);
}
const tsconfigPath = ${JSON.stringify(path.join(bundleRoot, "node_modules", "@pos", "tsconfig"))};
if (fs.existsSync(tsconfigPath)) {
  throw new Error('unexpected @pos/tsconfig in runtime bundle: ' + tsconfigPath);
}
`;
  execFileSync(process.execPath, ["--input-type=module", "--eval", snippet], {
    cwd: bundleRoot,
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: path.join(bundleRoot, "node_modules") },
  });
}

/** Static layout checks (do not import desktop-runtime — it auto-starts embedded Postgres). */
function assertBundledRuntimeLayout(bundleRoot) {
  const required = [
    path.join(bundleRoot, "dist", "desktop-runtime.js"),
    path.join(bundleRoot, "dist", "http-server.js"),
    path.join(bundleRoot, "packages", "database", "dist", "index.js"),
    path.join(bundleRoot, "packages", "contracts", "dist", "index.js"),
    path.join(bundleRoot, "packages", "database", "prisma", "schema.prisma"),
    path.join(bundleRoot, "node_modules", "prisma", "build", "index.js"),
    path.join(bundleRoot, ".env"),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      throw new Error(`package-bundled-backend: missing required bundle artifact ${p}`);
    }
  }
  console.log("package-bundled-backend: bundle layout ok");
}

function resolveRepoTypescriptLibTsc() {
  const candidates = [
    path.join(root, "apps/api/package.json"),
    path.join(root, "packages/database/package.json"),
    path.join(root, "packages/contracts/package.json"),
    path.join(root, "package.json"),
  ];
  for (const pkgJson of candidates) {
    if (!fs.existsSync(pkgJson)) continue;
    try {
      const req = createRequire(pkgJson);
      const entry = req.resolve("typescript/package.json");
      return path.join(path.dirname(entry), "lib", "tsc.js");
    } catch {
      /* try next anchor */
    }
  }
  throw new Error(
    "package-bundled-backend: could not resolve `typescript` from the repo — install devDependencies (pnpm install).",
  );
}

const DESKTOP_EMIT_TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    lib: ["ES2022"],
    module: "NodeNext",
    moduleResolution: "NodeNext",
    rootDir: "src",
    outDir: "dist",
    strict: true,
    skipLibCheck: true,
    noEmit: false,
    declaration: false,
    esModuleInterop: true,
    resolveJsonModule: true,
  },
  include: ["src/**/*.ts"],
};

/** Compile vendored `@pos/database` / `@pos/contracts` to `dist/` so plain Node can load the API (no `.ts` at runtime). */
function emitBundledTsWorkspacePackages(bundleRoot) {
  const tscJs = resolveRepoTypescriptLibTsc();
  for (const name of ["database", "contracts"]) {
    const cwd = path.join(bundleRoot, "packages", name);
    const confPath = path.join(cwd, "tsconfig.desktop-emit.json");
    fs.writeFileSync(confPath, `${JSON.stringify(DESKTOP_EMIT_TSCONFIG, null, 2)}\n`);
    console.log(`package-bundled-backend: tsc emit vendored ${name}…`);
    execFileSync(process.execPath, [tscJs, "-p", confPath], { cwd, stdio: "inherit" });
    const distIndex = path.join(cwd, "dist", "index.js");
    if (!fs.existsSync(distIndex)) {
      throw new Error(`package-bundled-backend: missing ${distIndex} after tsc`);
    }
  }
}

function patchPackageExportsDefaultToDist(pkgDir) {
  const p = path.join(pkgDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  const exp = pkg.exports?.["."];
  if (exp && typeof exp === "object") {
    exp.default = "./dist/index.js";
    if ("import" in exp) exp.import = "./dist/index.js";
  }
  fs.writeFileSync(p, `${JSON.stringify(pkg, null, 2)}\n`);
}

function ensureApiBuilt() {
  if (skipApiBuild) {
    console.log("package-bundled-backend: --skip-api-build set, skipping API tsc");
    return;
  }
  runPnpm(["--filter", "@pos/api", "run", "build"], {
    cwd: root,
  });
}

function writeBundledApi() {
  fs.rmSync(bundledApi, { recursive: true, force: true });
  fs.mkdirSync(bundledApi, { recursive: true });

  const pkg = JSON.parse(fs.readFileSync(path.join(apiRoot, "package.json"), "utf8"));
  pkg.dependencies = removeWorkspaceDeps(pkg.dependencies || {});
  pkg.devDependencies = {};
  pkg.peerDependencies = removeWorkspaceDeps(pkg.peerDependencies || {});
  pkg.optionalDependencies = removeWorkspaceDeps(pkg.optionalDependencies || {});
  delete pkg.workspaces;

  pkg.dependencies["@pos/database"] = "file:./packages/database";
  pkg.dependencies["@pos/contracts"] = "file:./packages/contracts";
  if (!pkg.dependencies["embedded-postgres"]) {
    pkg.dependencies["embedded-postgres"] = "18.3.0-beta.17";
  }

  fs.writeFileSync(path.join(bundledApi, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

  const distSrc = path.join(apiRoot, "dist");
  if (!fs.existsSync(path.join(distSrc, "desktop-runtime.js"))) {
    console.error(
      "package-bundled-backend: apps/api/dist/desktop-runtime.js missing. Run `pnpm --filter @pos/api run build` or remove --skip-api-build.",
    );
    process.exit(1);
  }
  fs.cpSync(distSrc, path.join(bundledApi, "dist"), { recursive: true });

  const localPackagesDir = path.join(bundledApi, "packages");
  fs.mkdirSync(localPackagesDir, { recursive: true });
  copyTreeFiltered(path.join(root, "packages/database"), path.join(localPackagesDir, "database"));
  copyTreeFiltered(path.join(root, "packages/contracts"), path.join(localPackagesDir, "contracts"));

  for (const name of ["database", "contracts"]) {
    const p = path.join(localPackagesDir, name, "package.json");
    if (!fs.existsSync(p)) continue;
    const sub = JSON.parse(fs.readFileSync(p, "utf8"));
    if (sub.dependencies) sub.dependencies = removeWorkspaceDeps(sub.dependencies);
    sanitizeVendoredPackageJson(sub, name);
    fs.writeFileSync(p, `${JSON.stringify(sub, null, 2)}\n`);
  }

  fs.writeFileSync(
    path.join(bundledApi, ".npmrc"),
    "install-links=false\nomit=dev\nengine-strict=false\n",
  );

  normalizeBundledPackageJsonFileSpecs(path.join(bundledApi, "package.json"), bundledApi);
  normalizeBundledPackageJsonFileSpecs(path.join(localPackagesDir, "database", "package.json"), bundledApi);
  normalizeBundledPackageJsonFileSpecs(path.join(localPackagesDir, "contracts", "package.json"), bundledApi);

  const envExample = path.join(apiRoot, ".env.example");
  if (fs.existsSync(envExample)) {
    let envText = fs.readFileSync(envExample, "utf8");
    // Embedded Postgres sets DATABASE_URL at runtime; do not ship a dev URL that confuses tooling.
    envText = envText
      .split("\n")
      .filter((line) => !/^\s*DATABASE_URL\s*=/.test(line))
      .join("\n");
    envText += "\n# DATABASE_URL is set at runtime by desktop-runtime (embedded PostgreSQL).\n";
    fs.writeFileSync(path.join(bundledApi, ".env"), envText);
  }

  const bundleDatabaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/pos_bundle_placeholder?schema=public";

  console.log("package-bundled-backend: npm install --omit=dev in bundled-api…");

  const npmExec = process.env.npm_execpath;
  const isPnpmExec = npmExec?.toLowerCase().includes("pnpm");

  if (npmExec && fs.existsSync(npmExec) && !isPnpmExec) {
    execFileSync(process.execPath, [
      npmExec,
      "install",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
    ], {
      cwd: bundledApi,
      stdio: "inherit",
      env: {
        ...process.env,
        npm_config_engine_strict: "false",
        npm_config_install_links: "false",
        DATABASE_URL: bundleDatabaseUrl,
      },
    });
  } else {
    const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";

    execFileSync(npmBin, [
      "install",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
    ], {
      cwd: bundledApi,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        npm_config_engine_strict: "false",
        npm_config_install_links: "false",
        DATABASE_URL: bundleDatabaseUrl,
      },
    });
  }

  assertBundledApiNoWorkspaceProtocol(bundledApi);

  const prismaSchema = path.join(bundledApi, "packages/database/prisma/schema.prisma");
  const prismaCli = path.join(bundledApi, "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(prismaCli)) {
    console.error("package-bundled-backend: prisma CLI not found at", prismaCli);
    process.exit(1);
  }

  const prismaCache = path.join(bundledApi, "node_modules", ".prisma");
  if (fs.existsSync(prismaCache)) {
    fs.rmSync(prismaCache, { recursive: true, force: true });
  }

  console.log("package-bundled-backend: prisma generate (desktop binaryTargets)…");
  execFileSync(
    process.execPath,
    [prismaCli, "generate", "--schema", prismaSchema],
    {
      cwd: path.join(bundledApi, "packages/database"),
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: bundleDatabaseUrl,
        PRISMA_GENERATE_SKIP_AUTOINSTALL: "true",
        PRISMA_CLI_BINARY_TARGETS: "native,windows,darwin,darwin-arm64",
        PRISMA_CLI_QUERY_ENGINE_TYPE: "binary",
      },
    },
  );

  const prismaClientDir = path.join(bundledApi, "node_modules", ".prisma");
  if (!fs.existsSync(prismaClientDir)) {
    throw new Error("package-bundled-backend: .prisma runtime folder missing after generate");
  }
  console.log("package-bundled-backend: prisma runtime engines bundled");

  emitBundledTsWorkspacePackages(bundledApi);
  patchPackageExportsDefaultToDist(path.join(bundledApi, "packages/database"));
  patchPackageExportsDefaultToDist(path.join(bundledApi, "packages/contracts"));

  materializeCriticalNpmSymlinks(bundledApi);
  materializeAllNodeModulesSymlinks(bundledApi);

  assertBundledApiNoWorkspaceProtocol(bundledApi);
  assertCriticalPackagesNotSymlinked(bundledApi);
  assertBundledNodeResolution(bundledApi);
  assertBundledRuntimeLayout(bundledApi);

  writePosBundledManifest(bundledApi);
}

function writePosBundledManifest(bundleRoot) {
  const apiPkg = JSON.parse(fs.readFileSync(path.join(bundleRoot, "package.json"), "utf8"));
  let prismaVersion = "unknown";
  try {
    const pj = path.join(bundleRoot, "node_modules", "prisma", "package.json");
    if (fs.existsSync(pj)) {
      prismaVersion = JSON.parse(fs.readFileSync(pj, "utf8")).version;
    }
  } catch {
    /* ignore */
  }
  const manifest = {
    schemaVersion: 1,
    kind: "pos-desktop-bundled-api",
    generatedAt: new Date().toISOString(),
    buildHost: `${process.platform}-${process.arch}`,
    embeddedNode: NODE_VER,
    api: { name: apiPkg.name, version: apiPkg.version },
    prisma: { cliVersion: prismaVersion },
  };
  const out = path.join(bundleRoot, "pos-bundled-manifest.json");
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("package-bundled-backend: wrote pos-bundled-manifest.json");
}

function nodeDistBaseName() {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === "win32") return `node-v${NODE_VER}-win-x64`;
  if (plat === "darwin") {
    if (arch === "arm64") return `node-v${NODE_VER}-darwin-arm64`;
    return `node-v${NODE_VER}-darwin-x64`;
  }
  throw new Error(
    `package-bundled-backend: unsupported host for embedded Node (${plat} ${arch}). Install Node on PATH and add resources manually, or extend this script.`,
  );
}

async function downloadEmbeddedNode() {
  fs.rmSync(nodeBinDir, { recursive: true, force: true });
  fs.mkdirSync(nodeBinDir, { recursive: true });

  const base = nodeDistBaseName();
  const isWin = process.platform === "win32";
  const archiveName = isWin ? `${base}.zip` : `${base}.tar.gz`;
  const url = `https://nodejs.org/dist/v${NODE_VER}/${archiveName}`;

  const tmp = path.join(resources, ".desktop-node-dl");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const archivePath = path.join(tmp, archiveName);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Node ${url} (${res.status})`);
  fs.writeFileSync(archivePath, Buffer.from(await res.arrayBuffer()));

  if (isWin) {
  execFileSync("tar", ["-xf", archivePath, "-C", tmp], { stdio: "inherit" });
  } else {
    execFileSync("tar", ["-xzf", archivePath, "-C", tmp], { stdio: "inherit" });
  }

  const extracted = path.join(tmp, base);
  if (isWin) {
    const nodeExe = path.join(extracted, "node.exe");
    if (!fs.existsSync(nodeExe)) throw new Error(`Missing ${nodeExe}`);
    fs.copyFileSync(nodeExe, path.join(nodeBinDir, "node.exe"));
    fs.copyFileSync(nodeExe, path.join(nodeBinDir, "node"));
  } else {
    const nodeBin = path.join(extracted, "bin", "node");
    if (!fs.existsSync(nodeBin)) throw new Error(`Missing ${nodeBin}`);
    fs.copyFileSync(nodeBin, path.join(nodeBinDir, "node"));
    try {
      fs.chmodSync(path.join(nodeBinDir, "node"), 0o755);
    } catch {
      /* ignore */
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`package-bundled-backend: embedded Node ${base} -> ${nodeBinDir}`);
}

validateTauriConfigOrExit();
ensureApiBuilt();
writeBundledApi();
await downloadEmbeddedNode();
console.log("package-bundled-backend: done");
