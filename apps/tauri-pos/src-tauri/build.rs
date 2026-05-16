fn main() {
  let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
  let bundled_api = manifest_dir.join("resources").join("bundled-api");
  let node_runtime_bin = manifest_dir.join("resources").join("node-runtime").join("bin");
  println!(
    "cargo:rustc-env=POS_DEV_BUNDLED_API_DIR={}",
    bundled_api.display()
  );
  println!(
    "cargo:rustc-env=POS_DEV_NODE_RUNTIME_BIN={}",
    node_runtime_bin.display()
  );
  println!("cargo:rerun-if-changed=resources/bundled-api/dist/desktop-runtime.js");
  println!("cargo:rerun-if-changed=resources/node-runtime/bin/node");
  tauri_build::build()
}
