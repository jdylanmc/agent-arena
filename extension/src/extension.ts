/*---------------------------------------------------------------------------------------------
 *  src/extension.ts
 *
 *  Extension host entry point.
 *
 *  Architecture (per CD-06):
 *    - The primary agent runs in a VS Code Pseudoterminal in the integrated
 *      Terminal panel (xterm.js renderer; no bespoke terminal).
 *    - The Activity-Bar view (`agentArenaPrimaryView`) is a TreeView
 *      placeholder with a `viewsWelcome` markdown link to open the terminal.
 *    - Yolo state is a status-bar item (per-workspace, per-agent, never
 *      synced across machines per CD-05).
 *    - Permission prompts use VS Code's native modal dialogs.
 *
 *  activate(context) wires:
 *    - EventEmitter → agent-arena.events.jsonl (canonical EI-1 log)
 *    - SdkAdapter → FakeSdkAdapter in demo mode (until T035 lands the
 *      production CopilotSdkAdapter)
 *    - YoloStore + status-bar item (CD-05)
 *    - Tree-view placeholder for the activity-bar entry
 *    - Pseudoterminal-creating command `agent-arena.openPrimaryAgent`
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { EventEmitter } from "./telemetry/EventEmitter.js";
import { EVENT_NAMES } from "./telemetry/eventNames.js";
import { FakeSdkAdapter } from "./sdk/FakeSdkAdapter.js";
import type { SdkAdapter } from "./sdk/SdkAdapter.js";
import { registerPrimaryView } from "./activate/registerView.js";
import { registerCommands } from "./activate/registerCommands.js";
import { PrimaryAgentTerminal } from "./terminal/PrimaryAgentTerminal.js";
import { YoloStore } from "./state/yolo.js";
import { YoloStatusBar } from "./state/yoloStatusBar.js";

let sdk: SdkAdapter | undefined;
let emitter: EventEmitter | undefined;
let yoloStatusBar: YoloStatusBar | undefined;
let primaryTerminal: vscode.Terminal | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const eventsLogPath = vscode.Uri.joinPath(context.logUri, "agent-arena.events.jsonl");
    emitter = new EventEmitter({ filePath: eventsLogPath.fsPath });

    emitter.emitNew({
        level: "info",
        event: EVENT_NAMES.AA_EXTENSION_ACTIVATE,
        agent_id: null,
        payload: {
            extensionVersion: context.extension.packageJSON.version as string,
            vscodeVersion: vscode.version,
            logPath: eventsLogPath.fsPath,
        },
    });

    // ----- Demo-mode SDK adapter -----
    // Until T035 lands the production CopilotSdkAdapter, the extension uses
    // FakeSdkAdapter with auto-respond so the round-trip surface is visible
    // without a Copilot subscription.
    const fake = new FakeSdkAdapter({
        autoRespondChunkDelayMs: 25,
        autoRespond: (prompt: string): string[] => {
            const trimmed = prompt.trim().toLowerCase();
            if (trimmed.includes("pong")) {
                return ["pong"];
            }
            if (trimmed.startsWith("reply:")) {
                const rest = prompt.slice(prompt.indexOf(":") + 1).trim();
                return chunked(rest, 3);
            }
            const reply = `[demo] You said: "${prompt}". Production CopilotSdkAdapter lands in T035; until then, the FakeSdkAdapter generates this canned response so the round-trip surface is visible end-to-end.`;
            return chunked(reply, 5);
        },
    });
    await fake.start({
        copilotHome: vscode.Uri.joinPath(context.globalStorageUri, ".copilot").fsPath,
        telemetryFilePath: vscode.Uri.joinPath(context.logUri, "agent-arena.sdk-otel.jsonl").fsPath,
    });
    sdk = fake;

    // ----- Yolo state (CD-05) -----
    const yoloStore = new YoloStore(context.workspaceState);
    yoloStatusBar = new YoloStatusBar(yoloStore, emitter, "primary");
    context.subscriptions.push(yoloStatusBar);

    // ----- Activity-bar placeholder view -----
    registerPrimaryView(context);

    // ----- Open Primary Agent command (creates the Pseudoterminal) -----
    context.subscriptions.push(
        vscode.commands.registerCommand("agent-arena.openPrimaryAgent", () => {
            // If a terminal already exists and isn't disposed, re-show it.
            if (primaryTerminal && primaryTerminal.exitStatus === undefined) {
                primaryTerminal.show();
                return;
            }
            const pty = new PrimaryAgentTerminal({
                sdk: sdk!,
                emitter: emitter!,
                agentId: "primary",
                getYolo: () => yoloStore.get("primary"),
                setYolo: (next) => {
                    void yoloStore.set("primary", next).then(() => {
                        yoloStatusBar?.refresh();
                        emitter?.emitNew({
                            level: "info",
                            event: EVENT_NAMES.AA_YOLO_TOGGLED,
                            agent_id: "primary",
                            payload: { agentId: "primary", enabled: next, source: "terminal" },
                        });
                    });
                },
            });
            primaryTerminal = vscode.window.createTerminal({
                name: "Agent Arena · Primary Agent",
                pty,
                iconPath: new vscode.ThemeIcon("comment-discussion"),
            });
            primaryTerminal.show();
            emitter?.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_COMMAND_EXECUTED,
                agent_id: "primary",
                payload: { command: "agent-arena.openPrimaryAgent", surface: "pseudoterminal" },
            });
        }),
    );

    // ----- Other commands (showTraceLog, harness import/export) -----
    registerCommands({ context, emitter, eventsLogPath });
}

export async function deactivate(): Promise<void> {
    emitter?.emitNew({
        level: "info",
        event: EVENT_NAMES.AA_EXTENSION_DEACTIVATE,
        agent_id: null,
        payload: {},
    });
    yoloStatusBar?.dispose();
    primaryTerminal?.dispose();
    await sdk?.stop();
}

/** Split a string into roughly-equal chunks. Used by the demo auto-respond
 *  to produce visible streaming. */
function chunked(s: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < s.length) {
        chunks.push(s.slice(i, i + chunkSize));
        i += chunkSize;
    }
    return chunks.length > 0 ? chunks : [s];
}

