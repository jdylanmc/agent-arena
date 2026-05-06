// Webview bundle config.
//
// The webview is a React + Tailwind app that runs inside a VS Code webview
// (sandboxed Chromium). It cannot import vscode APIs and cannot import
// @github/copilot-sdk (constitution: extension host owns the SDK; webview talks
// to host only via the postMessage envelope per CD-04).
//
// Build output lives at dist/webview/ (relative to extension/) and is loaded
// by the extension host at runtime via vscode.Uri.joinPath(extensionUri, "dist", "webview", ...).
//
// A copy step (see plugin below) mirrors src/protocol/*.ts into
// webview-src/protocol/ at build time so the host and webview share the
// envelope validator (Zod schema). A unit test asserts byte-equality.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";

/** Mirror src/protocol/*.ts → webview-src/protocol/*.ts before the build. */
function syncProtocolDirPlugin() {
  return {
    name: "agent-arena:sync-protocol-dir",
    buildStart() {
      const srcDir = resolve(__dirname, "src/protocol");
      const dstDir = resolve(__dirname, "webview-src/protocol");
      try {
        mkdirSync(dstDir, { recursive: true });
        const entries = readdirSync(srcDir);
        for (const entry of entries) {
          const srcPath = resolve(srcDir, entry);
          const dstPath = resolve(dstDir, entry);
          if (statSync(srcPath).isFile() && (entry.endsWith(".ts") || entry.endsWith(".tsx"))) {
            copyFileSync(srcPath, dstPath);
          }
        }
      } catch (err) {
        // src/protocol may not exist yet during early scaffolding; tolerate.
        if (err && err.code !== "ENOENT") throw err;
      }
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, "webview-src"),
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist/webview"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "webview-src/index.html"),
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
  plugins: [react(), syncProtocolDirPlugin()],
  resolve: {
    alias: {
      "@protocol": resolve(__dirname, "webview-src/protocol"),
    },
  },
});
