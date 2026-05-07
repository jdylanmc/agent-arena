/*---------------------------------------------------------------------------------------------
 *  src/panel/io/oscSequences.ts
 *
 *  VS Code shell-integration escape-sequence emission helpers (per
 *  https://code.visualstudio.com/docs/terminal/shell-integration). Used
 *  by the Pseudoterminal that backs each agent's `vscode.Terminal` so
 *  the user gets command decorations, command navigation, sticky
 *  scroll, and quick fixes for free.
 *
 *  Pure functions — no `vscode` import, no I/O. The caller (`PseudoterminalIO`)
 *  composes these with prompt-rendering and writes the result to the
 *  terminal's writeEmitter.
 *
 *  Synthesis: `wiki/sources/vscode-terminals.md` (OSC 633 catalog).
 *--------------------------------------------------------------------------------------------*/

/** OSC introducer + ST (string terminator). VS Code accepts both BEL
 *  (`\x07`) and the 7-bit ST (`\x1b\\`). We use BEL throughout — it's
 *  the more compatible variant. */
const OSC = "\x1b]";
const ST = "\x07";

/** Mark prompt start (`OSC 633 ; A`). Emitted right before the visible
 *  prompt prefix is drawn so VS Code knows where the prompt begins. */
export function promptStart(): string {
    return `${OSC}633;A${ST}`;
}

/** Mark prompt end (`OSC 633 ; B`). Emitted right after the visible
 *  prompt prefix and before the user's typed input. */
export function promptEnd(): string {
    return `${OSC}633;B${ST}`;
}

/** Mark pre-execution (`OSC 633 ; C`). Emitted right after the user
 *  submits a command (Enter) and before the agent starts streaming
 *  output. Pairs with the `D` "execution finished" sequence. */
export function preExecution(): string {
    return `${OSC}633;C${ST}`;
}

/** Mark execution finished (`OSC 633 ; D ; <exitCode>`). Emitted when
 *  the SDK fires `session.idle` (exitCode = 0) or `session.error`
 *  (exitCode = 1). Drives the gutter decoration's success/fail color
 *  and the overview-ruler dot. */
export function done(exitCode: number): string {
    return `${OSC}633;D;${exitCode}${ST}`;
}

/** Set a terminal property (`OSC 633 ; P ; <name>=<value>`). Known
 *  properties: `Cwd`, `IsWindows`, `HasRichCommandDetection`. */
export function setProperty(name: string, value: string): string {
    return `${OSC}633;P;${name}=${escapeForOsc(value)}${ST}`;
}

/** Set the working directory the terminal reports (`OSC 633 ; P ; Cwd=<path>`).
 *  VS Code uses this for tab labels, recent-directories quick pick, and
 *  link resolution inside the terminal buffer. */
export function setCwd(cwd: string): string {
    return setProperty("Cwd", cwd);
}

/** Promise that we'll always emit A/B/E/C/D in order
 *  (`OSC 633 ; P ; HasRichCommandDetection=True`). Unlocks the "Rich"
 *  shell-integration quality tier in VS Code's tab-hover diagnostics. */
export function richCommandDetection(): string {
    return setProperty("HasRichCommandDetection", "True");
}

/** Explicitly set the command line for the current turn
 *  (`OSC 633 ; E ; <commandline> [; <nonce>]`). Preferred over inferring
 *  from A/B/C — gives VS Code the exact prompt text for command
 *  navigation, run-recent-command, and (with a verifying nonce)
 *  unblocks safety-gated quick-fix actions.
 *
 *  Per docs:
 *    - escape `\` → `\\`
 *    - escape `;` → `\x3b`
 *    - escape any code ≤ `0x20` (notably `\n` → `\x0a`)
 *  All other characters pass through. */
export function commandLine(text: string, nonce?: string): string {
    const escaped = escapeCommandLine(text);
    if (nonce !== undefined && nonce.length > 0) {
        return `${OSC}633;E;${escaped};${nonce}${ST}`;
    }
    return `${OSC}633;E;${escaped}${ST}`;
}

/** Escape a string for embedding in any `OSC 633 ; P ; X=<value>` —
 *  same rules as command-line escaping (semicolon, backslash, control
 *  characters). */
export function escapeForOsc(value: string): string {
    return escapeCommandLine(value);
}

/** Escape rules per VS Code's OSC 633 ; E spec. Exported for tests
 *  that want to verify the round-trip. */
export function escapeCommandLine(text: string): string {
    let out = "";
    for (let i = 0; i < text.length; i++) {
        const ch = text[i] as string;
        const code = ch.charCodeAt(0);
        if (ch === "\\") {
            out += "\\\\";
        } else if (ch === ";") {
            out += "\\x3b";
        } else if (code <= 0x20) {
            out += `\\x${code.toString(16).padStart(2, "0")}`;
        } else {
            out += ch;
        }
    }
    return out;
}
