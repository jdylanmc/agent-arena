/*---------------------------------------------------------------------------------------------
 *  src/webview/ViewProvider.ts
 *
 *  WebviewViewProvider for the Primary Agent terminal (FR-005, FR-006).
 *
 *  Responsibilities:
 *    - Configure the webview HTML (loads the Vite-built React bundle from dist/webview/).
 *    - Wire postMessage in both directions:
 *        host → webview: `view.postMessage(envelope)`
 *        webview → host: `view.webview.onDidReceiveMessage(raw)` → MessageRouter
 *    - On `prompt.submit`, mint a session if needed, send to the SDK adapter,
 *      and stream events back as `assistant.delta` / `assistant.message.final`
 *      / `session.state` envelopes.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { z } from "zod";
import type { EventEmitter } from "../telemetry/EventEmitter.js";
import type { SdkAdapter, SdkSessionHandle } from "../sdk/SdkAdapter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import { MessageRouter } from "./messageRouter.js";
import { mintCorrelationId, mintMessageId, mintSessionId } from "../shared/ids.js";
import type { MessageEnvelope } from "../protocol/envelope.js";
import type {
    AssistantDeltaSchema,
    AssistantMessageFinalSchema,
    ErrorMessageSchema,
    OutboundMessageType,
    SessionStateSchema,
} from "../protocol/types.js";

const PRIMARY_AGENT_ID = "primary";

export class PrimaryAgentViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "agentArenaPrimaryView";

    private view: vscode.WebviewView | undefined;
    private session: SdkSessionHandle | undefined;
    private currentTurnId: string | undefined;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly emitter: EventEmitter,
        private readonly sdk: SdkAdapter,
        private readonly agentId: string = PRIMARY_AGENT_ID,
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
        };
        webviewView.webview.html = this.buildHtml(webviewView.webview);

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_WEBVIEW_OPENED,
            agent_id: this.agentId,
            payload: {},
        });

        const router = this.makeRouter();
        webviewView.webview.onDidReceiveMessage((raw: unknown) => {
            void router.dispatch(raw);
        });

        webviewView.onDidDispose(() => {
            this.view = undefined;
            void this.session?.disconnect();
            this.session = undefined;
        });
    }

    private makeRouter(): MessageRouter {
        const router = new MessageRouter(this.emitter, `copilot(developer:${this.agentId})`);

        router.on("webview.ready", (_, envelope) => {
            // Send initial state: idle, no session yet.
            void this.postState({
                status: "idle",
                sessionId: this.session?.sessionId ?? "",
            }, envelope.correlation_id);
        });

        router.on("prompt.submit", async (payload, envelope) => {
            await this.ensureSession();
            if (!this.session) throw new Error("session unavailable");
            void this.postState({
                status: "running",
                sessionId: this.session.sessionId,
            }, envelope.correlation_id);
            this.currentTurnId = `turn-${Date.now()}`;
            await this.session.send({ prompt: payload.promptText, mode: "enqueue" } as never);
        });

        router.on("yolo.set", (payload, envelope) => {
            // Yolo state wiring lands in T042-T043. For now emit the event so
            // the canonical log captures the intent.
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_YOLO_TOGGLED,
                agent_id: this.agentId,
                correlation_id: envelope.correlation_id,
                payload: { agentId: payload.agentId, enabled: payload.enabled },
            });
        });

        router.on("permission.respond", (_, envelope) => {
            // Permission policy plumbing lands in T036-T041.
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_PERMISSION_RESOLVED,
                agent_id: this.agentId,
                correlation_id: envelope.correlation_id,
                payload: {},
            });
        });

        return router;
    }

    private async ensureSession(): Promise<void> {
        if (this.session) return;
        const sessionId = mintSessionId(this.agentId);
        // We pass a no-op permission handler here for the demo; real wiring
        // lands in T036-T041 (PermissionPolicy + handler shim).
        this.session = await this.sdk.createSession({
            sessionId,
            onPermissionRequest: async () =>
                ({ kind: "approved" }) as never,
        } as never);
        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.COPILOT_SESSION_CREATED,
            agent_id: this.agentId,
            payload: { sessionId },
        });

        // Subscribe to streaming + final + idle events.
        const onDelta = (event: { sessionId: string; turnId: string; chunk: string }) => {
            void this.postDelta({
                chunk: event.chunk,
                sessionId: event.sessionId,
                turnId: event.turnId,
            });
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.COPILOT_SESSION_ASSISTANT_MESSAGE_DELTA,
                agent_id: this.agentId,
                payload: { sessionId: event.sessionId, turnId: event.turnId, chunkLen: event.chunk.length },
            });
        };
        const onFinal = (event: { sessionId: string; turnId: string; text: string }) => {
            void this.postFinal({
                text: event.text,
                sessionId: event.sessionId,
                turnId: event.turnId,
            });
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.COPILOT_SESSION_ASSISTANT_MESSAGE,
                agent_id: this.agentId,
                payload: { sessionId: event.sessionId, turnId: event.turnId },
            });
        };
        const onIdle = (event: { sessionId: string }) => {
            void this.postState({ status: "idle", sessionId: event.sessionId });
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.COPILOT_SESSION_IDLE,
                agent_id: this.agentId,
                payload: { sessionId: event.sessionId },
            });
        };
        const onError = (event: { sessionId: string; error: string }) => {
            void this.postError({
                code: "session.runtime",
                message: event.error,
                recoverable: true,
            });
            void this.postState({ status: "error", sessionId: event.sessionId });
            this.emitter.emitNew({
                level: "error",
                event: EVENT_NAMES.COPILOT_SESSION_ERROR,
                agent_id: this.agentId,
                payload: { sessionId: event.sessionId, error: event.error },
            });
        };

        // The fake adapter's `on` is loosely typed; the production adapter
        // will be more strict. Cast through `as never` to satisfy both.
        this.session.on("assistant.message_delta" as never, onDelta as never);
        this.session.on("assistant.message" as never, onFinal as never);
        this.session.on("session.idle" as never, onIdle as never);
        this.session.on("session.error" as never, onError as never);
    }

    private postOutbound<T extends OutboundMessageType>(
        type: T,
        payload: Record<string, unknown>,
        correlationId?: string,
    ): void {
        if (!this.view) return;
        const envelope: MessageEnvelope = {
            protocol_version: 1,
            message_id: mintMessageId(),
            correlation_id: correlationId ?? mintCorrelationId(),
            session_id: this.session?.sessionId,
            agent_id: this.agentId,
            type,
            payload,
        };
        void this.view.webview.postMessage(envelope);
    }

    private postState(
        payload: z.infer<typeof SessionStateSchema>,
        correlationId?: string,
    ): void {
        this.postOutbound("session.state", payload as Record<string, unknown>, correlationId);
    }

    private postDelta(payload: z.infer<typeof AssistantDeltaSchema>): void {
        this.postOutbound("assistant.delta", payload as Record<string, unknown>);
    }

    private postFinal(payload: z.infer<typeof AssistantMessageFinalSchema>): void {
        this.postOutbound("assistant.message.final", payload as Record<string, unknown>);
    }

    private postError(payload: z.infer<typeof ErrorMessageSchema>): void {
        this.postOutbound("error", payload as Record<string, unknown>);
    }

    private buildHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const cspSource = webview.cspSource;
        const baseUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
        );
        // The Vite build emits index.html with relative paths into assets/.
        // We reconstruct the same scaffold here, pointing at the cspSource.
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Arena · Primary Agent</title>
  <link rel="stylesheet" href="${baseUri}/assets/index.css" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${baseUri}/assets/index.js"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
