/*---------------------------------------------------------------------------------------------
 *  src/state/Agent.ts
 *
 *  Persistent runtime object owning ONE agent's state (per CD-11). The
 *  Agent survives panel close/reopen — closing the panel does not
 *  disconnect the SDK session and does not abort an in-flight turn. The
 *  Agent keeps streaming, accumulates a transcript buffer, and the next
 *  panel reveal replays the buffer so the user picks up mid-stream.
 *
 *  Boundary discipline (per CD-10 §3 + the interface-first SOLID seam):
 *    - Agent owns the SDK session lifecycle, NOT the panel.
 *    - Agent subscribes to SDK session events; panel subscribes to
 *      Agent events. The panel is a render surface.
 *    - Permission decisions go through the injected PolicyResolver
 *      (FR-019) — Agent doesn't know whether the active policy is Yolo
 *      or PromptUser. Future per-tool policies plug in here.
 *
 *  This is the keel for multi-agent / background-agent / swarm work in
 *  follow-up specs. Today there's exactly one Agent ("primary"); the
 *  shape is identical when N agents land.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { SdkAdapter, SdkSessionHandle } from "../sdk/SdkAdapter.js";
import type { EventEmitter as CanonicalEventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import { mintCorrelationId, mintMessageId, mintSessionId } from "../shared/ids.js";
import type { PolicyResolver } from "../permission/PermissionPolicy.js";
import type { YoloStore } from "./yolo.js";

export type AgentStatus = "connecting" | "idle" | "running" | "error";

/** Per-turn transcript entry. Chunks are streaming `assistant.message_delta`
 *  events; `final` is the assembled `assistant.message` when the turn
 *  completes. `aborted` flags turns the user cancelled mid-stream. */
export interface TurnEntry {
    turnId: string;
    chunks: string[];
    final?: string;
    aborted?: boolean;
}

/** Snapshot consumed by the TreeView + bootstrap envelope. Pure value
 *  shape — no event handles, no SDK refs. Safe to serialize across the
 *  webview boundary. */
export interface AgentSnapshot {
    id: string;
    displayName: string;
    status: AgentStatus;
    activityLabel: string;
    workingDirectory: string;
    bannerSubtitle: string;
    adapterKind: "copilot" | "fake-demo";
    adapterLogin?: string;
    yoloEnabled: boolean;
    transcript: ReadonlyArray<TurnEntry>;
    currentTurnId?: string;
}

export interface AgentOptions {
    id: string;
    displayName: string;
    sdk: SdkAdapter;
    workingDirectory: string;
    bannerSubtitle: string;
    adapterKind: "copilot" | "fake-demo";
    adapterLogin?: string;
    yoloStore: YoloStore;
    policyResolver: PolicyResolver;
    emitter: CanonicalEventEmitter;
}

export class Agent implements vscode.Disposable {
    readonly id: string;
    readonly displayName: string;

    private readonly sdk: SdkAdapter;
    private readonly emitter: CanonicalEventEmitter;
    private readonly yoloStore: YoloStore;
    private readonly policyResolver: PolicyResolver;
    private readonly workingDirectory: string;
    private readonly bannerSubtitle: string;
    private readonly adapterKind: "copilot" | "fake-demo";
    private readonly adapterLogin?: string;

    private status: AgentStatus = "idle";
    private session: SdkSessionHandle | undefined;
    private currentTurnId: string | undefined;
    private readonly transcript: TurnEntry[] = [];
    private readonly sdkSubscriptions: vscode.Disposable[] = [];
    private readonly yoloSubscription: vscode.Disposable;

    private readonly statusEmitter = new vscode.EventEmitter<AgentSnapshot>();
    private readonly deltaEmitter = new vscode.EventEmitter<{ turnId: string; chunk: string }>();
    private readonly finalEmitter = new vscode.EventEmitter<{ turnId: string; text: string }>();
    private readonly errorEmitter = new vscode.EventEmitter<{ message: string }>();

    /** Fires whenever the agent's snapshot would change (status, yolo,
     *  in-flight turn). The TreeView subscribes to refresh row state.
     *  Panels also subscribe to mirror status badges. */
    readonly onStatusChange = this.statusEmitter.event;

    /** Fires for each `assistant.message_delta` chunk routed from the SDK.
     *  Panels write this directly into xterm. */
    readonly onAssistantDelta = this.deltaEmitter.event;

    /** Fires when an `assistant.message` arrives — the assembled final
     *  text for the current turn. */
    readonly onAssistantFinal = this.finalEmitter.event;

    /** Fires on session-error events. */
    readonly onError = this.errorEmitter.event;

