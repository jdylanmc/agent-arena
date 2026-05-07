// @vscode/test-cli configuration.
//
// Launches a VS Code instance with this extension installed and runs the
// integration tests under test/integration/. Each run uses a unique user-data
// directory so concurrent runs / retries do not collide.
//
// On Ubuntu CI the runner needs xvfb (configured in the GitHub Actions
// workflow). Headless mode uses VS Code's in-built --headless when supported.

import { defineConfig } from "@vscode/test-cli";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

const userDataDir = mkdtempSync(resolve(tmpdir(), "agent-arena-test-"));

export default defineConfig({
  files: "test/integration/**/*.test.ts",
  version: "stable",
  workspaceFolder: resolve(import.meta.dirname, "test/fixtures/workspace"),
  mocha: {
    ui: "bdd",
    timeout: 60_000,
    retries: 1,
    reporter: "spec",
  },
  launchArgs: [
    `--user-data-dir=${userDataDir}`,
    "--disable-extensions",
    "--disable-workspace-trust",
    "--disable-telemetry",
  ],
  installExtensions: [],
});
