/**
 * GitHub Actions / Windows: materialize `apps/tauri-pos/src-tauri/resources/bundled-api`
 * and embedded Node runtime so `tauri build` can bundle them (paths are gitignored).
 *
 * Vendors `packages/database` and `packages/contracts` under bundled-api so `npm install`
 * does not need pnpm workspaces. Run from repo root:
 *   node .github/scripts/prepare-tauri-windows-resources.mjs
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

const bundledApi = path.join(resources, "bundled-api");

const apiRoot = path.join(root, "apps/api");

const nodeBinDir = path.join(
  resources,
  "node-runtime",
  "bin"
);

const NODE_WIN_VER =
  process.env.CI_NODE_WIN_X64_VERSION ?? "20.18.1";

function runWindowsCommand(command, cwd = root) {
  execFileSync(
    "cmd",
    ["/c", command],
    {
      cwd,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
      },
    }
  );
}

function ensureApiBuilt() {
  console.log("Building API...");
  runWindowsCommand(
    "pnpm --filter @pos/api run build"
  );
}

/**
 * Remove workspace:* dependencies recursively.
 */
function removeWorkspaceDeps(obj = {}) {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === "string" &&
      value.startsWith("workspace:")
    ) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function cleanPackageJson(packageJsonPath) {
  if (!fs.existsSync(packageJsonPath)) {
    return;
  }

  const pkg = JSON.parse(
    fs.readFileSync(packageJsonPath, "utf8")
  );

  pkg.dependencies = removeWorkspaceDeps(
    pkg.dependencies || {}
  );

  pkg.devDependencies = {};

  pkg.peerDependencies = removeWorkspaceDeps(
    pkg.peerDependencies || {}
  );

  pkg.optionalDependencies = removeWorkspaceDeps(
    pkg.optionalDependencies || {}
  );

  delete pkg.workspaces;

  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(pkg, null, 2)}\n`
  );
}

function writeBundledApi() {
  console.log("Preparing bundled-api...");

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

  pkg.dependencies = removeWorkspaceDeps(
    pkg.dependencies || {}
  );

  pkg.devDependencies = {};

  pkg.peerDependencies = removeWorkspaceDeps(
    pkg.peerDependencies || {}
  );

  pkg.optionalDependencies = removeWorkspaceDeps(
    pkg.optionalDependencies || {}
  );

  delete pkg.workspaces;

  /**
   * Local packaged dependencies
   */
  pkg.dependencies["@pos/database"] =
    "file:./packages/database";

  pkg.dependencies["@pos/contracts"] =
    "file:./packages/contracts";

  if (!pkg.dependencies["embedded-postgres"]) {
    pkg.dependencies["embedded-postgres"] =
      "18.3.0-beta.17";
  }

  fs.writeFileSync(
    path.join(bundledApi, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`
  );

  /**
   * Copy API dist
   */
  const distSrc = path.join(
    apiRoot,
    "dist"
  );

  const runtimeFile = path.join(
    distSrc,
    "desktop-runtime.js"
  );

  if (!fs.existsSync(runtimeFile)) {
    console.error(
      "desktop-runtime.js missing"
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

  /**
   * Vendor packages locally
   */
  const bundledPackages = path.join(
    bundledApi,
    "packages"
  );

  fs.mkdirSync(bundledPackages, {
    recursive: true,
  });

  const packagesToCopy = [
    "database",
    "contracts",
  ];

  for (const packageName of packagesToCopy) {
    const source = path.join(
      root,
      "packages",
      packageName
    );

    const target = path.join(
      bundledPackages,
      packageName
    );

    fs.cpSync(source, target, {
      recursive: true,
    });

    /**
     * Clean nested package.json
     */
    cleanPackageJson(
      path.join(target, "package.json")
    );

    /**
     * Remove nested node_modules
     */
    fs.rmSync(
      path.join(target, "node_modules"),
      {
        recursive: true,
        force: true,
      }
    );
  }

  /**
   * Copy .env
   */
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

  /**
   * Remove previous install
   */
  fs.rmSync(
    path.join(bundledApi, "node_modules"),
    {
      recursive: true,
      force: true,
    }
  );

  fs.rmSync(
    path.join(bundledApi, "package-lock.json"),
    {
      force: true,
    }
  );

  /**
   * Install production deps
   */
  console.log(
    "Installing production dependencies..."
  );

  runWindowsCommand(
    "npm install --omit=dev --no-audit --no-fund --legacy-peer-deps",
    bundledApi
  );
}

async function downloadWindowsEmbeddedNode() {
  if (process.platform !== "win32") {
    return;
  }

  console.log(
    "Downloading embedded Node runtime..."
  );

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

  const zipPath = path.join(
    tmp,
    zipName
  );

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Failed to download Node: ${url}`
    );
  }

  fs.writeFileSync(
    zipPath,
    Buffer.from(await res.arrayBuffer())
  );

  runWindowsCommand(
    `tar -xf "${zipPath}" -C "${tmp}"`,
    root
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
      `node.exe missing after extraction`
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
    `Embedded Node ${NODE_WIN_VER} ready`
  );
}

ensureApiBuilt();

writeBundledApi();

await downloadWindowsEmbeddedNode();

console.log(
  "prepare-tauri-windows-resources: done"
);
