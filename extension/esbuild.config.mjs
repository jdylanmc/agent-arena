// Extension-host bundle config.
//
// The extension host runs in Node.js inside the VS Code extension host process.
// We bundle the TypeScript source under src/ into a single CJS file at
// dist/extension.js with `vscode` left as an external (resolved at runtime by
// the host).
//
// The webview UI is bundled separately by Vite (see vite.config.ts).

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
  external: ["vscode"],
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
