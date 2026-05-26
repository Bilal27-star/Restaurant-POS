use std::path::{Path, PathBuf};

fn must_exist(path: &Path, label: &str) {
  if !path.exists() {
    panic!(
      "Tauri resources missing: {label} not found at {}\n\
       Fix: run `node apps/tauri-pos/src-tauri/scripts/package-bundled-backend.mjs` before `tauri build`.",
      path.display()
    );
  }
}

fn is_file(path: &Path) -> bool {
  std::fs::metadata(path).map(|m| m.is_file()).unwrap_or(false)
}

fn copy_if_needed(src: &Path, dest: &Path) -> std::io::Result<()> {
  let need_copy = match (std::fs::read(src), std::fs::read(dest)) {
    (Ok(a), Ok(b)) => a != b,
    (Ok(_), Err(_)) => true,
    (Err(e), _) => return Err(e),
  };
  if need_copy {
    if let Some(parent) = dest.parent() {
      std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(src, dest)?;
  }
  Ok(())
}

fn validate_and_prepare_release_resources(manifest_dir: &Path) {
  let resources_dir = manifest_dir.join("resources");
  let bundled_api_dir = resources_dir.join("bundled-api");
  let node_runtime_dir = resources_dir.join("node-runtime");

  must_exist(&resources_dir, "resources/ (src-tauri/resources)");
  must_exist(&bundled_api_dir, "resources/bundled-api/");
  must_exist(&node_runtime_dir, "resources/node-runtime/");

  // Backend runtime entrypoint must exist inside the bundle tree.
  let bundled_runtime = bundled_api_dir.join("dist").join("desktop-runtime.js");
  if !is_file(&bundled_runtime) {
    panic!(
      "Tauri resources missing: bundled-api runtime not found at {}\n\
       Expected `resources/bundled-api/dist/desktop-runtime.js` (a built backend bundle).",
      bundled_runtime.display()
    );
  }

  // Node runtime must contain an executable for the target OS.
  let node_bin = node_runtime_dir.join("bin");
  must_exist(&node_bin, "resources/node-runtime/bin/");
  #[cfg(target_os = "windows")]
  {
    must_exist(&node_bin.join("node.exe"), "resources/node-runtime/bin/node.exe");
  }
  #[cfg(not(target_os = "windows"))]
  {
    must_exist(&node_bin.join("node"), "resources/node-runtime/bin/node");
  }

  // Required by installer validation: also ship a top-level copy.
  let top_level_runtime = resources_dir.join("desktop-runtime.js");
  if let Err(e) = copy_if_needed(&bundled_runtime, &top_level_runtime) {
    panic!(
      "Failed to copy desktop-runtime.js into resources/: {e}\n\
       src={} dest={}",
      bundled_runtime.display(),
      top_level_runtime.display()
    );
  }
}

fn main() {
  let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let resources_dir = manifest_dir.join("resources");
  let bundled_api = resources_dir.join("bundled-api");
  let node_runtime_bin = resources_dir.join("node-runtime").join("bin");

  // Used only by `tauri dev` resource probing.
  println!(
    "cargo:rustc-env=POS_DEV_BUNDLED_API_DIR={}",
    bundled_api.display()
  );
  println!(
    "cargo:rustc-env=POS_DEV_NODE_RUNTIME_BIN={}",
    node_runtime_bin.display()
  );

  // Release builds must be self-contained: validate (and normalize) required resources.
  #[cfg(not(debug_assertions))]
  validate_and_prepare_release_resources(&manifest_dir);

  // Ensure Cargo rebuilds when bundled backend artifacts change.
  println!("cargo:rerun-if-changed=resources/bundled-api/dist/desktop-runtime.js");
  println!("cargo:rerun-if-changed=resources/desktop-runtime.js");
  #[cfg(target_os = "windows")]
  println!("cargo:rerun-if-changed=resources/node-runtime/bin/node.exe");
  #[cfg(not(target_os = "windows"))]
  println!("cargo:rerun-if-changed=resources/node-runtime/bin/node");

  tauri_build::build()
}
