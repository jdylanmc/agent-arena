/*---------------------------------------------------------------------------------------------
 *  src/panel/AgentPanel.ts
 *
 *  Render-only WebviewPanel for one Agent (per CD-11 §5 + §6). The
 *  panel does NOT own the Agent's SDK session — the Agent does. Closing
 *  the panel disposes only the WebviewPanel + its post-message router;
 *  the Agent's SDK session keeps streaming and the next reveal replays
 *  the in-flight transcript.
 *
 *  Replaces the previous PrimaryAgentPanel.ts which conflated render +
 *  state ownership.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { Agent, AgentSnapshot, TurnEntry } from "../state/Agent.js";
import type { EventEmitter as CanonicalEventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import { MessageRouter } from "../webview/messageRouter.js";
import type { MessageEnvelope } from "../protocol/envelope.js";
import type {
    AgentBootstrapSchema,
    AssistantDeltaSchema,
    AssistantMessageFinalSchema,
    SessionStateSchema,
} from "../protocol/types.js";
import type { z } from "zod";
import { mintCorrelationId, mintMessageId } from "../shared/ids.js";

const VIEW_TYPE_PREFIX = "agent-arena.";

export interface AgentPanelOptions {
    agent: Agent;
    extensionUri: vscode.Uri;
    emitter: CanonicalEventEmitter;
}

export class AgentPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private router: MessageRouter | undefined;
    private readonly viewSubscriptions: vscode.Disposable[] = [];
    private readonly agent: Agent;
    private readonly extensionUri: vscode.Uri;
    private readonly emitter: CanonicalEventEmitter;
    private readonly disposeEmitter = new vscode.EventEmitter<void>();

    /** Fires when the panel is disposed (panel close OR explicit
     *  AgentPanelManager teardown). The manager subscribes to this so
     *  it can drop the panel from its Map without leaking — without
     *  this hook, AgentPanelManager would have no way to learn the
     *  panel was closed. The Agent itself does NOT subscribe. */
    readonly onDidDispose = this.disposeEmitter.event;

    constructor(opts: AgentPanelOptions) {
        this.agent = opts.agent;
        this.extensionUri = opts.extensionUri;
        this.emitter = opts.emitter;
    }

    /** Reveal an existing panel or create a new one. Idempotent —
     *  multiple calls reveal the same instance. */
    reveal(viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active): void {
        if (this.panel) {
            this.panel.reveal(viewColumn, false);
            return;
        }
        this.panel = vscode.window.createWebviewPanel(
            `${VIEW_TYPE_PREFIX}${this.agent.id}`,
            `Agent Arena · ${this.agent.displayName}`,
            { viewColumn, preserveFocus: false },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
                ],
            },
        );
        this.panel.webview.html = this.buildHtml(this.panel.webview);

        this.router = new MessageRouter(this.emitter, this.agent.id);
        this.wireRouter(this.router);

        this.viewSubscriptions.push(
            this.panel.webview.onDidReceiveMessage((raw) => {
                void this.router?.dispatch(raw);
            }),
        );
        this.viewSubscriptions.push(
            this.panel.onDidDispose(() => this.handlePanelClose()),
        );

        // Subscribe to Agent events (NOT SDK events). Per CD-11 §6,
        // the Agent owns the SDK; we just receive its derived events.
        this.viewSubscriptions.push(
            this.agent.onAssistantDelta(({ turnId, chunk }) => {
                this.postOutbound("assistant.delta", {
                    chunk,
                    sessionId: this.agent.id,
                    turnId,
                });
            }),
        );
        this.viewSubscriptions.push(
            this.agent.onAssistantFinal(({ turnId, text }) => {
                this.postOutbound("assistant.message.final", {
                    text,
                    sessionId: this.agent.id,
                    turnId,
                });
            }),
        );
        this.viewSubscriptions.push(
            this.agent.onStatusChange((snapshot) => {
                this.postOutbound("session.state", {
                    status:
                        snapshot.status === "running"
                            ? "running"
                            : snapshot.status === "error"
                              ? "error"
                              : "idle",
                    sessionId: this.agent.id,
                });
            }),
        );
        this.viewSubscriptions.push(
            this.agent.onError(({ message }) => {
                this.postOutbound("error", {
                    code: "agent_error",
                    message,
                    recoverable: false,
                });
            }),
        );

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_WEBVIEW_OPENED,
            agent_id: this.agent.id,
            payload: {
                surface: "WebviewPanel",
                viewType: `${VIEW_TYPE_PREFIX}${this.agent.id}`,
            },
        });
    }

    /** Tear down the panel + router + view subscriptions. Per CD-11 §6,
     *  this does NOT touch the Agent — its SDK session keeps running. */
    dispose(): void {
        for (const sub of this.viewSubscriptions) {
            try {
                sub.dispose();
            } catch {
                /* ignore */
            }
        }
        this.viewSubscriptions.length = 0;
        this.router = undefined;
        if (this.panel) {
            const panel = this.panel;
            this.panel = undefined;
            try {
                panel.dispose();
            } catch {
                /* already disposed */
            }
        }
        this.disposeEmitter.fire();
        this.disposeEmitter.dispose();
    }

    // -----------------------------------------------------------------------
    //  Inbound message handlers
    // -----------------------------------------------------------------------

    private wireRouter(router: MessageRouter): void {
        router.on("webview.ready", () => this.sendBootstrap());
        router.on("prompt.submit", async (payload, envelope) => {
            // CD-04 — propagate the originating envelope's correlation_id
            // through the Agent so every downstream EI-1 event in the
            // prompt → SDK → response chain shares the same audit id.
            await this.agent.submitPrompt(payload.promptText, envelope.correlation_id);
        });
        router.on("yolo.set", async (payload) => {
            await this.agent.setYolo(payload.enabled);
        });
    }

    private handlePanelClose(): void {
        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_WEBVIEW_CLOSED,
            agent_id: this.agent.id,
            payload: {
                surface: "WebviewPanel",
                viewType: `${VIEW_TYPE_PREFIX}${this.agent.id}`,
            },
        });
        this.dispose();
    }

    private sendBootstrap(): void {
        const snapshot = this.agent.getSnapshot();
        const payload: z.infer<typeof AgentBootstrapSchema> = {
            agentId: snapshot.id,
            workingDirectory: snapshot.workingDirectory,
            adapterKind: snapshot.adapterKind,
            bannerSubtitle: snapshot.bannerSubtitle,
            yoloEnabled: snapshot.yoloEnabled,
            transcript: replayableTurns(snapshot.transcript).slice(),
        };
        if (snapshot.adapterLogin !== undefined) payload.adapterLogin = snapshot.adapterLogin;
        if (snapshot.currentTurnId !== undefined) payload.currentTurnId = snapshot.currentTurnId;
        this.postOutbound("agent.bootstrap", payload);
        this.postOutbound("session.state", {
            status: snapshot.status === "running" ? "running" : "idle",
            sessionId: this.agent.id,
        });
    }

    // -----------------------------------------------------------------------
    //  Outbound wire helpers
    // -----------------------------------------------------------------------

    private postOutbound(
        type: "agent.bootstrap",
        payload: z.infer<typeof AgentBootstrapSchema>,
    ): void;
    private postOutbound(
        type: "assistant.delta",
        payload: z.infer<typeof AssistantDeltaSchema>,
    ): void;
    private postOutbound(
        type: "assistant.message.final",
        payload: z.infer<typeof AssistantMessageFinalSchema>,
    ): void;
    private postOutbound(type: "session.state", payload: z.infer<typeof SessionStateSchema>): void;
    private postOutbound(
        type: "error",
        payload: { code: string; message: string; recoverable: boolean },
    ): void;
    private postOutbound(type: string, payload: unknown): void {
        if (!this.panel) return;
        const envelope: MessageEnvelope = {
            protocol_version: 1,
            message_id: mintMessageId(),
            correlation_id: mintCorrelationId(),
            agent_id: this.agent.id,
            type,
            payload: payload as Record<string, unknown>,
        };
        void this.panel.webview.postMessage(envelope);
    }

    // -----------------------------------------------------------------------
    //  CSP-locked HTML template (CD-07 §4)
    // -----------------------------------------------------------------------

    private buildHtml(webview: vscode.Webview): string {
        const dist = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, "assets", "index.js"));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, "assets", "index.css"));
        const cspSource = webview.cspSource;
        const nonce = mintNonce();

        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src ${cspSource} 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; img-src ${cspSource} https: data:; connect-src 'none';" />
    <title>Agent Arena · ${escapeHtml(this.agent.displayName)}</title>
    <link rel="stylesheet" href="${cssUri}" />
  </head>
  <body class="m-0 h-screen overflow-hidden">
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
    }
}

function replayableTurns(
    transcript: ReadonlyArray<TurnEntry>,
): ReadonlyArray<{ turnId: string; chunks: string[]; final?: string }> {
    return transcript.map((turn) => {
        const out: { turnId: string; chunks: string[]; final?: string } = {
            turnId: turn.turnId,
            chunks: turn.chunks.slice(),
        };
        if (turn.final !== undefined) out.final = turn.final;
        return out;
    });
}

function mintNonce(): string {
    const bytes = new Uint8Array(16);
    const c = (
        globalThis as unknown as {
            crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
        }
    ).crypto;
    if (c?.getRandomValues) {
        c.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
