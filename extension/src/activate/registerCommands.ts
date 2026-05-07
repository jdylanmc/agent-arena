/*---------------------------------------------------------------------------------------------
 *  src/activate/registerCommands.ts
 *
 *  Registers extension commands beyond the agent-open commands wired in
 *  extension.ts (which owns the WebviewPanel lifecycle per CD-07/CD-11).
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
}
