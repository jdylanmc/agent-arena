// Extension-host bundle config.
//
// The extension host runs in Node.js inside the VS Code extension host process.
// We bundle the TypeScript source under src/ into a single CJS file at
// dist/extension.cjs with `vscode` left as an external (resolved at runtime by
// the host).
//
// `@github/copilot-sdk` and its bundled CLI (`@github/copilot`) MUST be left
// external. The SDK locates the CLI at runtime via `require.resolve()` and
// spawns it as a child process; bundling them would break that resolution
// and the extension would fail to talk to the real Copilot model. The
// packaged extension ships with `node_modules/@github/copilot{,-sdk}` in
// place, which the CJS runtime resolves via the standard Node algorithm.
//
// Per CD-13 (CD-07 reversal), there is no separate webview bundle — each
// agent surfaces as a `vscode.Pseudoterminal`-backed `vscode.Terminal`
// driven from the extension host directly.

import * as esbuild from "esbuild";
import process from "node:process";

const watch = process.argv.includes("--watch");
const production = process.env.NODE_ENV === "production";

/** @type {import("esbuild").BuildOptions} */
const config = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.cjs",
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode", "@github/copilot-sdk", "@github/copilot"],
  sourcemap: production ? false : "linked",
  minify: production,
  treeShaking: true,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
  },
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("[esbuild] watching extension host bundle...");
} else {
  await esbuild.build(config);
}
