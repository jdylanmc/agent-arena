/*---------------------------------------------------------------------------------------------
 *  test/unit/panel/PseudoterminalIO.test.ts
 *
 *  Covers F1 — the pure-logic IO layer that drives each agent's
 *  Pseudoterminal. Tests slash commands, history navigation, the
 *  input-streaming pipeline, OSC 633 emission discipline, and the
 *  transcript-replay path.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from "vitest";
import {
    PseudoterminalIO,
    type IOBootstrap,
    type PseudoterminalIOHost,
} from "../../../src/panel/io/PseudoterminalIO.js";

class FakeHost implements PseudoterminalIOHost {
    public buffer: string[] = [];
    public name = "";
    public submissions: Array<{ text: string; correlationId: string }> = [];
    public yoloChanges: boolean[] = [];
    private nextCorrelationId = 1;

    write(text: string): void {
        this.buffer.push(text);
    }
    setName(name: string): void {
        this.name = name;
    }
    submitPrompt(text: string, correlationId: string): void {
        this.submissions.push({ text, correlationId });
    }
    setYolo(enabled: boolean): void {
        this.yoloChanges.push(enabled);
    }
    mintCorrelationId(): string {
        return `corr-${this.nextCorrelationId++}`;
    }

    flatten(): string {
        return this.buffer.join("");
    }

    /** Reset capture buffers (but keep mock state like nextCorrelationId). */
    reset(): void {
        this.buffer = [];
        this.submissions = [];
        this.yoloChanges = [];
    }
}

const BOOTSTRAP: IOBootstrap = {
    canonicalIdentity: "copilot(developer)",
    displayName: "Main Developer",
    workingDirectory: "/repo",
    bannerSubtitle: "connected to GitHub Copilot as user (gh-cli)",
    yoloEnabled: false,
};

describe("PseudoterminalIO.open", () => {
    let host: FakeHost;
    let io: PseudoterminalIO;

    beforeEach(() => {
        host = new FakeHost();
        io = new PseudoterminalIO(host);
    });

    it("sets the terminal name to the canonical identity", () => {
        io.open(BOOTSTRAP);
        expect(host.name).toBe("copilot(developer)");
    });

    it("emits HasRichCommandDetection + Cwd properties before any visible output", () => {
        io.open(BOOTSTRAP);
        const out = host.flatten();
        const richIdx = out.indexOf("HasRichCommandDetection=True");
        const cwdIdx = out.indexOf("Cwd=/repo");
        const bannerIdx = out.indexOf("Agent Arena");
        expect(richIdx).toBeGreaterThanOrEqual(0);
        expect(cwdIdx).toBeGreaterThanOrEqual(0);
        expect(bannerIdx).toBeGreaterThanOrEqual(0);
        expect(richIdx).toBeLessThan(bannerIdx);
        expect(cwdIdx).toBeLessThan(bannerIdx);
    });

    it("renders the banner with display name, subtitle, and yolo state", () => {
        io.open(BOOTSTRAP);
        const out = host.flatten();
        expect(out).toContain("Main Developer");
        expect(out).toContain("connected to GitHub Copilot as user (gh-cli)");
        expect(out).toContain("yolo OFF");
        expect(out).toContain("cwd:");
        expect(out).toContain("/repo");
    });

    it("brackets the prompt prefix with OSC 633 ; A and ; B", () => {
        io.open(BOOTSTRAP);
        const out = host.flatten();
        // Prompt-start must appear before the visible "arena" prefix; prompt-end after it.
        const startIdx = out.indexOf("\x1b]633;A\x07");
        const arenaIdx = out.indexOf("arena");
        const endIdx = out.indexOf("\x1b]633;B\x07");
        expect(startIdx).toBeGreaterThanOrEqual(0);
        expect(arenaIdx).toBeGreaterThan(startIdx);
        expect(endIdx).toBeGreaterThan(arenaIdx);
    });

    it("is idempotent — second open() is a no-op", () => {
        io.open(BOOTSTRAP);
        const before = host.flatten().length;
        io.open(BOOTSTRAP);
        expect(host.flatten().length).toBe(before);
    });
});

