/**
 * GitHub Actions / Windows: materialize `apps/tauri-pos/src-tauri/resources/bundled-api`
 * and `node-runtime` so `tauri build` can bundle them (these paths are gitignored).
 *
 * Run from repository root: `node .github/scripts/prepare-tauri-windows-resources.mjs`
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const resources = path.join(root, "apps/tauri-pos/src-tauri/resources");
const bundledApi = path.join(resources, "bundled-api");
const apiRoot = path.join(root, "apps/api");
const nodeBinDir = path.join(resources, "node-runtime", "bin");

const NODE_WIN_VER = process.env.CI_NODE_WIN_X64_VERSION ?? "20.18.1";

function fileDep(absTarget) {
  let rel = path.relative(bundledApi, absTarget);
  if (!rel.startsWith(".") && !path.isAbsolute(rel)) rel = `./${rel}`;
  return `file:${rel.split(path.sep).join("/")}`;
}

function ensureApiBuilt() {
  execFileSync(
    "cmd",
    ["/c", "pnpm --filter @pos/api run build"],
    {
      cwd: root,
      stdio: "inherit",
    }
  );
}

function writeBundledApi() {
  fs.rmSync(bundledApi, { recursive: true, force: true });
  fs.mkdirSync(bundledApi, { recursive: true });

  const pkgPath = path.join(apiRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies["@pos/database"] = fileDep(path.join(root, "packages/database"));
  pkg.dependencies["@pos/contracts"] = fileDep(path.join(root, "packages/contracts"));

  if (!pkg.dependencies["embedded-postgres"]) {
    pkg.dependencies["embedded-postgres"] = "18.3.0-beta.17";
  }

  delete pkg.devDependencies;

  fs.writeFileSync(
    path.join(bundledApi, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`
  );

  const distSrc = path.join(apiRoot, "dist");

  if (!fs.existsSync(path.join(distSrc, "desktop-runtime.js"))) {
    console.error(
      "prepare-tauri-windows-resources: apps/api/dist/desktop-runtime.js missing — run `pnpm --filter @pos/api run build` locally and ensure desktop-runtime is included in the API build."
    );
    process.exit(1);
  }

  fs.cpSync(distSrc, path.join(bundledApi, "dist"), {
    recursive: true,
  });

  const envExample = path.join(apiRoot, ".env.example");

  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(bundledApi, ".env"));
  }

  execFileSync(
    "npm",
    [
      "install",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
    ],
    {
      cwd: bundledApi,
      stdio: "inherit",
      env: {
        ...process.env,
        npm_config_engine_strict: "false",
      },
    }
  );
}

async function downloadWindowsEmbeddedNode() {
  if (process.platform !== "win32") return;

  fs.rmSync(nodeBinDir, { recursive: true, force: true });
  fs.mkdirSync(nodeBinDir, { recursive: true });

  const zipName = `node-v${NODE_WIN_VER}-win-x64.zip`;
  const url = `https://nodejs.org/dist/v${NODE_WIN_VER}/${zipName}`;

  const tmp = path.join(resources, ".ci-node-dl");

  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const zipPath = path.join(tmp, zipName);

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download Node: ${url} (${res.status})`);
  }

  const buf = Buffer.from(await res.arrayBuffer());

  fs.writeFileSync(zipPath, buf);

  execFileSync("tar", ["-xf", zipPath, "-C", tmp], {
    stdio: "inherit",
  });

  const extracted = path.join(tmp, `node-v${NODE_WIN_VER}-win-x64`);
  const nodeExe = path.join(extracted, "node.exe");

  if (!fs.existsSync(nodeExe)) {
    throw new Error(`Expected ${nodeExe} after extracting ${zipName}`);
  }

  fs.copyFileSync(nodeExe, path.join(nodeBinDir, "node.exe"));
  fs.copyFileSync(nodeExe, path.join(nodeBinDir, "node"));

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(
    `prepare-tauri-windows-resources: embedded Node ${NODE_WIN_VER} -> ${nodeBinDir}`
  );
}

ensureApiBuilt();
writeBundledApi();
await downloadWindowsEmbeddedNode();

console.log("prepare-tauri-windows-resources: done");
