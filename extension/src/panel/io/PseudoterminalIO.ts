/*---------------------------------------------------------------------------------------------
 *  src/panel/io/PseudoterminalIO.ts
 *
 *  Pure-logic input/output handler for the agent's `vscode.Pseudoterminal`.
 *  Replaces the webview-side `TerminalController` from the CD-07 path —
 *  same UX (input buffer, ↑/↓ history, slash commands, ANSI-escaped
 *  prompt + banner) but drives a real VS Code terminal via callbacks
 *  instead of a webview-rendered xterm.js.
 *
 *  No `vscode` import — the host wraps this in a real `Pseudoterminal`
 *  (see `AgentTerminal.ts`) and forwards `handleInput` from the
 *  terminal's keystroke stream and writes the buffer's `write()` calls
 *  to the terminal's `writeEmitter.fire(...)`. Tests substitute a
 *  `FakeIOHost`.
 *
 *  Emits VS Code shell-integration sequences (OSC 633) at the right
 *  points so the terminal lights up command decorations, navigation,
 *  sticky scroll, and quick fixes — see `oscSequences.ts`.
 *--------------------------------------------------------------------------------------------*/

import * as osc from "./oscSequences.js";

/** Callbacks the host wires into the IO layer. */
export interface PseudoterminalIOHost {
    /** Write text into the terminal buffer. ANSI passes through; the
     *  host typically forwards to `vscode.EventEmitter<string>.fire`. */
    write(text: string): void;
    /** Update the terminal tab's name. The host typically forwards to
     *  `vscode.EventEmitter<string>.fire` via `onDidChangeName`. */
    setName(name: string): void;
    /** Submit a user prompt to the agent. `correlationId` is the CD-04
     *  audit id minted at the head of this turn; the agent forwards it
     *  through every downstream EI-1 emit. */
    submitPrompt(text: string, correlationId: string): void;
    /** Toggle yolo state — driven by the `/yolo on|off` slash command. */
    setYolo(enabled: boolean): void;
    /** Mint a new correlation id for the start of a turn. Decoupled
     *  from `vscode` / `node:crypto` for testability. */
    mintCorrelationId(): string;
}

/** Bootstrap state used to render the banner + the prompt prefix. */
export interface IOBootstrap {
    /** Per-agent canonical identity used as the terminal tab name —
     *  e.g. `copilot(developer)`, `copilot(deputy)`. */
    canonicalIdentity: string;
    /** Friendly name shown in the banner (e.g. `Main Developer`). */
    displayName: string;
    /** Working directory shown in the prompt prefix and in `OSC 633 ; P ; Cwd`. */
    workingDirectory: string;
    /** "connected to GitHub Copilot as user (gh-cli)" / "demo mode (...)" / etc. */
    bannerSubtitle: string;
    /** Initial yolo state. The IO layer keeps a local mirror so the
     *  banner / prompt redraw without a round-trip to the store. */
    yoloEnabled: boolean;
}

/** A single prior turn the bootstrap may want to replay (CD-11 §6).
 *  When a user closes and re-opens an agent's terminal, the agent's
 *  in-memory transcript is replayed into the new terminal so the user
 *  picks up where they left off. */
export interface ReplayTurn {
    turnId: string;
    chunks: string[];
    final?: string | undefined;
}

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

export class PseudoterminalIO {
    private bootstrap: IOBootstrap | null = null;
    private inputBuffer = "";
    private isStreaming = false;
    private opened = false;

    /** ↑/↓ shell-style history. Strings entered are pushed on Enter.
     *  `historyIndex === history.length` means "current input, not
     *  recalled". */
    private readonly history: string[] = [];
    private historyIndex = 0;

    /** ANSI/CSI escape-state machine for parsing arrow keys etc. out
     *  of the raw input stream. */
    private escState: "none" | "esc" | "csi" = "none";
    private csiBuffer = "";

