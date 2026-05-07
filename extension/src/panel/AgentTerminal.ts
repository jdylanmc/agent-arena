/*---------------------------------------------------------------------------------------------
 *  src/panel/AgentTerminal.ts
 *
 *  Render-only `vscode.Terminal` for one Agent (per CD-11 §5 + §6,
 *  CD-13 reversal of CD-07). Replaces the previous WebviewPanel +
 *  xterm.js + React surface with a `vscode.Pseudoterminal`-backed
 *  `vscode.Terminal` in the native panel area.
 *
 *  Boundary discipline (unchanged from CD-11):
 *    - The AgentTerminal does NOT own the Agent's SDK session — the
 *      Agent does. Closing the terminal disposes only the
 *      WebviewPanel's successor (the Pseudoterminal + view
 *      subscriptions). The Agent's SDK session keeps streaming and the
 *      next reveal replays the in-flight transcript.
 *    - The AgentTerminal subscribes to Agent events on reveal and
 *      unsubscribes on close.
 *
 *  Tab name: the canonical Principle II identity, e.g.
 *  `copilot(developer)`, `copilot(deputy)`, `copilot(solid-snake)`.
 *  Matching the operating model the user already employs to drive the
 *  project (multiple `copilot` CLI instances as terminal tabs).
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { Agent, AgentSnapshot, AgentStatus, TurnEntry } from "../state/Agent.js";
import type { EventEmitter as CanonicalEventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import { mintCorrelationId } from "../shared/ids.js";
import {
    PseudoterminalIO,
    type IOBootstrap,
    type PseudoterminalIOHost,
    type ReplayTurn,
} from "./io/PseudoterminalIO.js";

export interface AgentTerminalOptions {
    agent: Agent;
    emitter: CanonicalEventEmitter;
}

/** Map an Agent's id to the canonical Principle II identity used as
 *  the terminal tab name. The host registers known agent ids today
 *  ("primary", "deputy", "solid-snake", ...); future agents follow
 *  the same shape. */
function canonicalIdentity(agentId: string): string {
    // The map is intentionally small — extension/src is the only place
    // that adds agent ids, and every agent ships with a canonical
    // identity. New agents get a row here.
    switch (agentId) {
        case "primary":
            return "copilot(developer)";
        case "deputy":
            return "copilot(deputy)";
        case "solid-snake":
            return "copilot(solid-snake)";
        default:
            return `copilot(${agentId})`;
    }
}

export class AgentTerminal implements vscode.Disposable {
    private terminal: vscode.Terminal | undefined;
    private readonly viewSubscriptions: vscode.Disposable[] = [];
    private readonly agent: Agent;
    private readonly emitter: CanonicalEventEmitter;
    private readonly disposeEmitter = new vscode.EventEmitter<void>();

    /** Pseudoterminal-side emitters. Wired into the
     *  `vscode.Pseudoterminal` returned by `buildPty()`. The host fires
     *  `writeEmitter` to write into the buffer; we wire it through the
     *  PseudoterminalIO callbacks. */
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    private readonly closeEmitter = new vscode.EventEmitter<number | void>();
    private readonly nameEmitter = new vscode.EventEmitter<string>();

    private io: PseudoterminalIO | undefined;

    /** Track the previous Agent status so the running→idle transition
     *  fires `io.onSessionIdle` exactly once per turn (not on every
     *  status snapshot). */
    private prevStatus: AgentStatus | null = null;

    /** Fires when the terminal is disposed (user closes tab OR explicit
     *  AgentTerminalManager teardown). The manager subscribes so it
     *  can drop the panel from its Map. The Agent does NOT subscribe —
     *  it survives. */
    readonly onDidDispose = this.disposeEmitter.event;

    constructor(opts: AgentTerminalOptions) {
        this.agent = opts.agent;
        this.emitter = opts.emitter;
    }

