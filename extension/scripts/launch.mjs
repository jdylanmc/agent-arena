/*---------------------------------------------------------------------------------------------
 *  scripts/launch.mjs
 *
 *  Spawns `code --extensionDevelopmentPath=<absolute path to extension/> <repo root>`
 *  so the launched VS Code instance:
 *    - reliably finds this extension's manifest (absolute path, since
 *      --extensionDevelopmentPath=. is unreliable on Windows cmd.exe)
 *    - opens the agent-arena repo root as the workspace folder, so the
 *      Pseudoterminal is automatically scoped to it (cwd, file pickers,
 *      relative paths) and the Explorer shows project files end-to-end.
 *
 *  Pass an alternate workspace path as the first argument if you want to
 *  point the dev host at a different folder, e.g.
 *      node scripts/launch.mjs D:/some/other/repo
 *--------------------------------------------------------------------------------------------*/

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(__dirname, "..");
const repoRoot = resolve(extensionPath, "..");
const workspacePath = process.argv[2] ? resolve(process.argv[2]) : repoRoot;

const codeCmd = process.platform === "win32" ? "code.cmd" : "code";

console.log(`Launching VS Code dev host:`);
console.log(`  extension : ${extensionPath}`);
console.log(`  workspace : ${workspacePath}\n`);

const child = spawn(
    codeCmd,
    ["--extensionDevelopmentPath", extensionPath, workspacePath],
    { stdio: "inherit", shell: true, detached: true },
);

child.on("error", (err) => {
    console.error("Failed to spawn `code`. Is the VS Code CLI on your PATH?");
    console.error(err);
    process.exit(1);
});

child.unref();