describe("PseudoterminalIO.handleInput — text + Enter", () => {
    let host: FakeHost;
    let io: PseudoterminalIO;

    beforeEach(() => {
        host = new FakeHost();
        io = new PseudoterminalIO(host);
        io.open(BOOTSTRAP);
        host.reset();
    });

    it("echoes printable characters", () => {
        io.handleInput("echo");
        expect(host.flatten()).toBe("echo");
    });

    it("on Enter, submits the buffer with a fresh correlationId, and emits OSC 633 ; E + ; C", () => {
        io.handleInput("echo howdy\r");
        expect(host.submissions).toHaveLength(1);
        expect(host.submissions[0]!.text).toBe("echo howdy");
        const out = host.flatten();
        // Per OSC 633 ; E spec, spaces (0x20) are escaped to \x20.
        expect(out).toContain("\x1b]633;E;echo\\x20howdy;corr-1\x07");
        expect(out).toContain("\x1b]633;C\x07");
    });

    it("treats \\n the same as \\r on Enter (some terminals send LF only)", () => {
        io.handleInput("echo howdy\n");
        expect(host.submissions).toHaveLength(1);
        expect(host.submissions[0]!.text).toBe("echo howdy");
    });

    it("backspace pops the buffer and emits BS-space-BS", () => {
        io.handleInput("ec\x7f");
        expect(host.buffer).toContain("\b \b");
    });

    it("Ctrl+C clears the buffer and redraws the prompt", () => {
        io.handleInput("partial");
        host.reset();
        io.handleInput("\x03");
        const out = host.flatten();
        expect(out).toContain("^C");
        expect(out).toContain("arena");
        // Subsequent Enter should NOT submit "partial".
        io.handleInput("\r");
        expect(host.submissions).toHaveLength(0);
    });

    it("Ctrl+L clears the screen and re-renders the banner + prompt", () => {
        io.handleInput("\x0c");
        const out = host.flatten();
        expect(out).toContain("\x1b[2J\x1b[H");
        expect(out).toContain("Agent Arena");
        expect(out).toContain("arena");
    });

    it("ignores ESC-[unknown CSI without crashing", () => {
        io.handleInput("\x1b[Z"); // unknown CSI final
        // No throws, no submissions.
        expect(host.submissions).toHaveLength(0);
    });
});

describe("PseudoterminalIO.handleInput — slash commands", () => {
    let host: FakeHost;
    let io: PseudoterminalIO;

    beforeEach(() => {
        host = new FakeHost();
        io = new PseudoterminalIO(host);
        io.open(BOOTSTRAP);
        host.reset();
    });

    it("/help prints the slash-command list", () => {
        io.handleInput("/help\r");
        const out = host.flatten();
        expect(out).toContain("/help");
        expect(out).toContain("/yolo on");
        expect(out).toContain("/yolo off");
        expect(out).toContain("/clear");
        expect(host.submissions).toHaveLength(0);
    });

    it("/yolo on calls setYolo(true) and renders the new state", () => {
        io.handleInput("/yolo on\r");
        expect(host.yoloChanges).toEqual([true]);
        expect(host.flatten()).toContain("YOLO ON");
    });

    it("/yolo off calls setYolo(false)", () => {
        io.handleInput("/yolo off\r");
        expect(host.yoloChanges).toEqual([false]);
        expect(host.flatten()).toContain("yolo OFF");
    });

    it("/yolo with bad arg shows usage", () => {
        io.handleInput("/yolo maybe\r");
        expect(host.flatten()).toContain("Usage: /yolo on|off");
        expect(host.yoloChanges).toEqual([]);
    });

    it("/clear clears the screen and shows the banner", () => {
        io.handleInput("/clear\r");
        const out = host.flatten();
        expect(out).toContain("\x1b[2J\x1b[H");
        expect(out).toContain("Agent Arena");
    });

    it("unknown /xyz prints the error", () => {
        io.handleInput("/xyz\r");
        expect(host.flatten()).toContain("Unknown command: /xyz");
        expect(host.flatten()).toContain("Try /help");
    });

    it("slash commands do NOT emit OSC 633 ; E or ; C (they don't go to the agent)", () => {
        io.handleInput("/help\r");
        const out = host.flatten();
        expect(out).not.toContain("\x1b]633;E;");
        expect(out).not.toContain("\x1b]633;C\x07");
    });

    it("empty enter just redraws the prompt without submitting", () => {
        io.handleInput("\r");
        expect(host.submissions).toHaveLength(0);
        expect(host.flatten()).toContain("arena");
    });
});

describe("PseudoterminalIO.handleInput — history (↑/↓)", () => {
    let host: FakeHost;
    let io: PseudoterminalIO;

    beforeEach(() => {
        host = new FakeHost();
        io = new PseudoterminalIO(host);
        io.open(BOOTSTRAP);
        // Submit two prior turns so history has entries.
        io.handleInput("first\r");
        io.handleInput("second\r");
        host.reset();
    });

    it("↑ recalls the most recent entry", () => {
        io.handleInput("\x1b[A");
        // The line is rewritten — buffer ends with "second" replacing the live input.
        expect(host.flatten()).toContain("second");
    });

    it("↑ ↑ walks back to the older entry", () => {
        io.handleInput("\x1b[A\x1b[A");
        expect(host.flatten()).toContain("first");
    });

    it("↑ then ↓ returns to a blank input (one past the end)", () => {
        io.handleInput("\x1b[A\x1b[B");
        const out = host.flatten();
        // Final replaceCurrentLine writes an empty content after the prompt.
        expect(out).toContain("arena");
    });
});