    constructor(private readonly host: PseudoterminalIOHost) {}

    // -----------------------------------------------------------------------
    //  Lifecycle hooks (called by the host's Pseudoterminal wrapper)
    // -----------------------------------------------------------------------

    /** Called from the Pseudoterminal's `open()`. Captures the
     *  bootstrap state, paints the banner + the first prompt, and
     *  emits the `OSC 633 ; P ; HasRichCommandDetection=True` +
     *  `Cwd=...` properties. Idempotent — calling twice is a no-op
     *  (the host calls `open()` exactly once anyway). */
    open(bootstrap: IOBootstrap, replay: ReadonlyArray<ReplayTurn> = []): void {
        if (this.opened) return;
        this.opened = true;
        this.bootstrap = bootstrap;
        this.host.setName(bootstrap.canonicalIdentity);
        // Initial property hints — emit these before any output so VS
        // Code's shell-integration parser picks them up at the head of
        // the buffer.
        this.host.write(osc.richCommandDetection());
        this.host.write(osc.setCwd(bootstrap.workingDirectory));
        this.writeBanner();
        if (replay.length > 0) {
            this.replayTranscript(replay);
        } else {
            this.writePrompt();
        }
    }

    /** Called from the Pseudoterminal's `close()`. The host disposes
     *  emitters externally; we clear our internal state. */
    close(): void {
        this.bootstrap = null;
        this.inputBuffer = "";
        this.history.length = 0;
        this.historyIndex = 0;
        this.escState = "none";
        this.csiBuffer = "";
        this.isStreaming = false;
        this.opened = false;
    }

    // -----------------------------------------------------------------------
    //  Agent → terminal output (driven by AgentTerminal subscribing to
    //  Agent events and forwarding here).
    // -----------------------------------------------------------------------

    /** Stream an `assistant.message_delta` chunk into the buffer.
     *  Sets the streaming flag so a trailing `assistant.message`
     *  doesn't double-render. */
    onAssistantDelta(chunk: string): void {
        if (chunk.length === 0) return;
        this.isStreaming = true;
        this.host.write(chunk);
    }

    /** Final-message marker. When deltas streamed first, the text was
     *  already drawn — we just emit a CRLF so the next prompt starts
     *  on a fresh line. When streaming was disabled (or no deltas
     *  arrived), the SDK skips deltas and emits a single
     *  `assistant.message` with the full content; in that case we
     *  render `text` here so the user sees something. */
    onAssistantFinal(text?: string): void {
        if (this.isStreaming) {
            this.host.write(CRLF);
            return;
        }
        if (text !== undefined && text.length > 0) {
            this.host.write(`${text}${CRLF}`);
        }
    }

    /** Session went idle (turn complete, no error). Emits `OSC 633 ; D ; 0`
     *  and redraws the prompt for the next turn. */
    onSessionIdle(): void {
        this.host.write(osc.done(0));
        this.isStreaming = false;
        this.writePrompt();
    }

    /** Session error. Emits `OSC 633 ; D ; 1` (failure decoration), the
     *  error message in red, and a fresh prompt. */
    onSessionError(message: string): void {
        this.host.write(osc.done(1));
        this.isStreaming = false;
        this.host.write(`${CRLF}${ANSI.red}error: ${message}${ANSI.reset}${CRLF}`);
        this.writePrompt();
    }

    /** External yolo toggle (e.g., status-bar item). Updates the local
     *  mirror so the next prompt redraw shows the right banner state. */
    onYoloChange(enabled: boolean): void {
        if (this.bootstrap === null) return;
        this.bootstrap = { ...this.bootstrap, yoloEnabled: enabled };
    }

    // -----------------------------------------------------------------------
    //  Keystroke handler (called from Pseudoterminal.handleInput)
    // -----------------------------------------------------------------------

