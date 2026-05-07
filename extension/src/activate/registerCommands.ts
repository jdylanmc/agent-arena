/*---------------------------------------------------------------------------------------------
 *  src/activate/registerCommands.ts
 *
 *  Registers the extension's commands (FR-007, FR-022, FR-025).
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { EventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";

export interface RegisterCommandsOptions {
    context: vscode.ExtensionContext;
    emitter: EventEmitter;
    /** Path to the canonical EI-1 events.jsonl log. */
    eventsLogPath: vscode.Uri;
}

export function registerCommands(options: RegisterCommandsOptions): void {
    const { context, emitter, eventsLogPath } = options;

    // Note: `agent-arena.openPrimaryAgent` is registered in extension.ts —
    // it owns the WebviewPanel lifecycle (per CD-07). Don't re-register it
    // here or activation fails with "command already exists".

    context.subscriptions.push(
        vscode.commands.registerCommand("agent-arena.showTraceLog", async () => {
            emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_COMMAND_EXECUTED,
                agent_id: null,
                payload: { command: "agent-arena.showTraceLog" },
            });
            const doc = await vscode.workspace.openTextDocument(eventsLogPath);
            await vscode.window.showTextDocument(doc, { preview: false });
        }),
    );

    // Harness commands are stubbed for now — full implementation lands in T078.
    context.subscriptions.push(
        vscode.commands.registerCommand("agent-arena.harness.export", async () => {
            emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_COMMAND_EXECUTED,
                agent_id: null,
                payload: { command: "agent-arena.harness.export" },
            });
            void vscode.window.showInformationMessage(
                "Agent Arena: harness export not yet implemented (lands in T078).",
            );
        }),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("agent-arena.harness.import", async () => {
            emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_COMMAND_EXECUTED,
                agent_id: null,
                payload: { command: "agent-arena.harness.import" },
            });
            void vscode.window.showInformationMessage(
                "Agent Arena: harness import not yet implemented (lands in T078).",
            );
        }),
    );
}
