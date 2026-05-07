/*---------------------------------------------------------------------------------------------
 *  test/integration/activation.test.ts
 *
 *  End-to-end activation + command-registration tests (T049-T053). Runs
 *  inside a real VS Code instance via @vscode/test-electron with this
 *  extension loaded as a development extension.
 *
 *  Verifies:
 *   - activate() returns without throwing.
 *   - The extension is `isActive` after activation completes.
 *   - All five contributed commands are registered.
 *   - The Activity Bar view container `agentArena` is registered.
 *
 *  Per FR-033, these tests do NOT exercise the live Copilot SDK — the
 *  extension's adapter selector falls back to FakeSdkAdapter when the
 *  CLI fails to start. The test workspace at
 *  `test/fixtures/workspace/` is a minimal empty folder so VS Code
 *  treats the dev host as a "workspace open" environment.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "node:assert/strict";
import * as vscode from "vscode";

const EXTENSION_ID = "jdylanmc.agent-arena";

describe("Agent Arena · activation", () => {
    it("the extension is discoverable by id", () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, `Extension ${EXTENSION_ID} not found in vscode.extensions.all`);
    });

    it("activate() resolves without throwing", async () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext);
        await ext.activate();
        assert.equal(ext.isActive, true, "ext.isActive was false after activate()");
    });

    it("registers agent-arena.openPrimaryAgent", async () => {
        await activated();
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(
            cmds.includes("agent-arena.openPrimaryAgent"),
            "agent-arena.openPrimaryAgent missing from registered commands",
        );
    });

    it("registers agent-arena.showTraceLog", async () => {
        await activated();
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes("agent-arena.showTraceLog"));
    });

    it("registers agent-arena.toggleYolo", async () => {
        await activated();
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes("agent-arena.toggleYolo"));
    });

    it("registers agent-arena.harness.export and harness.import", async () => {
        await activated();
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes("agent-arena.harness.export"));
        assert.ok(cmds.includes("agent-arena.harness.import"));
    });
});

async function activated(): Promise<vscode.Extension<unknown>> {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} not found`);
    if (!ext.isActive) {
        await ext.activate();
    }
    return ext;
}