    handleInput(data: string): void {
        for (const ch of data) {
            // ----- ANSI/CSI sequence parsing ------------------------------
            if (this.escState === "csi") {
                const code = ch.charCodeAt(0);
                if (code >= 0x40 && code <= 0x7e) {
                    this.handleCsiFinal(this.csiBuffer, ch);
                    this.csiBuffer = "";
                    this.escState = "none";
                } else {
                    this.csiBuffer += ch;
                    if (this.csiBuffer.length > 16) {
                        // Bail on excessively long CSI parameters; treat
                        // as garbage input.
                        this.csiBuffer = "";
                        this.escState = "none";
                    }
                }
                continue;
            }
            if (this.escState === "esc") {
                this.escState = ch === "[" ? "csi" : "none";
                continue;
            }
            if (ch === "\x1b") {
                this.escState = "esc";
                continue;
            }
            // ----- Regular keystrokes -------------------------------------
            switch (ch) {
                case "\r": // Enter
                case "\n":
                    this.host.write(CRLF);
                    if (this.inputBuffer.trim().length > 0) {
                        this.history.push(this.inputBuffer);
                    }
                    this.historyIndex = this.history.length;
                    this.submitOrSlash(this.inputBuffer);
                    this.inputBuffer = "";
                    break;
                case "\x7f": // DEL
                case "\b": // BS
                    if (this.inputBuffer.length > 0) {
                        this.inputBuffer = this.inputBuffer.slice(0, -1);
                        this.host.write("\b \b");
                    }
                    break;
                case "\x03": // Ctrl+C
                    if (this.isStreaming) {
                        this.host.write(`${CRLF}${ANSI.red}^C${ANSI.reset}${CRLF}`);
                        this.isStreaming = false;
                    } else {
                        this.host.write(`${ANSI.red}^C${ANSI.reset}${CRLF}`);
                    }
                    this.inputBuffer = "";
                    this.writePrompt();
                    break;
                case "\x0c": // Ctrl+L
                    this.host.write(ANSI.clearScreen);
                    this.writeBanner();
                    this.writePrompt();
                    if (this.inputBuffer.length > 0) this.host.write(this.inputBuffer);
                    break;
                default:
                    if (ch >= " ") {
                        this.inputBuffer += ch;
                        this.host.write(ch);
                    }
            }
        }
    }

    // -----------------------------------------------------------------------
    //  Transcript replay (CD-11 §6)
    // -----------------------------------------------------------------------

    private replayTranscript(turns: ReadonlyArray<ReplayTurn>): void {
        for (const turn of turns) {
            if (turn.final !== undefined && turn.final.length > 0) {
                this.host.write(turn.final);
            } else {
                for (const chunk of turn.chunks) {
                    this.host.write(chunk);
                }
            }
            this.host.write(CRLF);
        }
        this.isStreaming = false;
        this.writePrompt();
    }

    // -----------------------------------------------------------------------
    //  CSI handling (arrow keys → history)
    // -----------------------------------------------------------------------

    private handleCsiFinal(_params: string, final: string): void {
        switch (final) {
            case "A":
                this.recallHistory(-1);
                return;
            case "B":
                this.recallHistory(1);
                return;
            default:
                return;
        }
    }

    private recallHistory(delta: -1 | 1): void {
        if (this.history.length === 0) return;
        const next = this.historyIndex + delta;
        if (next < 0 || next > this.history.length) return;
        this.historyIndex = next;
        const recalled =
            this.historyIndex >= this.history.length
                ? ""
                : (this.history[this.historyIndex] ?? "");
        this.replaceCurrentLine(recalled);
    }

    private replaceCurrentLine(content: string): void {
        this.host.write("\r\x1b[2K");
        this.writePrompt();
        this.host.write(content);
        this.inputBuffer = content;
    }

    // -----------------------------------------------------------------------
    //  Submit / slash dispatch
    // -----------------------------------------------------------------------

