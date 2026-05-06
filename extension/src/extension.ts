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
 *  SDK selection (per T035 + selectAdapter.ts):
 *    - On first `agent-arena.openPrimaryAgent`, lazily run `selectAdapter()`:
 *      try the production `CopilotSdkAdapter` first; if the user is signed
 *      in, use it. Otherwise fall back to the in-memory `FakeSdkAdapter`
 *      demo so the round-trip is still visible.
 *    - The selection is cached for the rest of the extension's lifetime; a
 *      future spec adds explicit re-selection (sign in / sign out flows).
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { EventEmitter } from "./telemetry/EventEmitter.js";
import { EVENT_NAMES } from "./telemetry/eventNames.js";
import { selectAdapter, type AdapterSelection } from "./sdk/selectAdapter.js";
import { registerPrimaryView } from "./activate/registerView.js";
import { registerCommands } from "./activate/registerCommands.js";
import { PrimaryAgentTerminal } from "./terminal/PrimaryAgentTerminal.js";
import { YoloStore } from "./state/yolo.js";
import { YoloStatusBar } from "./state/yoloStatusBar.js";

let emitter: EventEmitter | undefined;
let yoloStatusBar: YoloStatusBar | undefined;
let primaryTerminal: vscode.Terminal | undefined;
let adapterSelection: AdapterSelection | undefined;

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

    // ----- Yolo state (CD-05) -----
    const yoloStore = new YoloStore(context.workspaceState);
    yoloStatusBar = new YoloStatusBar(yoloStore, emitter, "primary");
    context.subscriptions.push(yoloStatusBar);

    // ----- Activity-bar placeholder view -----
    registerPrimaryView(context);

    // ----- Open Primary Agent command -----
    // Adapter selection is LAZY — happens on first invocation, not on
    // extension activation. Avoids spawning the Copilot CLI on every VS Code
    // startup just in case the user might want to use Agent Arena.
    context.subscriptions.push(
        vscode.commands.registerCommand("agent-arena.openPrimaryAgent", async () => {
            // Re-show existing terminal if it's alive.
            if (primaryTerminal && primaryTerminal.exitStatus === undefined) {
                primaryTerminal.show();
                return;
            }

            try {
                if (!adapterSelection) {
                    adapterSelection = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: "Agent Arena: connecting…",
                            cancellable: false,
                        },
                        async () =>
                            await selectAdapter({
                                emitter: emitter!,
                                copilotHome: vscode.Uri.joinPath(
                                    context.globalStorageUri,
                                    ".copilot",
                                ).fsPath,
                                telemetryFilePath: vscode.Uri.joinPath(
                                    context.logUri,
                                    "agent-arena.sdk-otel.jsonl",
                                ).fsPath,
                                fakeAutoRespond: demoAutoRespond,
                            }),
                    );
                }

                const sel = adapterSelection;
                const pty = new PrimaryAgentTerminal({
                    sdk: sel.adapter,
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
                    bannerSubtitle: bannerSubtitleFor(sel),
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
                    payload: {
                        command: "agent-arena.openPrimaryAgent",
                        adapterKind: sel.kind,
                    },
                });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                emitter?.emitNew({
                    level: "error",
                    event: EVENT_NAMES.AA_SDK_CLI_START_FAILED,
                    agent_id: null,
                    payload: { error: msg },
                });
                void vscode.window.showErrorMessage(`Agent Arena: failed to open — ${msg}`);
            }
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
    if (adapterSelection) {
        try {
            await adapterSelection.adapter.stop();
        } catch {
            /* swallow — extension is shutting down */
        }
        adapterSelection = undefined;
    }
}

/** Demo-mode auto-respond. The FakeSdkAdapter calls this when the user is
 *  not signed in to Copilot. Production CopilotSdkAdapter ignores this. */
function demoAutoRespond(prompt: string): string[] {
    const trimmed = prompt.trim().toLowerCase();
    if (trimmed.includes("pong")) return ["pong"];
    if (trimmed.startsWith("reply:")) {
        const rest = prompt.slice(prompt.indexOf(":") + 1).trim();
        return chunked(rest, 3);
    }
    const reply = `[demo] You said: "${prompt}". Sign in to GitHub Copilot to talk to a real model — until then, the FakeSdkAdapter generates this canned response so the round-trip surface is visible end-to-end.`;
    return chunked(reply, 5);
}

function bannerSubtitleFor(sel: AdapterSelection): string {
    if (sel.kind === "copilot") {
        const login = sel.auth?.login ? ` as ${sel.auth.login}` : "";
        const authType = sel.auth?.authType ?? "user";
        return `connected to GitHub Copilot${login} (${authType})`;
    }
    switch (sel.fallbackReason) {
        case "not_authenticated":
            return "demo mode (not signed in to GitHub Copilot)";
        case "start_failed":
            return "demo mode (Copilot CLI failed to start)";
        case "fake_forced":
            return "demo mode (forced)";
        default:
            return "demo mode";
    }
}

function chunked(s: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < s.length) {
        chunks.push(s.slice(i, i + chunkSize));
        i += chunkSize;
    }
    return chunks.length > 0 ? chunks : [s];
}

