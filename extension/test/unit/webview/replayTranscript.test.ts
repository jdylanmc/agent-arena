/*---------------------------------------------------------------------------------------------
 *  test/unit/webview/replayTranscript.test.ts
 *
 *  Adversarial-review I4 + A2 + A9: covers TerminalController's
 *  `onAssistantFinal(text?)` and `replayTranscript(...)` paths.
 *
 *  Pre-fix bugs:
 *    - A2: `onAssistantFinal()` took no `text` argument and only wrote
 *          a CRLF if `isStreaming` was true — so when streaming was off
 *          (or never started) the user saw nothing despite the wire
 *          carrying the full message.
 *    - A9: `replayTranscript` only wrote `final` when `chunks.length
 *          === 0` — so a turn with both chunks and a final dropped the
 *          consolidated final text.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from "vitest";
import { TerminalController } from "../../../webview-src/lib/terminalController.js";
import type { XtermApi } from "../../../webview-src/components/XtermTerminal-types.js";

class FakeXterm implements XtermApi {
    public buffer: string[] = [];
    write(text: string): void {
        this.buffer.push(text);
    }
    writeln(text: string): void {
        this.buffer.push(text + "\n");
    }
    clear(): void {
        this.buffer = [];
    }
    focus(): void {}
    findNext(_term: string): boolean {
        return false;
    }
    serialize(): string {
        return this.buffer.join("");
    }
    getRows(): number {
        return 24;
    }
    getCols(): number {
        return 80;
    }
    /** Concatenated output so tests can string-match. */
    flatten(): string {
        return this.buffer.join("");
    }
}

const BOOTSTRAP = {
    workingDirectory: "/repo",
    adapterKind: "copilot" as const,
    adapterLogin: "user",
    bannerSubtitle: "connected",
    yoloEnabled: false,
};

describe("TerminalController.onAssistantFinal (A2 — render text when not streaming)", () => {
    let xterm: FakeXterm;
    let controller: TerminalController;

    beforeEach(() => {
        xterm = new FakeXterm();
        controller = new TerminalController({
            submitPrompt: () => {},
            setYolo: () => {},
        });
        controller.attach(xterm);
        controller.setBootstrap(BOOTSTRAP);
        xterm.buffer = [];
    });

    it("writes the final text + CRLF when no streaming preceded it", () => {
        controller.onAssistantFinal("hello world");
        const out = xterm.flatten();
        expect(out).toContain("hello world");
        expect(out.endsWith("\r\n")).toBe(true);
    });

    it("emits only a CRLF when streaming already drew the body", () => {
        controller.onAssistantDelta("hel");
        controller.onAssistantDelta("lo");
        const beforeFinal = xterm.flatten();
        controller.onAssistantFinal("hello");
        const out = xterm.flatten();
        expect(out.length).toBe(beforeFinal.length + "\r\n".length);
        expect(out.endsWith("\r\n")).toBe(true);
    });

    it("noop on empty/undefined text when not streaming", () => {
        controller.onAssistantFinal();
        controller.onAssistantFinal("");
        expect(xterm.buffer.length).toBe(0);
    });
});

describe("TerminalController.replayTranscript (A9 — prefer final over chunks)", () => {
    let xterm: FakeXterm;
    let controller: TerminalController;

    beforeEach(() => {
        xterm = new FakeXterm();
        controller = new TerminalController({
            submitPrompt: () => {},
            setYolo: () => {},
        });
        controller.attach(xterm);
        controller.setBootstrap(BOOTSTRAP);
        xterm.buffer = [];
    });

    it("renders the consolidated final when it's present (chunks-only is the fallback)", () => {
        controller.replayTranscript([
            {
                turnId: "t1",
                chunks: ["RAW-CHUNK-A", "RAW-CHUNK-B"],
                final: "ASSEMBLED-FINAL-TEXT",
            },
        ]);
        const out = xterm.flatten();
        expect(out).toContain("ASSEMBLED-FINAL-TEXT");
        // Chunks must NOT also appear — that would double-render the turn.
        expect(out).not.toContain("RAW-CHUNK-A");
        expect(out).not.toContain("RAW-CHUNK-B");
    });

    it("falls back to chunks when final is undefined", () => {
        controller.replayTranscript([
            { turnId: "t1", chunks: ["foo", " ", "bar"] },
        ]);
        const out = xterm.flatten();
        expect(out).toContain("foo bar");
    });

    it("falls back to chunks when final is empty string", () => {
        controller.replayTranscript([
            { turnId: "t1", chunks: ["foo"], final: "" },
        ]);
        const out = xterm.flatten();
        expect(out).toContain("foo");
    });

    it("renders nothing per-turn when chunks and final are both empty (still emits the row CRLF)", () => {
        controller.replayTranscript([{ turnId: "empty", chunks: [] }]);
        const out = xterm.flatten();
        expect(out).toContain("\r\n");
    });

    it("draws a fresh prompt after replay (so the user can type)", () => {
        controller.replayTranscript([{ turnId: "t1", chunks: [], final: "ok" }]);
        const out = xterm.flatten();
        expect(out).toContain("arena");
    });

    it("processes multiple turns in order, preferring final each time", () => {
        controller.replayTranscript([
            { turnId: "t1", chunks: [], final: "FIRST" },
            { turnId: "t2", chunks: ["IGNORED-CHUNK"], final: "SECOND" },
            { turnId: "t3", chunks: ["THIRD-CHUNK-ONLY"] },
        ]);
        const out = xterm.flatten();
        const firstPos = out.indexOf("FIRST");
        const secondPos = out.indexOf("SECOND");
        const thirdPos = out.indexOf("THIRD-CHUNK-ONLY");
        expect(firstPos).toBeGreaterThanOrEqual(0);
        expect(secondPos).toBeGreaterThan(firstPos);
        expect(thirdPos).toBeGreaterThan(secondPos);
        expect(out).not.toContain("IGNORED-CHUNK");
    });
});
