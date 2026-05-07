/*---------------------------------------------------------------------------------------------
 *  src/panel/PrimaryAgentPanel.ts
 *
 *  Host-side orchestrator for the primary agent surface (per CD-07 — replaces
 *  the CD-06 Pseudoterminal). Owns:
 *    - the `vscode.WebviewPanel` lifecycle (create / reveal / dispose)
 *    - the CSP-locked HTML template that bootstraps the React + xterm.js app
 *    - the host side of the CD-04 post-message envelope (via MessageRouter)
 *    - the bridge between webview events and the SdkAdapter session
 *
 *  The webview talks ONLY to this class via post-message; it never touches
 *  the SDK directly (the constitution + CD-04 forbid it).
 *
 *  This file does not parse keystrokes or render banners — that work moved
 *  into the React shell at `webview-src/`. The host's job is now to mint
 *  sessions, forward streaming chunks, and surface permission prompts via
 *  VS Code's modal dialogs (per CD-07 §6).
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { SdkAdapter, SdkSessionHandle } from "../sdk/SdkAdapter.js";
import type { EventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import { MessageRouter } from "../webview/messageRouter.js";
import type { MessageEnvelope } from "../protocol/envelope.js";
import type {
    AgentBootstrapSchema,
    AssistantDeltaSchema,
    AssistantMessageFinalSchema,
    SessionStateSchema,
    PermissionPromptSchema,
} from "../protocol/types.js";
import type { z } from "zod";
import { mintCorrelationId, mintSessionId, mintMessageId } from "../shared/ids.js";
import type { PolicyResolver } from "../permission/PermissionPolicy.js";

const VIEW_TYPE = "agent-arena.primaryAgent";

export interface PrimaryAgentPanelOptions {
    extensionUri: vscode.Uri;
    sdk: SdkAdapter;
    emitter: EventEmitter;
    agentId: string;
    workingDirectory: string;
    bannerSubtitle: string;
    adapterKind: "copilot" | "fake-demo";
    adapterLogin?: string;
    getYolo: () => boolean;
    setYolo: (next: boolean) => void;
    /** Resolves the active PermissionPolicy per agent on each tool
     *  invocation (FR-019 / R-06). The default resolver picks
     *  YoloPolicy when yolo is on and PromptUserPolicy otherwise. */
    policyResolver: PolicyResolver;
}

/** Encapsulates ONE primary-agent WebviewPanel + the SDK session that
 *  backs it. The class is created lazily by extension.ts when the user
 *  invokes `agent-arena.openPrimaryAgent`; subsequent invocations reveal
 *  the existing instance instead of creating a second one. */
