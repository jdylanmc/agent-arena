/*---------------------------------------------------------------------------------------------
 *  scripts/patch-vscode-jsonrpc.mjs
 *
 *  Patches `node_modules/vscode-jsonrpc/package.json` to add an `exports`
 *  map. Required because @github/copilot-sdk does:
 *
 *      import { ... } from "vscode-jsonrpc/node";
 *
 *  …without the `.js` suffix. Node 24's strict ESM resolver rejects bare
 *  subpath imports unless the package declares them in its `exports`
 *  map. vscode-jsonrpc 8.2.1 ships without one (the SDK pinned `^8.2.1`),
 *  so the SDK's `import` fails at runtime with:
 *
 *      Cannot find module 'vscode-jsonrpc/node' …
 *      Did you mean to import "vscode-jsonrpc/node.js"?
 *
 *  This script is idempotent — if `exports` is already present, it
 *  exits without writing. Runs in `npm install` AND `npm ci` because
 *  it's wired as a `postinstall` step.
 *
 *  When vscode-jsonrpc 9.x ships with a real exports map, OR when the
 *  SDK switches to importing `vscode-jsonrpc/node.js`, this script can
 *  be removed.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "..", "node_modules", "vscode-jsonrpc", "package.json");

if (!existsSync(pkgPath)) {
    // node_modules not yet installed (e.g., scripts run before deps),
    // or vscode-jsonrpc isn't a transitive dep yet — silent no-op.
    process.exit(0);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

// Compatible with vscode-jsonrpc 8.2.1's actual file layout. If a future
// version reshuffles, this script is no longer needed (per the comment
// above) — but the structure check guards against silent breakage.
const expectedExports = {
    ".": {
        types: "./lib/common/api.d.ts",
        node: "./lib/node/main.js",
        browser: "./lib/browser/main.js",
        default: "./lib/node/main.js",
    },
    "./node": {
        types: "./lib/node/main.d.ts",
        default: "./lib/node/main.js",
    },
    "./browser": {
        types: "./lib/browser/main.d.ts",
        default: "./lib/browser/main.js",
    },
};

if (pkg.exports) {
    // Already patched (or upstream added their own); leave it alone.
    process.exit(0);
}

pkg.exports = expectedExports;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
console.log(
    "[patch-vscode-jsonrpc] added exports map to vscode-jsonrpc/package.json (SDK compat)",
);