    constructor(opts: AgentOptions) {
        this.id = opts.id;
        this.displayName = opts.displayName;
        this.sdk = opts.sdk;
        this.emitter = opts.emitter;
        this.yoloStore = opts.yoloStore;
        this.policyResolver = opts.policyResolver;
        this.workingDirectory = opts.workingDirectory;
        this.bannerSubtitle = opts.bannerSubtitle;
        this.adapterKind = opts.adapterKind;
        if (opts.adapterLogin !== undefined) this.adapterLogin = opts.adapterLogin;

        // Yolo state is owned by YoloStore; the Agent subscribes so
        // mutations from any surface (status-bar click, slash command,
        // future settings UI) propagate into the snapshot stream — the
        // TreeView and panel banner refresh automatically.
        this.yoloSubscription = this.yoloStore.onDidChange((event) => {
            if (event.agentId !== this.id) return;
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_YOLO_TOGGLED,
                agent_id: this.id,
                payload: { agentId: this.id, enabled: event.enabled, source: "agent" },
            });
            this.fireSnapshot();
        });
    }

    /** Capture the current state as a value snapshot (CD-11 §4 + §6).
     *  Consumed by the TreeView and the `agent.bootstrap` envelope. */
    getSnapshot(): AgentSnapshot {
        const snapshot: AgentSnapshot = {
            id: this.id,
            displayName: this.displayName,
            status: this.status,
            activityLabel: this.computeActivityLabel(),
            workingDirectory: this.workingDirectory,
            bannerSubtitle: this.bannerSubtitle,
            adapterKind: this.adapterKind,
            yoloEnabled: this.yoloStore.get(this.id),
            transcript: this.transcript.slice(),
        };
        if (this.adapterLogin !== undefined) snapshot.adapterLogin = this.adapterLogin;
        if (this.currentTurnId !== undefined) snapshot.currentTurnId = this.currentTurnId;
        return snapshot;
    }

    /** Submit a new prompt. Lazy-creates the SDK session on first call.
     *  Wires SDK event subscriptions on session creation; subsequent
     *  prompts reuse the same session + subscriptions. */
    async submitPrompt(prompt: string): Promise<void> {
        const trimmed = prompt.trim();
        if (trimmed.length === 0) return;

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_AGENT_PROMPT_SUBMITTED,
            agent_id: this.id,
            payload: { promptPreview: trimmed.slice(0, 100), promptLength: trimmed.length },
        });

        try {
            await this.ensureSession();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.emitter.emitNew({
                level: "error",
                event: EVENT_NAMES.AA_AGENT_SESSION_ENSURE_FAILED,
                agent_id: this.id,
                payload: { error: message },
            });
            this.transitionStatus("error");
            this.errorEmitter.fire({ message });
            return;
        }
        if (!this.session) return;

        const turnId = mintMessageId();
        this.currentTurnId = turnId;
        this.transcript.push({ turnId, chunks: [] });
        this.transitionStatus("running");

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_AGENT_SEND_STARTED,
            agent_id: this.id,
            payload: { turnId },
        });
        try {
            await this.session.send({ prompt: trimmed, mode: "enqueue" } as never);
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_AGENT_SEND_RETURNED,
                agent_id: this.id,
                payload: { turnId },
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.emitter.emitNew({
                level: "error",
                event: EVENT_NAMES.AA_AGENT_SEND_FAILED,
                agent_id: this.id,
                payload: { turnId, error: message },
            });
            this.transitionStatus("error");
            this.errorEmitter.fire({ message });
        }
    }

    /** Toggle yolo state. Persists via YoloStore (CD-05); the active
     *  PermissionPolicy resolver re-reads on next tool invocation
     *  (FR-018). */
    async setYolo(enabled: boolean): Promise<void> {
        await this.yoloStore.set(this.id, enabled);
        // The store fires onDidChange which our constructor subscribed
        // to (see ctor); we don't fire a snapshot directly here, the
        // store-event listener does.
    }

    /** Public: get current yolo state (for the panel's banner). */
    getYolo(): boolean {
        return this.yoloStore.get(this.id);
    }

    async dispose(): Promise<void> {
        // Only called on extension deactivate (per CD-11 §7). Tears down
        // the SDK session + all event emitters.
        try {
            this.yoloSubscription.dispose();
        } catch {
            /* ignore */
        }
        for (const sub of this.sdkSubscriptions) {
            try {
                sub.dispose();
            } catch {
                /* ignore */
            }
        }
        this.sdkSubscriptions.length = 0;
        if (this.session) {
            try {
                await this.session.disconnect();
            } catch {
                /* ignore */
            }
            this.session = undefined;
        }
        this.statusEmitter.dispose();
        this.deltaEmitter.dispose();
        this.finalEmitter.dispose();
        this.errorEmitter.dispose();
    }

    // -----------------------------------------------------------------------
    //  Internals
    // -----------------------------------------------------------------------

    private async ensureSession(): Promise<void> {
        if (this.session) return;

        this.transitionStatus("connecting");

        const sessionId = mintSessionId(this.id);
        const correlationId = mintCorrelationId();
        const policyResolver = this.policyResolver;

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_AGENT_SESSION_ENSURE_STARTED,
            agent_id: this.id,
            payload: { sessionId },
        });

        const handle = await this.sdk.createSession({
            sessionId,
            workingDirectory: this.workingDirectory,
            // FR-019 / R-06 — resolved per-invocation so a yolo toggle
            // takes effect on the next tool call without restarting the
            // session.
            onPermissionRequest: async (
                request: { toolName?: string; summary?: string } & Record<string, unknown>,
            ): Promise<{ kind: "approved" | "denied"; reason?: string }> => {
                const policy = policyResolver.forAgent(this.id);
                const decision = await policy.decide({
                    agentId: this.id,
                    sessionId,
                    correlationId,
                    request: request as never,
                    invocation: { toolName: request?.toolName ?? "" } as never,
                });
                if (decision.kind === "allow") {
                    return decision.reason !== undefined
                        ? { kind: "approved", reason: decision.reason }
                        : { kind: "approved" };
                }
                if (decision.kind === "deny") {
                    return { kind: "denied", reason: decision.reason };
                }
                return { kind: "denied", reason: "policy_returned_ask" };
            },
        } as never);
        this.session = handle;

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_AGENT_SESSION_CREATED,
            agent_id: this.id,
            payload: { sessionId },
        });

        // SDK event wiring. Both CopilotSdkAdapter (real) and FakeSdkAdapter
        // emit the SDK shape: `{ type, data: { deltaContent | content | ... } }`.
        type SdkEventBase = { type: string; data?: Record<string, unknown> };
        type AssistantContentEvent = {
            type: string;
            data?: { deltaContent?: string; content?: string };
        };
        type SessionErrorEvent = {
            type: string;
            data?: { errorType?: string; message?: string };
        };

        // Diagnostic: log every SDK event flowing through. Helps trace
        // where a stalled turn is — if no AA_AGENT_SDK_EVENT entries
        // appear after AA_AGENT_SEND_RETURNED, the SDK isn't streaming.
        const logSdkEvent = (event: SdkEventBase): void => {
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_AGENT_SDK_EVENT,
                agent_id: this.id,
                payload: { sdkEventType: event?.type ?? "<unknown>" },
            });
        };

        this.sdkSubscriptions.push(
            handle.on<AssistantContentEvent>("assistant.message_delta", (event) => {
                logSdkEvent(event);
                this.handleAssistantDelta(event);
            }),
        );
        this.sdkSubscriptions.push(
            handle.on<AssistantContentEvent>("assistant.streaming_delta", (event) => {
                logSdkEvent(event);
                this.handleAssistantDelta(event);
            }),
        );
        this.sdkSubscriptions.push(
            handle.on<AssistantContentEvent>("assistant.message", (event) => {
                logSdkEvent(event);
                this.handleAssistantFinal(event);
            }),
        );
        this.sdkSubscriptions.push(
            handle.on<SdkEventBase>("session.idle", (event) => {
                logSdkEvent(event);
                this.handleSessionIdle();
            }),
        );
        this.sdkSubscriptions.push(
            handle.on<SessionErrorEvent>("session.error", (event) => {
                logSdkEvent(event);
                this.handleSessionError(event);
            }),
        );

        this.transitionStatus("idle");
    }

    private handleAssistantDelta(event: {
        data?: { deltaContent?: string; content?: string };
    }): void {
        if (!this.currentTurnId) return;
        const chunk = event?.data?.deltaContent ?? event?.data?.content ?? "";
        if (!chunk) return;
        const turn = this.transcript[this.transcript.length - 1];
        if (turn?.turnId === this.currentTurnId) {
            turn.chunks.push(chunk);
        }
        this.deltaEmitter.fire({ turnId: this.currentTurnId, chunk });
    }

    private handleAssistantFinal(event: { data?: { content?: string } }): void {
        if (!this.currentTurnId) return;
        const text = event?.data?.content ?? "";
        const turn = this.transcript[this.transcript.length - 1];
        if (turn?.turnId === this.currentTurnId) {
            turn.final = text;
        }
        this.finalEmitter.fire({ turnId: this.currentTurnId, text });
    }

    private handleSessionIdle(): void {
        this.currentTurnId = undefined;
        this.transitionStatus("idle");
    }

    private handleSessionError(event: { data?: { message?: string } }): void {
        const message = event?.data?.message ?? "Session error";
        this.transitionStatus("error");
        this.errorEmitter.fire({ message });
    }

    private transitionStatus(next: AgentStatus): void {
        if (this.status === next) return;
        this.status = next;
        this.fireSnapshot();
    }

    private fireSnapshot(): void {
        this.statusEmitter.fire(this.getSnapshot());
    }

    private computeActivityLabel(): string {
        switch (this.status) {
            case "running":
                return "Streaming response…";
            case "connecting":
                return "Connecting";
            case "error":
                return "Error";
            case "idle":
            default:
                return "Idle";
        }
    }
}
