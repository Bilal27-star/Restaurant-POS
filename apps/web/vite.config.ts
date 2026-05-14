import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  /** Tauri loads the SPA from `asset://` with relative chunk URLs. */
  base: process.env.TAURI_ENV_PLATFORM ? "./" : "/",
  envPrefix: ["VITE_", "TAURI_ENV_"],
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
      "/socket.io": { target: "http://127.0.0.1:4000", ws: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: mode === "development",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("socket.io-client")) return "vendor-socket";
          if (id.includes("@tanstack/react-query")) return "vendor-query";
          if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
}));
