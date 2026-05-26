/**
 * Ensures Windows installer payloads exist under `src-tauri/binaries/` before `tauri build`.
 * Referenced from `bundle.resources` in `tauri.conf.json` and validated for NSIS bundling.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binariesDir = path.join(__dirname, "..", "binaries");

/** @type {{ name: string; url: string }[]} */
const INSTALLERS = [
  {
    name: "MicrosoftEdgeWebView2RuntimeInstallerX64.exe",
    url: "https://go.microsoft.com/fwlink/p/?LinkId=2124703",
  },
  {
    name: "VC_redist.x64.exe",
    url: "https://aka.ms/vs/17/release/vc_redist.x64.exe",
  },
];

/**
 * @param {string} url
 * @param {string} dest
 */
async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error(`empty response from ${url}`);
  }
  fs.writeFileSync(dest, buf);
}

function assertInstaller(dest, name) {
  if (!fs.existsSync(dest)) {
    throw new Error(`missing installer binary: ${path.join("binaries", name)}`);
  }
  const stat = fs.statSync(dest);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`invalid installer binary (empty or not a file): ${dest}`);
  }
  console.log(`ensure-installer-binaries: OK ${dest} (${stat.size} bytes)`);
}

async function main() {
  fs.mkdirSync(binariesDir, { recursive: true });

  for (const { name, url } of INSTALLERS) {
    const dest = path.join(binariesDir, name);
    if (!fs.existsSync(dest)) {
      console.log(`ensure-installer-binaries: downloading ${name}…`);
      await download(url, dest);
    }
    assertInstaller(dest, name);
  }
}

main().catch((err) => {
  console.error("ensure-installer-binaries: failed:", err);
  process.exit(1);
});
