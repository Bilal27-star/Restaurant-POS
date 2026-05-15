/**
 * GitHub Actions / Windows: materialize `apps/tauri-pos/src-tauri/resources/bundled-api`
 * and `node-runtime` so `tauri build` can bundle them (these paths are gitignored).
 *
 * Run from repository root:
 * node .github/scripts/prepare-tauri-windows-resources.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, "../..");

const resources = path.join(
  root,
  "apps/tauri-pos/src-tauri/resources"
);

const bundledApi = path.join(
  resources,
  "bundled-api"
);

const apiRoot = path.join(root, "apps/api");

const nodeBinDir = path.join(
  resources,
  "node-runtime",
  "bin"
);

const NODE_WIN_VER =
  process.env.CI_NODE_WIN_X64_VERSION ??
  "20.18.1";

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
  fs.rmSync(bundledApi, {
    recursive: true,
    force: true,
  });

  fs.mkdirSync(bundledApi, {
    recursive: true,
  });

  const pkgPath = path.join(
    apiRoot,
    "package.json"
  );

  const pkg = JSON.parse(
    fs.readFileSync(pkgPath, "utf8")
  );

  pkg.dependencies = pkg.dependencies ?? {};

  // حذف workspace dependencies
  for (const dep of Object.keys(pkg.dependencies)) {
    const value = pkg.dependencies[dep];

    if (
      typeof value === "string" &&
      value.startsWith("workspace:")
    ) {
      delete pkg.dependencies[dep];
    }
  }

  // إضافة الحزم المحلية
  pkg.dependencies["@pos/database"] =
    "file:./packages/database";

  pkg.dependencies["@pos/contracts"] =
    "file:./packages/contracts";

  // embedded postgres
  if (!pkg.dependencies["embedded-postgres"]) {
    pkg.dependencies["embedded-postgres"] =
      "18.3.0-beta.17";
  }

  delete pkg.devDependencies;

  // كتابة package.json
  fs.writeFileSync(
    path.join(bundledApi, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`
  );

  // نسخ dist
  const distSrc = path.join(apiRoot, "dist");

  if (
    !fs.existsSync(
      path.join(distSrc, "desktop-runtime.js")
    )
  ) {
    console.error(
      "prepare-tauri-windows-resources: desktop-runtime.js missing"
    );

    process.exit(1);
  }

  fs.cpSync(
    distSrc,
    path.join(bundledApi, "dist"),
    {
      recursive: true,
    }
  );

  // نسخ packages المحلية
  const localPackagesDir = path.join(
    bundledApi,
    "packages"
  );

  fs.mkdirSync(localPackagesDir, {
    recursive: true,
  });

  fs.cpSync(
    path.join(root, "packages/database"),
    path.join(localPackagesDir, "database"),
    {
      recursive: true,
    }
  );

  fs.cpSync(
    path.join(root, "packages/contracts"),
    path.join(localPackagesDir, "contracts"),
    {
      recursive: true,
    }
  );

  // نسخ env
  const envExample = path.join(
    apiRoot,
    ".env.example"
  );

  if (fs.existsSync(envExample)) {
    fs.copyFileSync(
      envExample,
      path.join(bundledApi, ".env")
    );
  }

  console.log(
    "Installing production dependencies inside bundled-api..."
  );

  execFileSync(
    "cmd",
    [
      "/c",
      "npm install --production --no-audit --no-fund",
    ],
    {
      cwd: bundledApi,
      stdio: "inherit",
    }
  );
}

async function downloadWindowsEmbeddedNode() {
  if (process.platform !== "win32") {
    return;
  }

  fs.rmSync(nodeBinDir, {
    recursive: true,
    force: true,
  });

  fs.mkdirSync(nodeBinDir, {
    recursive: true,
  });

  const zipName =
    `node-v${NODE_WIN_VER}-win-x64.zip`;

  const url =
    `https://nodejs.org/dist/v${NODE_WIN_VER}/${zipName}`;

  const tmp = path.join(
    resources,
    ".ci-node-dl"
  );

  fs.rmSync(tmp, {
    recursive: true,
    force: true,
  });

  fs.mkdirSync(tmp, {
    recursive: true,
  });

  const zipPath = path.join(tmp, zipName);

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Failed to download Node: ${url} (${res.status})`
    );
  }

  const buf = Buffer.from(
    await res.arrayBuffer()
  );

  fs.writeFileSync(zipPath, buf);

  execFileSync(
    "tar",
    ["-xf", zipPath, "-C", tmp],
    {
      stdio: "inherit",
    }
  );

  const extracted = path.join(
    tmp,
    `node-v${NODE_WIN_VER}-win-x64`
  );

  const nodeExe = path.join(
    extracted,
    "node.exe"
  );

  if (!fs.existsSync(nodeExe)) {
    throw new Error(
      `Expected ${nodeExe} after extracting ${zipName}`
    );
  }

  fs.copyFileSync(
    nodeExe,
    path.join(nodeBinDir, "node.exe")
  );

  fs.copyFileSync(
    nodeExe,
    path.join(nodeBinDir, "node")
  );

  fs.rmSync(tmp, {
    recursive: true,
    force: true,
  });

  console.log(
    `prepare-tauri-windows-resources: embedded Node ${NODE_WIN_VER} -> ${nodeBinDir}`
  );
}

ensureApiBuilt();

writeBundledApi();

await downloadWindowsEmbeddedNode();

console.log(
  "prepare-tauri-windows-resources: done"
);