describe("PseudoterminalIO.onAssistantDelta / onAssistantFinal (A1+A2 mirror)", () => {
    let host: FakeHost;
    let io: PseudoterminalIO;

    beforeEach(() => {
        host = new FakeHost();
        io = new PseudoterminalIO(host);
        io.open(BOOTSTRAP);
        host.reset();
    });

    it("delta writes raw chunks to the buffer", () => {
        io.onAssistantDelta("hel");
        io.onAssistantDelta("lo");
        expect(host.flatten()).toBe("hello");
    });

    it("ignores empty-string deltas", () => {
        io.onAssistantDelta("");
        expect(host.buffer.length).toBe(0);
    });

    it("when streaming preceded final, final emits only CRLF (no double-render)", () => {
        io.onAssistantDelta("hello");
        host.reset();
        io.onAssistantFinal("hello");
        expect(host.flatten()).toBe("\r\n");
    });

    it("when no streaming preceded final, the text + CRLF is rendered (A2 fix)", () => {
        io.onAssistantFinal("hello");
        expect(host.flatten()).toContain("hello");
        expect(host.flatten()).toContain("\r\n");
    });

    it("noop on empty/undefined final when not streaming", () => {
        io.onAssistantFinal();
        io.onAssistantFinal("");
        expect(host.buffer.length).toBe(0);
    });
});

describe("PseudoterminalIO.onSessionIdle / onSessionError", () => {
    let host: FakeHost;
    let io: PseudoterminalIO;

    beforeEach(() => {
        host = new FakeHost();
        io = new PseudoterminalIO(host);
        io.open(BOOTSTRAP);
        host.reset();
    });

    it("onSessionIdle emits OSC 633 ; D ; 0 and redraws the prompt", () => {
        io.onSessionIdle();
        const out = host.flatten();
        expect(out).toContain("\x1b]633;D;0\x07");
        expect(out).toContain("arena");
    });

    it("onSessionError emits OSC 633 ; D ; 1 and shows the error message in red", () => {
        io.onSessionError("model unavailable");
        const out = host.flatten();
        expect(out).toContain("\x1b]633;D;1\x07");
        expect(out).toContain("model unavailable");
        expect(out).toContain("error:");
    });
});

describe("PseudoterminalIO.onYoloChange", () => {
    it("updates the local mirror so the next banner reflects the new state", () => {
        const host = new FakeHost();
        const io = new PseudoterminalIO(host);
        io.open(BOOTSTRAP);
        io.onYoloChange(true);
        host.reset();
        // /clear redraws the banner from the local mirror.
        io.handleInput("/clear\r");
        expect(host.flatten()).toContain("YOLO ON");
    });
});

describe("PseudoterminalIO transcript replay (CD-11 §6)", () => {
    let host: FakeHost;
    let io: PseudoterminalIO;

    beforeEach(() => {
        host = new FakeHost();
        io = new PseudoterminalIO(host);
    });

    it("replays each turn's final (preferred) before drawing the prompt", () => {
        io.open(BOOTSTRAP, [
            { turnId: "t1", chunks: [], final: "FIRST" },
            { turnId: "t2", chunks: [], final: "SECOND" },
        ]);
        const out = host.flatten();
        const firstIdx = out.indexOf("FIRST");
        const secondIdx = out.indexOf("SECOND");
        const promptIdx = out.lastIndexOf("arena");
        expect(firstIdx).toBeGreaterThanOrEqual(0);
        expect(secondIdx).toBeGreaterThan(firstIdx);
        expect(promptIdx).toBeGreaterThan(secondIdx);
    });

    it("falls back to chunks when a turn has no final (or empty final)", () => {
        io.open(BOOTSTRAP, [
            { turnId: "t1", chunks: ["foo", " ", "bar"] },
            { turnId: "t2", chunks: [], final: "" },
        ]);
        const out = host.flatten();
        expect(out).toContain("foo bar");
    });
});

describe("PseudoterminalIO.close", () => {
    it("clears internal state so a subsequent open() is fresh", () => {
        const host = new FakeHost();
        const io = new PseudoterminalIO(host);
        io.open(BOOTSTRAP);
        io.handleInput("partial");
        io.close();
        host.reset();
        io.open(BOOTSTRAP); // second open after close should NOT be no-op
        expect(host.flatten()).toContain("Agent Arena");
    });
});
