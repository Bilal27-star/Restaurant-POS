/**
 * GitHub Actions / Windows: materialize
 * bundled-api + embedded node runtime
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

const root = path.resolve(__dirname, "../..");

const resources = path.join(
  root,
  "apps/tauri-pos/src-tauri/resources"
);

const bundledApi = path.join(
  resources,
  "bundled-api"
);

const apiRoot = path.join(
  root,
  "apps/api"
);

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

function removeWorkspaceDeps(obj = {}) {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === "string" &&
      value.includes("workspace:")
    ) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function writeBundledApi() {
  fs.rmSync(bundledApi, {
    recursive: true,
    force: true,
  });

  fs.mkdirSync(bundledApi, {
    recursive: true,
  });

  const pkg = JSON.parse(
    fs.readFileSync(
      path.join(apiRoot, "package.json"),
      "utf8"
    )
  );

  // تنظيف كامل لكل workspace deps
  pkg.dependencies =
    removeWorkspaceDeps(
      pkg.dependencies || {}
    );

  pkg.devDependencies = {};

  pkg.peerDependencies =
    removeWorkspaceDeps(
      pkg.peerDependencies || {}
    );

  pkg.optionalDependencies =
    removeWorkspaceDeps(
      pkg.optionalDependencies || {}
    );

  // إزالة workspaces field نفسه
  delete pkg.workspaces;

  // dependencies المحلية
  pkg.dependencies["@pos/database"] =
    "file:./packages/database";

  pkg.dependencies["@pos/contracts"] =
    "file:./packages/contracts";

  pkg.dependencies["embedded-postgres"] =
    "18.3.0-beta.17";

  // كتابة package.json الجديد
  fs.writeFileSync(
    path.join(bundledApi, "package.json"),
    JSON.stringify(pkg, null, 2)
  );

  // نسخ dist
  const distSrc = path.join(
    apiRoot,
    "dist"
  );

  if (
    !fs.existsSync(
      path.join(
        distSrc,
        "desktop-runtime.js"
      )
    )
  ) {
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

  // نسخ الحزم المحلية
  const localPackagesDir = path.join(
    bundledApi,
    "packages"
  );

  fs.mkdirSync(localPackagesDir, {
    recursive: true,
  });

  fs.cpSync(
    path.join(root, "packages/database"),
    path.join(
      localPackagesDir,
      "database"
    ),
    {
      recursive: true,
    }
  );

  fs.cpSync(
    path.join(root, "packages/contracts"),
    path.join(
      localPackagesDir,
      "contracts"
    ),
    {
      recursive: true,
    }
  );

  // env
  const envExample = path.join(
    apiRoot,
    ".env.example"
  );

  if (fs.existsSync(envExample)) {
    fs.copyFileSync(
      envExample,
      path.join(
        bundledApi,
        ".env"
      )
    );
  }

  console.log(
    "Installing production dependencies..."
  );

  execFileSync(
    "cmd",
    [
      "/c",
      "npm install --omit=dev --no-audit --no-fund",
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

  fs.copyFileSync(
    nodeExe,
    path.join(
      nodeBinDir,
      "node.exe"
    )
  );

  fs.copyFileSync(
    nodeExe,
    path.join(
      nodeBinDir,
      "node"
    )
  );

  fs.rmSync(tmp, {
    recursive: true,
    force: true,
  });

  console.log(
    `Embedded Node ready: ${NODE_WIN_VER}`
  );
}

ensureApiBuilt();

writeBundledApi();

await downloadWindowsEmbeddedNode();

console.log("prepare-tauri-windows-resources: done");
