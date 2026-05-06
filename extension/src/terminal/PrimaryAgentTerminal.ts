/*---------------------------------------------------------------------------------------------
 *  src/terminal/PrimaryAgentTerminal.ts
 *
 *  VS Code Pseudoterminal implementation for the Primary Agent (per CD-06).
 *
 *  Renders inside the integrated Terminal panel using xterm.js — gives us
 *  monospace fonts, ANSI colours, scrolling, copy/paste, find, link parsing,
 *  and font-size controls for free. We never built a bespoke terminal.
 *
 *  Lifecycle:
 *    open(dim)        — VS Code calls this when the terminal is created.
 *                        We print the banner + initial prompt.
 *    handleInput(s)   — keystrokes from the user. We echo, manage the input
 *                        buffer, and submit on Enter.
 *    close()          — VS Code calls this when the terminal is killed.
 *                        We disconnect the SDK session.
 *
 *  Slash commands:
 *    /help            — show this catalog
 *    /yolo on|off     — toggle the agent's yolo state
 *    /clear           — clear the screen + redraw the banner
 *
 *  Streaming:
 *    Assistant deltas are written byte-for-byte to the terminal. The user
 *    can keep typing during streaming (input buffer accumulates); pressing
 *    Enter during streaming submits via SDK mode: "enqueue" so the SDK
 *    processes them in order (FR-015).
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { SdkAdapter, SdkSessionHandle } from "../sdk/SdkAdapter.js";
import type { EventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import { mintCorrelationId, mintSessionId } from "../shared/ids.js";

const ANSI = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    magenta: "\x1b[35m",
    dim: "\x1b[2m",
    bold: "\x1b[1m",
    clearScreen: "\x1b[2J\x1b[H",
};

const CRLF = "\r\n";

export interface PrimaryAgentTerminalOptions {
    sdk: SdkAdapter;
    emitter: EventEmitter;
    agentId?: string;
    /** Provided by extension.ts so the terminal can read the current yolo
     *  state at open time and on each /yolo command. Returns the new state. */
    getYolo: () => boolean;
    setYolo: (next: boolean) => void;
    /** Optional subtitle shown after `· Primary Agent ·` in the banner.
     *  Used to advertise the active SDK adapter (e.g. "connected to GitHub
     *  Copilot as alice (user)" or "demo mode (not signed in)"). */
    bannerSubtitle?: string;
}

