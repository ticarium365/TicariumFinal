import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { visualizer } from "rollup-plugin-visualizer";

const analyzeBundle =
  process.env.ANALYZE === "1" || process.env.ANALYZE === "true";

// PORT is only required for dev/preview server, not for production build
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;
if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// BASE_PATH defaults to "/" for production builds
const basePath = process.env.BASE_PATH ?? "/";

// Yerelde Vite (ör. :3000) ile API (:8080) ayrı process; Replit'te genelde tek host reverse proxy vardı.
const apiDevTarget = (process.env.VITE_API_BASE_URL ?? "http://localhost:8080").replace(
  /\/+$/,
  "",
);

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
    ...(analyzeBundle
      ? [
          visualizer({
            open: process.env.CI !== "true",
            gzipSize: true,
            filename: path.resolve(import.meta.dirname, "dist", "stats.html"),
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /** Sadece React çekirdeği — diğer paketleri varsayılan grupta bırak (döngüsel chunk uyarısı önlenir). */
        manualChunks(id) {
          if (id.includes("node_modules/recharts")) return "vendor-recharts";
          if (id.includes("node_modules/@zxing") || id.includes("node_modules/zxing")) return "vendor-zxing";
          if (id.includes("node_modules/xlsx")) return "vendor-xlsx";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "vendor-react";
          }
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": { target: apiDevTarget, changeOrigin: true },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": { target: apiDevTarget, changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["**/*.{test,spec}.{js,jsx,ts,tsx}"],
    css: {
      modules: {
        localsConvention: "camelCase",
      },
    },
  },
});
