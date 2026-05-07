/*---------------------------------------------------------------------------------------------
 *  webview-src/lib/terminalController.ts
 *
 *  Owns the imperative state of the bespoke xterm.js terminal in the
 *  primary-agent webview (per CD-07). Responsibilities:
 *    - input buffer (per-line accumulation, echoed to xterm)
 *    - ↑/↓ shell-style command history
 *    - ANSI/CSI sequence parsing (so arrow keys don't pollute the buffer)
 *    - prompt + banner rendering
 *    - slash-command dispatch (/help, /yolo, /clear)
 *    - assistant-streaming output (writes raw chunks to xterm)
 *
 *  The controller is renderer-agnostic — it depends only on the XtermApi
 *  shape (write/writeln/clear/focus). Tests can substitute a fake.
 *--------------------------------------------------------------------------------------------*/

import type { XtermApi } from "../components/XtermTerminal.js";

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

export interface BootstrapInfo {
    workingDirectory: string;
    adapterKind: "copilot" | "fake-demo";
    adapterLogin?: string;
    bannerSubtitle: string;
    yoloEnabled: boolean;
}

export interface TerminalControllerCallbacks {
    submitPrompt: (text: string) => void;
    setYolo: (enabled: boolean) => void;
}

export class TerminalController {
    private xterm: XtermApi | null = null;
    private bootstrap: BootstrapInfo | null = null;
    private inputBuffer = "";
    private isStreaming = false;

    private readonly history: string[] = [];
    private historyIndex = 0;

    private escState: "none" | "esc" | "csi" = "none";
    private csiBuffer = "";

    constructor(private readonly callbacks: TerminalControllerCallbacks) {}

    attach(xterm: XtermApi): void {
        this.xterm = xterm;
        if (this.bootstrap) {
            this.writeBanner();
            this.writePrompt();
        } else {
            this.write(`${ANSI.dim}Connecting…${ANSI.reset}${CRLF}`);
        }
    }

    detach(): void {
        this.xterm = null;
    }

    /** Called when the host's `agent.bootstrap` envelope arrives. */
    setBootstrap(info: BootstrapInfo): void {
        const wasFirstBoot = this.bootstrap === null;
        this.bootstrap = info;
        if (wasFirstBoot) {
            this.write(ANSI.clearScreen);
            this.writeBanner();
            this.writePrompt();
        }
    }

    /** Update yolo state (e.g., from status-bar toggle), redraw banner. */
    updateYolo(enabled: boolean): void {
        if (!this.bootstrap) return;
        this.bootstrap = { ...this.bootstrap, yoloEnabled: enabled };
    }

    /** Stream chunk from the assistant — write directly to xterm so xterm
     *  parses any ANSI inline. */
    onAssistantDelta(chunk: string): void {
        if (!this.isStreaming) {
            this.isStreaming = true;
        }
        this.write(chunk);
    }

    /** Final-message marker. The deltas already wrote everything — we just
     *  emit a newline so the next prompt lands on a fresh line. */
    onAssistantFinal(): void {
        if (this.isStreaming) {
            this.write(CRLF);
        }
    }

    onSessionIdle(): void {
        if (!this.isStreaming) return; // already idle
        this.isStreaming = false;
        this.writePrompt();
    }

    onError(message: string): void {
        this.isStreaming = false;
        this.write(`${CRLF}${ANSI.red}error: ${message}${ANSI.reset}${CRLF}`);
        this.writePrompt();
    }

    /** Raw keystroke input from xterm. */
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
                    this.write(CRLF);
                    if (this.inputBuffer.trim().length > 0) {
                        this.history.push(this.inputBuffer);
                    }
                    this.historyIndex = this.history.length;
                    this.submitOrSlash(this.inputBuffer);
                    this.inputBuffer = "";
                    break;
                case "\x7f":
                case "\b":
                    if (this.inputBuffer.length > 0) {
                        this.inputBuffer = this.inputBuffer.slice(0, -1);
                        this.write("\b \b");
                    }
                    break;
                case "\x03": // Ctrl+C
                    if (this.isStreaming) {
                        this.write(`${CRLF}${ANSI.red}^C${ANSI.reset}${CRLF}`);
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
                    if (ch >= " ") {
                        this.inputBuffer += ch;
                        this.write(ch);
                    }
            }
        }
    }

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
        this.write("\r\x1b[2K");
        this.writePrompt();
        this.write(content);
        this.inputBuffer = content;
    }

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
        this.callbacks.submitPrompt(text);
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
                this.callbacks.setYolo(next);
                if (this.bootstrap) {
                    this.bootstrap = { ...this.bootstrap, yoloEnabled: next };
                }
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

    private writeBanner(): void {
        if (!this.bootstrap) return;
        const yoloLabel = this.bootstrap.yoloEnabled
            ? `${ANSI.red}YOLO ON${ANSI.reset}`
            : `${ANSI.green}yolo OFF${ANSI.reset}`;
        this.write(
            `${ANSI.bold}Agent Arena${ANSI.reset} ${ANSI.dim}· Primary Agent · ${this.bootstrap.bannerSubtitle} · ${ANSI.reset}${yoloLabel}${CRLF}` +
                `${ANSI.dim}cwd:${ANSI.reset} ${this.bootstrap.workingDirectory}${CRLF}` +
                `${ANSI.dim}Type a prompt and press Enter. /help for slash commands. ↑/↓ history, Ctrl+C abort, Ctrl+L clear.${ANSI.reset}${CRLF}` +
                CRLF,
        );
    }

    private writePrompt(): void {
        const cwd = this.bootstrap?.workingDirectory ?? "";
        this.write(
            `${ANSI.green}arena${ANSI.reset} ${ANSI.cyan}${cwd}${ANSI.reset} ${ANSI.bold}❯${ANSI.reset} `,
        );
    }

    private write(text: string): void {
        this.xterm?.write(text);
    }
}