export class PrimaryAgentPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private session: SdkSessionHandle | undefined;
    private currentTurnId: string | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly router: MessageRouter;

    constructor(private readonly opts: PrimaryAgentPanelOptions) {
        this.router = new MessageRouter(opts.emitter, opts.agentId);
        this.wireRouter();
    }

    /** Create the WebviewPanel if it doesn't exist; otherwise reveal it. */
    reveal(viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active): void {
        if (this.panel) {
            this.panel.reveal(viewColumn, false);
            return;
        }
        this.panel = vscode.window.createWebviewPanel(
            VIEW_TYPE,
            "Agent Arena · Primary Agent",
            { viewColumn, preserveFocus: false },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.opts.extensionUri, "dist", "webview"),
                ],
            },
        );
        this.panel.webview.html = this.buildHtml(this.panel.webview);

        this.disposables.push(
            this.panel.webview.onDidReceiveMessage((raw) => {
                void this.router.dispatch(raw);
            }),
        );
        this.disposables.push(this.panel.onDidDispose(() => this.dispose()));

        this.opts.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_WEBVIEW_OPENED,
            agent_id: this.opts.agentId,
            payload: {
                surface: "WebviewPanel",
                adapterKind: this.opts.adapterKind,
                workingDirectory: this.opts.workingDirectory,
            },
        });
    }

    dispose(): void {
        for (const d of this.disposables) {
            try {
                d.dispose();
            } catch {
                /* ignore */
            }
        }
        this.disposables.length = 0;
        if (this.session) {
            void this.session.disconnect().catch(() => undefined);
            this.session = undefined;
        }
        if (this.panel) {
            const panel = this.panel;
            this.panel = undefined;
            try {
                panel.dispose();
            } catch {
                /* already disposed */
            }
        }
    }

    // -----------------------------------------------------------------------
    // Inbound message handlers (webview → host)
    // -----------------------------------------------------------------------

    private wireRouter(): void {
        this.router.on("webview.ready", () => {
            this.sendBootstrap();
        });
        this.router.on("prompt.submit", async (payload) => {
            await this.handlePromptSubmit(payload.promptText);
        });
        this.router.on("yolo.set", (payload) => {
            this.opts.setYolo(payload.enabled);
            this.opts.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_YOLO_TOGGLED,
                agent_id: this.opts.agentId,
                payload: {
                    agentId: this.opts.agentId,
                    enabled: payload.enabled,
                    source: "panel",
                },
            });
        });
        this.router.on("permission.respond", () => {
            // Permission flow uses VS Code modal dialogs (CD-07 §6); the
            // webview no longer mediates it. Kept handler for protocol
            // completeness; treated as a no-op until a future spec
            // re-introduces in-panel permission UI.
        });
    }

    private async handlePromptSubmit(rawPrompt: string): Promise<void> {
        const prompt = rawPrompt.trim();
        if (prompt.length === 0) return;

        try {
            await this.ensureSession();
        } catch (err: unknown) {
            this.postOutbound("error", {
                code: "session_start_failed",
                message: err instanceof Error ? err.message : String(err),
                recoverable: true,
            });
            return;
        }
        if (!this.session) return;

        const turnId = mintMessageId();
        this.currentTurnId = turnId;
        this.postOutbound("session.state", {
            status: "running",
            sessionId: this.session.sessionId,
        });
        await this.session.send({ prompt, mode: "enqueue" } as never);
    }

    private async ensureSession(): Promise<void> {
        if (this.session) return;
        const sessionId = mintSessionId(this.opts.agentId);
        const correlationId = mintCorrelationId();
        const policyResolver = this.opts.policyResolver;

        const handle = await this.opts.sdk.createSession({
            sessionId,
            workingDirectory: this.opts.workingDirectory,
            // FR-019 / R-06 — the shim resolves the active PermissionPolicy
            // for this agent on EVERY tool invocation (not just at session
            // creation), so a yolo toggle takes effect immediately without
            // restarting the session. Future per-tool policies plug into
            // PolicyResolver.forAgent without changing this call site.
            onPermissionRequest: async (
                request: { toolName?: string; summary?: string } & Record<string, unknown>,
            ): Promise<{ kind: "approved" | "denied"; reason?: string }> => {
                const policy = policyResolver.forAgent(this.opts.agentId);
                const decision = await policy.decide({
                    agentId: this.opts.agentId,
                    sessionId,
                    correlationId,
                    request: request as never,
                    invocation: {
                        toolName: request?.toolName ?? "",
                    } as never,
                });
                if (decision.kind === "allow") {
                    return decision.reason !== undefined
                        ? { kind: "approved", reason: decision.reason }
                        : { kind: "approved" };
                }
                if (decision.kind === "deny") {
                    return { kind: "denied", reason: decision.reason };
                }
                // "ask" is reserved for future per-tool policies; for the
                // scaffold we treat it as deny-with-reason.
                return { kind: "denied", reason: "policy_returned_ask" };
            },
        } as never);
        this.session = handle;

        // Wire SDK streaming events → webview deltas. Both the production
        // CopilotSdkAdapter (wrapping the real SDK) and FakeSdkAdapter
        // emit events with the SDK's nested-data shape:
        //   { type, data: { deltaContent | content | ... } }
        type AssistantContentEvent = { type: string; data?: { deltaContent?: string; content?: string } };
        type SessionErrorEvent = { type: string; data?: { errorType?: string; message?: string } };

        this.disposables.push(
            handle.on<AssistantContentEvent>("assistant.message_delta", (event) =>
                this.handleAssistantDelta(event),
            ),
        );
        this.disposables.push(
            handle.on<AssistantContentEvent>("assistant.streaming_delta", (event) =>
                this.handleAssistantDelta(event),
            ),
        );
        this.disposables.push(
            handle.on<AssistantContentEvent>("assistant.message", (event) =>
                this.handleAssistantFinal(event),
            ),
        );
        this.disposables.push(
            handle.on<{ type: string }>("session.idle", () => this.handleSessionIdle()),
        );
        this.disposables.push(
            handle.on<SessionErrorEvent>("session.error", (event) => {
                this.postOutbound("error", {
                    code: "session_error",
                    message: event?.data?.message ?? "Session error",
                    recoverable: false,
                });
            }),
        );

        this.postOutbound("session.state", {
            status: "idle",
            sessionId,
        });
    }

    private handleAssistantDelta(event: { data?: { deltaContent?: string; content?: string } }): void {
        if (!this.session || !this.currentTurnId) return;
        // assistant.message_delta uses `data.deltaContent`; some events
        // have `data.content`. We read whichever is present and skip if
        // there's none, so the panel ignores no-op events without crashing.
        const chunk = event?.data?.deltaContent ?? event?.data?.content ?? "";
        if (!chunk) return;
        this.postOutbound("assistant.delta", {
            chunk,
            sessionId: this.session.sessionId,
            turnId: this.currentTurnId,
        });
    }

    private handleAssistantFinal(event: { data?: { content?: string } }): void {
        if (!this.session || !this.currentTurnId) return;
        this.postOutbound("assistant.message.final", {
            text: event?.data?.content ?? "",
            sessionId: this.session.sessionId,
            turnId: this.currentTurnId,
        });
    }

    private handleSessionIdle(): void {
        if (!this.session) return;
        this.postOutbound("session.state", {
            status: "idle",
            sessionId: this.session.sessionId,
        });
        this.currentTurnId = undefined;
    }

    private sendBootstrap(): void {
        const payload: z.infer<typeof AgentBootstrapSchema> = {
            agentId: this.opts.agentId,
            workingDirectory: this.opts.workingDirectory,
            adapterKind: this.opts.adapterKind,
            bannerSubtitle: this.opts.bannerSubtitle,
            yoloEnabled: this.opts.getYolo(),
        };
        if (this.opts.adapterLogin !== undefined) {
            payload.adapterLogin = this.opts.adapterLogin;
        }
        this.postOutbound("agent.bootstrap", payload);
    }

    // -----------------------------------------------------------------------
    // Outbound (host → webview) wire helpers
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
        type: "permission.prompt",
        payload: z.infer<typeof PermissionPromptSchema>,
    ): void;
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
            agent_id: this.opts.agentId,
            type,
            payload: payload as Record<string, unknown>,
        };
        void this.panel.webview.postMessage(envelope);
    }

    // -----------------------------------------------------------------------
    // CSP-locked HTML template (CD-07 §4 — CSP MUST be set)
    // -----------------------------------------------------------------------

    private buildHtml(webview: vscode.Webview): string {
        const dist = vscode.Uri.joinPath(this.opts.extensionUri, "dist", "webview");
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, "assets", "index.js"));
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(dist, "assets", "index.css"));
        const cspSource = webview.cspSource;
        const nonce = this.mintNonce();

        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src ${cspSource} 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; img-src ${cspSource} https: data:; connect-src 'none';" />
    <title>Agent Arena · Primary Agent</title>
    <link rel="stylesheet" href="${cssUri}" />
  </head>
  <body class="m-0 h-screen overflow-hidden">
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
    }

    private mintNonce(): string {
        // Webview CSP nonce — must be present on every <script> tag.
        const bytes = new Uint8Array(16);
        const c = (globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
        if (c?.getRandomValues) {
            c.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
}
