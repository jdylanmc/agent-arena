/*---------------------------------------------------------------------------------------------
 *  scripts/launch.mjs
 *
 *  Spawns `code --extensionDevelopmentPath=<absolute path to extension/>` so
 *  the launched VS Code instance reliably finds this extension's manifest.
 *
 *  Why this isn't a one-liner in package.json: passing `.` as
 *  --extensionDevelopmentPath does not consistently resolve to an absolute
 *  path across platforms (especially Windows cmd.exe), and the failure mode
 *  is silent — VS Code launches a regular window with the activity-bar icon
 *  missing. Resolving to an absolute path here removes the guesswork.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(__dirname, "..");

const codeCmd = process.platform === "win32" ? "code.cmd" : "code";

console.log(`Launching VS Code dev host with extension at:\n  ${extensionPath}\n`);

const child = spawn(
    codeCmd,
    ["--extensionDevelopmentPath", extensionPath],
    { stdio: "inherit", shell: true, detached: true },
);

child.on("error", (err) => {
    console.error("Failed to spawn `code`. Is the VS Code CLI on your PATH?");
    console.error(err);
    process.exit(1);
});

// Detach so the launcher process can exit; the VS Code window keeps running.
child.unref();
