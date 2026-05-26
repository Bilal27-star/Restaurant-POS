/**
 * Tauri production entrypoint (compiled to `dist/desktop-runtime.js`).
 * Implementation lives in `src/desktop/bootstrap-pos-runtime.ts`.
 */
console.log("[desktop-runtime] Initializing...");
import("./desktop/bootstrap-pos-runtime.js")
    .then(() => {
    console.log("[desktop-runtime] Bootstrap loaded successfully");
})
    .catch((err) => {
    console.error("[desktop-runtime] Bootstrap failed:");
    console.error(err);
    process.exit(1);
});
export {};