    private submitOrSlash(raw: string): void {
        const text = raw.trim();
        if (text.length === 0) {
            this.writePrompt();
            return;
        }
        if (text.startsWith("/")) {
            this.handleSlashCommand(text);
            return;
        }
        // Real prompt → emit OSC 633 ; E (with nonce) + ; C, then submit.
        const nonce = this.host.mintCorrelationId();
        this.host.write(osc.commandLine(text, nonce));
        this.host.write(osc.preExecution());
        this.host.submitPrompt(text, nonce);
    }

    private handleSlashCommand(input: string): void {
        const [cmd, ...rest] = input.slice(1).split(/\s+/);
        switch (cmd) {
            case "help":
                this.host.write(`${ANSI.dim}Slash commands:${ANSI.reset}${CRLF}`);
                this.host.write(`  ${ANSI.cyan}/help${ANSI.reset}        Show this help${CRLF}`);
                this.host.write(`  ${ANSI.cyan}/yolo on${ANSI.reset}     Bypass permission prompts${CRLF}`);
                this.host.write(`  ${ANSI.cyan}/yolo off${ANSI.reset}    Restore default permission prompting${CRLF}`);
                this.host.write(`  ${ANSI.cyan}/clear${ANSI.reset}       Clear the screen${CRLF}`);
                this.writePrompt();
                return;
            case "yolo": {
                const arg = rest[0]?.toLowerCase();
                if (arg !== "on" && arg !== "off") {
                    this.host.write(`${ANSI.red}Usage: /yolo on|off${ANSI.reset}${CRLF}`);
                    this.writePrompt();
                    return;
                }
                const next = arg === "on";
                this.host.setYolo(next);
                if (this.bootstrap !== null) {
                    this.bootstrap = { ...this.bootstrap, yoloEnabled: next };
                }
                const label = next
                    ? `${ANSI.red}YOLO ON${ANSI.reset}`
                    : `${ANSI.green}yolo OFF${ANSI.reset}`;
                this.host.write(`Yolo state: ${label}${CRLF}`);
                this.writePrompt();
                return;
            }
            case "clear":
                this.host.write(ANSI.clearScreen);
                this.writeBanner();
                this.writePrompt();
                return;
            default:
                this.host.write(`${ANSI.red}Unknown command: /${cmd}${ANSI.reset}${CRLF}`);
                this.host.write(`${ANSI.dim}Try /help${ANSI.reset}${CRLF}`);
                this.writePrompt();
        }
    }

    // -----------------------------------------------------------------------
    //  Banner + prompt rendering
    // -----------------------------------------------------------------------

    private writeBanner(): void {
        if (this.bootstrap === null) return;
        const yoloLabel = this.bootstrap.yoloEnabled
            ? `${ANSI.red}YOLO ON${ANSI.reset}`
            : `${ANSI.green}yolo OFF${ANSI.reset}`;
        this.host.write(
            `${ANSI.bold}Agent Arena${ANSI.reset} ${ANSI.dim}· ${this.bootstrap.displayName} · ${this.bootstrap.bannerSubtitle} · ${ANSI.reset}${yoloLabel}${CRLF}` +
                `${ANSI.dim}cwd:${ANSI.reset} ${this.bootstrap.workingDirectory}${CRLF}` +
                `${ANSI.dim}Type a prompt and press Enter. /help for slash commands. ↑/↓ history, Ctrl+C abort, Ctrl+L clear.${ANSI.reset}${CRLF}` +
                CRLF,
        );
    }

    private writePrompt(): void {
        const cwd = this.bootstrap?.workingDirectory ?? "";
        // Bracket the prompt with OSC 633 ; A and ; B so VS Code's
        // command-detection knows the input boundary.
        this.host.write(osc.promptStart());
        this.host.write(
            `${ANSI.green}arena${ANSI.reset} ${ANSI.cyan}${cwd}${ANSI.reset} ${ANSI.bold}❯${ANSI.reset} `,
        );
        this.host.write(osc.promptEnd());
    }
}