    /** Reveal an existing terminal or create a new one. Idempotent —
     *  multiple calls reveal the same instance (per CD-11 §2). */
    reveal(): void {
        if (this.terminal) {
            this.terminal.show(/* preserveFocus */ false);
            return;
        }

        const snapshot = this.agent.getSnapshot();
        const identity = canonicalIdentity(this.agent.id);

        const host: PseudoterminalIOHost = {
            write: (text) => this.writeEmitter.fire(text),
            setName: (name) => this.nameEmitter.fire(name),
            submitPrompt: (text, correlationId) => {
                void this.agent.submitPrompt(text, correlationId);
            },
            setYolo: (enabled) => {
                void this.agent.setYolo(enabled);
            },
            mintCorrelationId: () => mintCorrelationId(),
        };
        this.io = new PseudoterminalIO(host);

        const pty: vscode.Pseudoterminal = {
            onDidWrite: this.writeEmitter.event,
            onDidClose: this.closeEmitter.event,
            onDidChangeName: this.nameEmitter.event,
            open: (_initialDimensions) => {
                const bootstrap: IOBootstrap = {
                    canonicalIdentity: identity,
                    displayName: snapshot.displayName,
                    workingDirectory: snapshot.workingDirectory,
                    bannerSubtitle: snapshot.bannerSubtitle,
                    yoloEnabled: snapshot.yoloEnabled,
                };
                const replay = replayableTurns(snapshot.transcript);
                this.io?.open(bootstrap, replay);
            },
            close: () => {
                this.io?.close();
            },
            handleInput: (data) => {
                this.io?.handleInput(data);
            },
            setDimensions: (_dims) => {
                // Optional: if we ever care about column-aware rendering
                // (e.g., reflowing long agent output), forward to a
                // future `io.setDimensions(...)` hook. Today we ignore
                // it — VS Code wraps long lines for us.
            },
        };

        this.terminal = vscode.window.createTerminal({
            name: identity,
            pty,
            iconPath: new vscode.ThemeIcon("robot"),
            location: vscode.TerminalLocation.Panel,
            isTransient: false,
        });

        this.prevStatus = snapshot.status;

        // Subscribe to Agent events. The render side (this AgentTerminal)
        // sees the Agent through its event surface; we never reach into
        // the Agent's SDK session directly (CD-11 §5 boundary).
        this.viewSubscriptions.push(
            this.agent.onAssistantDelta(({ chunk }) => this.io?.onAssistantDelta(chunk)),
        );
        this.viewSubscriptions.push(
            this.agent.onAssistantFinal(({ text }) => this.io?.onAssistantFinal(text)),
        );
        this.viewSubscriptions.push(
            this.agent.onError(({ message }) => this.io?.onSessionError(message)),
        );
        this.viewSubscriptions.push(
            this.agent.onStatusChange((s) => this.handleStatus(s)),
        );

        // VS Code lifecycle — the user closing the tab triggers our
        // dispose.
        this.viewSubscriptions.push(
            vscode.window.onDidCloseTerminal((closed) => {
                if (closed === this.terminal) this.handleClose();
            }),
        );

        this.terminal.show(/* preserveFocus */ false);

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_WEBVIEW_OPENED,
            agent_id: this.agent.id,
            payload: {
                surface: "Pseudoterminal",
                tabName: identity,
            },
        });
    }

    /** Tear down the Pseudoterminal + view subscriptions. Per CD-11
     *  §6, this does NOT touch the Agent — its SDK session keeps
     *  running. */
    dispose(): void {
        for (const sub of this.viewSubscriptions) {
            try {
                sub.dispose();
            } catch {
                /* ignore */
            }
        }
        this.viewSubscriptions.length = 0;
        if (this.terminal) {
            const term = this.terminal;
            this.terminal = undefined;
            try {
                term.dispose();
            } catch {
                /* already disposed */
            }
        }
        this.io = undefined;
        this.disposeEmitter.fire();
        this.disposeEmitter.dispose();
        this.writeEmitter.dispose();
        this.closeEmitter.dispose();
        this.nameEmitter.dispose();
    }

    // -----------------------------------------------------------------------
    //  Internals
    // -----------------------------------------------------------------------

    /** Handle Agent status transitions. The running→idle transition is
     *  the canonical "turn done" signal and triggers OSC 633 ; D ; 0
     *  + a fresh prompt. Errors come through `onError` separately. */
    private handleStatus(snapshot: AgentSnapshot): void {
        const prev = this.prevStatus;
        this.prevStatus = snapshot.status;
        if (prev === "running" && snapshot.status === "idle") {
            this.io?.onSessionIdle();
        }
    }

    private handleClose(): void {
        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_WEBVIEW_CLOSED,
            agent_id: this.agent.id,
            payload: {
                surface: "Pseudoterminal",
                tabName: canonicalIdentity(this.agent.id),
            },
        });
        this.dispose();
    }
}

function replayableTurns(transcript: ReadonlyArray<TurnEntry>): ReadonlyArray<ReplayTurn> {
    return transcript.map((turn) => {
        const out: ReplayTurn = {
            turnId: turn.turnId,
            chunks: turn.chunks.slice(),
        };
        if (turn.final !== undefined) out.final = turn.final;
        return out;
    });
}
