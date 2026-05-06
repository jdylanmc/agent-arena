/*---------------------------------------------------------------------------------------------
 *  vitest.config.ts
 *
 *  Unit-test config. SEPARATE from vite.config.ts (which builds the webview)
 *  because vitest auto-discovers vite.config.ts and uses its `root`, which
 *  for the webview build is webview-src/ — not where our tests live.
 *
 *  Tests live under test/unit/. Integration tests (under test/integration/)
 *  use @vscode/test-cli (.vscode-test.mjs), NOT vitest.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  test: {
    include: ["test/unit/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "test/integration/**"],
    environment: "node",
    globals: false,
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