export class PrimaryAgentTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    readonly onDidWrite = this.writeEmitter.event;
    private readonly closeEmitter = new vscode.EventEmitter<void>();
    readonly onDidClose = this.closeEmitter.event;

    private readonly sdk: SdkAdapter;
    private readonly emitter: EventEmitter;
    private readonly agentId: string;
    private readonly getYolo: () => boolean;
    private readonly setYolo: (next: boolean) => void;
    private readonly bannerSubtitle: string;

    private inputBuffer = "";
    private session: SdkSessionHandle | undefined;
    private isStreaming = false;
    private hasReceivedFirstChunk = false;
    private currentTurnStartedAt = 0;

    constructor(opts: PrimaryAgentTerminalOptions) {
        this.sdk = opts.sdk;
        this.emitter = opts.emitter;
        this.agentId = opts.agentId ?? "primary";
        this.getYolo = opts.getYolo;
        this.setYolo = opts.setYolo;
        this.bannerSubtitle = opts.bannerSubtitle ?? "demo mode";
    }

    open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.writeBanner();
        this.writePrompt();
        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_WEBVIEW_OPENED, // re-used for terminal-open until a dedicated event lands
            agent_id: this.agentId,
            payload: { surface: "pseudoterminal" },
        });
    }

    close(): void {
        void this.session?.disconnect();
        this.session = undefined;
        this.closeEmitter.fire();
    }

    handleInput(data: string): void {
        for (const ch of data) {
            switch (ch) {
                case "\r": // Enter
                    this.write(CRLF);
                    void this.submit(this.inputBuffer);
                    this.inputBuffer = "";
                    break;
                case "\x7f": // Backspace (DEL)
                case "\b":
                    if (this.inputBuffer.length > 0) {
                        this.inputBuffer = this.inputBuffer.slice(0, -1);
                        this.write("\b \b");
                    }
                    break;
                case "\x03": // Ctrl+C
                    if (this.isStreaming) {
                        void this.session?.abortCurrentTurn();
                        this.write(`${CRLF}${ANSI.red}^C aborted${ANSI.reset}${CRLF}`);
                        this.isStreaming = false;
                        this.writePrompt();
                    } else {
                        this.write(`${ANSI.red}^C${ANSI.reset}${CRLF}`);
                        this.inputBuffer = "";
                        this.writePrompt();
                    }
                    break;
                case "\x0c": // Ctrl+L
                    this.write(ANSI.clearScreen);
                    this.writeBanner();
                    this.writePrompt();
                    if (this.inputBuffer.length > 0) this.write(this.inputBuffer);
                    break;
                default:
                    // Printable ASCII + Unicode passthrough.
                    if (ch >= " ") {
                        this.inputBuffer += ch;
                        this.write(ch);
                    }
            }
        }
    }

    private writeBanner(): void {
        const yoloLabel = this.getYolo() ? `${ANSI.red}YOLO ON${ANSI.reset}` : `${ANSI.green}yolo OFF${ANSI.reset}`;
        this.write(
            `${ANSI.bold}Agent Arena${ANSI.reset} ${ANSI.dim}· Primary Agent · ${this.bannerSubtitle} · ${ANSI.reset}${yoloLabel}${CRLF}` +
                `${ANSI.dim}Type a prompt and press Enter. /help for slash commands. Ctrl+C to abort, Ctrl+L to clear.${ANSI.reset}${CRLF}` +
                CRLF,
        );
    }

    private writePrompt(): void {
        this.write(`${ANSI.cyan}> ${ANSI.reset}`);
    }

    private write(text: string): void {
        this.writeEmitter.fire(text);
    }

    private async submit(rawPrompt: string): Promise<void> {
        const prompt = rawPrompt.trim();
        if (prompt.length === 0) {
            this.writePrompt();
            return;
        }

        // Slash commands handled locally — never sent to the agent.
        if (prompt.startsWith("/")) {
            this.handleSlashCommand(prompt);
            return;
        }

        try {
            await this.ensureSession();
        } catch (err: unknown) {
            this.write(
                `${ANSI.red}Failed to start session: ${err instanceof Error ? err.message : String(err)}${ANSI.reset}${CRLF}`,
            );
            this.writePrompt();
            return;
        }
        if (!this.session) {
            this.write(`${ANSI.red}No session available.${ANSI.reset}${CRLF}`);
            this.writePrompt();
            return;
        }

        if (!this.isStreaming) {
            this.isStreaming = true;
            this.hasReceivedFirstChunk = false;
            this.currentTurnStartedAt = Date.now();
        }

        await this.session.send({ prompt, mode: "enqueue" } as never);
    }

    private handleSlashCommand(input: string): void {
        const [cmd, ...rest] = input.slice(1).split(/\s+/);
        switch (cmd) {
            case "help":
                this.write(`${ANSI.dim}Slash commands:${ANSI.reset}${CRLF}`);
                this.write(`  ${ANSI.cyan}/help${ANSI.reset}        Show this help${CRLF}`);
                this.write(`  ${ANSI.cyan}/yolo on${ANSI.reset}     Bypass permission prompts${CRLF}`);
                this.write(`  ${ANSI.cyan}/yolo off${ANSI.reset}    Restore default permission prompting${CRLF}`);
                this.write(`  ${ANSI.cyan}/clear${ANSI.reset}       Clear the screen${CRLF}`);
                this.writePrompt();
                return;
            case "yolo": {
                const arg = rest[0]?.toLowerCase();
                if (arg !== "on" && arg !== "off") {
                    this.write(`${ANSI.red}Usage: /yolo on|off${ANSI.reset}${CRLF}`);
                    this.writePrompt();
                    return;
                }
                const next = arg === "on";
                this.setYolo(next);
                const label = next
                    ? `${ANSI.red}YOLO ON${ANSI.reset}`
                    : `${ANSI.green}yolo OFF${ANSI.reset}`;
                this.write(`Yolo state: ${label}${CRLF}`);
                this.writePrompt();
                return;
            }
            case "clear":
                this.write(ANSI.clearScreen);
                this.writeBanner();
                this.writePrompt();
                return;
            default:
                this.write(`${ANSI.red}Unknown command: /${cmd}${ANSI.reset}${CRLF}`);
                this.write(`${ANSI.dim}Try /help${ANSI.reset}${CRLF}`);
                this.writePrompt();
        }
    }

    private async ensureSession(): Promise<void> {
        if (this.session) return;

        const sessionId = mintSessionId(this.agentId);
        const correlationId = mintCorrelationId();
        this.session = await this.sdk.createSession({
            sessionId,
            onPermissionRequest: async (
                request: { toolName?: string; summary?: string },
            ): Promise<{ kind: "approved" | "denied"; reason?: string }> => {
                if (this.getYolo()) {
                    this.emitter.emitNew({
                        level: "info",
                        event: EVENT_NAMES.AA_PERMISSION_RESOLVED,
                        agent_id: this.agentId,
                        correlation_id: correlationId,
                        payload: { decision: "allow", source: "yolo", toolName: request?.toolName },
                    });
                    return { kind: "approved" };
                }
                this.emitter.emitNew({
                    level: "info",
                    event: EVENT_NAMES.AA_PERMISSION_PROMPTED,
                    agent_id: this.agentId,
                    correlation_id: correlationId,
                    payload: { toolName: request?.toolName, summary: request?.summary },
                });
                const choice = await vscode.window.showInformationMessage(
                    `Allow ${request?.toolName ?? "tool"}?\n\n${request?.summary ?? ""}`,
                    { modal: true },
                    "Allow",
                    "Deny",
                );
                const decision = choice === "Allow" ? "allow" : "deny";
                this.emitter.emitNew({
                    level: "info",
                    event: EVENT_NAMES.AA_PERMISSION_RESOLVED,
                    agent_id: this.agentId,
                    correlation_id: correlationId,
                    payload: { decision, source: "user-modal", toolName: request?.toolName },
                });
                return decision === "allow"
                    ? { kind: "approved" }
                    : { kind: "denied", reason: "User denied" };
            },
        } as never);

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.COPILOT_SESSION_CREATED,
            agent_id: this.agentId,
            correlation_id: correlationId,
            payload: { sessionId },
        });

        this.session.on("assistant.message_delta" as never, (event: unknown) => {
            const e = event as { chunk?: string; sessionId?: string; turnId?: string };
            if (typeof e.chunk !== "string") return;
            if (!this.hasReceivedFirstChunk) {
                this.hasReceivedFirstChunk = true;
            }
            this.write(e.chunk);
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.COPILOT_SESSION_ASSISTANT_MESSAGE_DELTA,
                agent_id: this.agentId,
                payload: { sessionId: e.sessionId ?? sessionId, chunkLen: e.chunk.length },
            });
        });

        this.session.on("session.idle" as never, (event: unknown) => {
            const e = event as { sessionId?: string };
            const elapsed = this.currentTurnStartedAt > 0
                ? `${Date.now() - this.currentTurnStartedAt}ms`
                : "";
            this.write(`${CRLF}${ANSI.dim}[idle${elapsed ? " · " + elapsed : ""}]${ANSI.reset}${CRLF}`);
            this.isStreaming = false;
            this.writePrompt();
            this.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.COPILOT_SESSION_IDLE,
                agent_id: this.agentId,
                payload: { sessionId: e.sessionId ?? sessionId },
            });
        });

        this.session.on("session.error" as never, (event: unknown) => {
            const e = event as { sessionId?: string; error?: string };
            this.write(`${CRLF}${ANSI.red}Error: ${e.error ?? "unknown"}${ANSI.reset}${CRLF}`);
            this.isStreaming = false;
            this.writePrompt();
            this.emitter.emitNew({
                level: "error",
                event: EVENT_NAMES.COPILOT_SESSION_ERROR,
                agent_id: this.agentId,
                payload: { sessionId: e.sessionId ?? sessionId, error: e.error },
            });
        });
    }
}
