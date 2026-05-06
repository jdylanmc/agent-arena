/*---------------------------------------------------------------------------------------------
 *  src/extension.ts
 *
 *  Extension host entry point.
 *
 *  activate(context) wires:
 *    - EventEmitter → agent-arena.events.jsonl (canonical EI-1 log)
 *    - SdkAdapter → FakeSdkAdapter in demo mode (until T035 lands the
 *      production CopilotSdkAdapter)
 *    - PrimaryAgentViewProvider → registers the activity-bar webview
 *    - Commands (open primary agent, show trace log, harness import/export)
 *
 *  deactivate() emits the deactivate event and stops the SDK client.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { EventEmitter } from "./telemetry/EventEmitter.js";
import { EVENT_NAMES } from "./telemetry/eventNames.js";
import { FakeSdkAdapter } from "./sdk/FakeSdkAdapter.js";
import type { SdkAdapter } from "./sdk/SdkAdapter.js";
import { PrimaryAgentViewProvider } from "./webview/ViewProvider.js";
import { registerCommands } from "./activate/registerCommands.js";

let sdk: SdkAdapter | undefined;
let emitter: EventEmitter | undefined;

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
    // without a Copilot subscription. A future task (T035) will swap this for
    // the real adapter when the user is signed in.
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
            const reply = `[demo mode] You said: "${prompt}". Production CopilotSdkAdapter lands in T035 — until then, the FakeSdkAdapter generates this canned response so the round-trip surface is visible end-to-end.`;
            return chunked(reply, 5);
        },
    });
    await fake.start({
        copilotHome: vscode.Uri.joinPath(context.globalStorageUri, ".copilot").fsPath,
        telemetryFilePath: vscode.Uri.joinPath(context.logUri, "agent-arena.sdk-otel.jsonl").fsPath,
    });
    sdk = fake;

    // ----- Webview view provider -----
    const provider = new PrimaryAgentViewProvider(context.extensionUri, emitter, sdk);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PrimaryAgentViewProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
    );

    // ----- Commands -----
    registerCommands({ context, emitter, eventsLogPath });
}

export async function deactivate(): Promise<void> {
    emitter?.emitNew({
        level: "info",
        event: EVENT_NAMES.AA_EXTENSION_DEACTIVATE,
        agent_id: null,
        payload: {},
    });
    await sdk?.stop();
}

/**
 * Split a string into roughly-equal chunks. Used by the demo auto-respond
 * to produce visible streaming.
 */
function chunked(s: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < s.length) {
        chunks.push(s.slice(i, i + chunkSize));
        i += chunkSize;
    }
    return chunks.length > 0 ? chunks : [s];
}
