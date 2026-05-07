/*---------------------------------------------------------------------------------------------
 *  src/extension.ts
 *
 *  Extension host entry point.
 *
 *  Architecture (per CD-07):
 *    - The primary agent runs in a `vscode.WebviewPanel` opened in the
 *      editor area (not the sidebar, not the bottom panel). Renderer is
 *      `@xterm/xterm` inside a React shell living in `webview-src/`.
 *    - The Activity-Bar view (`agentArenaPrimaryView`) is a TreeView
 *      welcome with a button that creates/reveals the panel; the panel
 *      auto-opens on first extension activation per session.
 *    - Yolo state is a status-bar item (per-workspace, per-agent, never
 *      synced across machines per CD-05).
 *    - Permission prompts use VS Code's native modal dialogs.
 *
 *  SDK selection (per T035 + selectAdapter.ts):
 *    - On first `agent-arena.openPrimaryAgent`, lazily run `selectAdapter()`:
 *      try the production `CopilotSdkAdapter` first; if the user is signed
 *      in, use it. Otherwise fall back to the in-memory `FakeSdkAdapter`
 *      demo so the round-trip is still visible.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { EventEmitter } from "./telemetry/EventEmitter.js";
import { EVENT_NAMES } from "./telemetry/eventNames.js";
import { selectAdapter, type AdapterSelection } from "./sdk/selectAdapter.js";
import { registerPrimaryView } from "./activate/registerView.js";
import { registerCommands } from "./activate/registerCommands.js";
import { PrimaryAgentPanel } from "./panel/PrimaryAgentPanel.js";
import { YoloStore } from "./state/yolo.js";
import { YoloStatusBar } from "./state/yoloStatusBar.js";
import { DefaultPolicyResolver } from "./permission/DefaultPolicyResolver.js";

let emitter: EventEmitter | undefined;
let yoloStatusBar: YoloStatusBar | undefined;
let primaryPanel: PrimaryAgentPanel | undefined;
let adapterSelection: AdapterSelection | undefined;
let hasAutoOpenedThisSession = false;

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
    // extension activation. Avoids spawning the Copilot CLI on every VS
    // Code startup just in case the user might want to use Agent Arena.
    const openPrimary = async (viewColumn?: vscode.ViewColumn): Promise<void> => {
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
                            extensionPath: context.extensionUri.fsPath,
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
            if (!primaryPanel) {
                const workingDirectory =
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
                const policyResolver = new DefaultPolicyResolver({
                    emitter: emitter!,
                    getYolo: (agentId) => yoloStore.get(agentId),
                });
                const panelOpts: ConstructorParameters<typeof PrimaryAgentPanel>[0] = {
                    extensionUri: context.extensionUri,
                    sdk: sel.adapter,
                    emitter: emitter!,
                    agentId: "primary",
                    workingDirectory,
                    bannerSubtitle: bannerSubtitleFor(sel),
                    adapterKind: sel.kind,
                    getYolo: () => yoloStore.get("primary"),
                    setYolo: (next) => {
                        void yoloStore.set("primary", next).then(() => {
                            yoloStatusBar?.refresh();
                        });
                    },
                    policyResolver,
                };
                if (sel.auth?.login !== undefined) panelOpts.adapterLogin = sel.auth.login;
                primaryPanel = new PrimaryAgentPanel(panelOpts);
                context.subscriptions.push(primaryPanel);
            }
            primaryPanel.reveal(viewColumn);

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
    };

    context.subscriptions.push(
        vscode.commands.registerCommand("agent-arena.openPrimaryAgent", () => openPrimary()),
    );

    // ----- Auto-open on first activation (per CD-07 §3) -----
    // Subsequent activations of the same VS Code session will not re-open
    // automatically; the user can re-summon via the activity-bar entry or
    // the Command Palette. Open beside the welcome page so it stays visible.
    if (!hasAutoOpenedThisSession) {
        hasAutoOpenedThisSession = true;
        // Defer to next tick so the activity-bar registration completes first.
        setTimeout(() => {
            void openPrimary(vscode.ViewColumn.Beside);
        }, 250);
    }

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
    primaryPanel?.dispose();
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
