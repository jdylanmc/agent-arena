/*---------------------------------------------------------------------------------------------
 *  test/unit/panel/oscSequences.test.ts
 *
 *  Covers F1 — the OSC 633 escape-sequence helpers used by the
 *  Pseudoterminal that backs each agent's terminal. Verifies the exact
 *  byte sequences VS Code's shell-integration parser expects.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import {
    promptStart,
    promptEnd,
    preExecution,
    done,
    setProperty,
    setCwd,
    richCommandDetection,
    commandLine,
    escapeCommandLine,
} from "../../../src/panel/io/oscSequences.js";

const OSC = "\x1b]";
const ST = "\x07";

describe("OSC 633 — basic markers", () => {
    it("promptStart emits OSC 633 ; A ST", () => {
        expect(promptStart()).toBe(`${OSC}633;A${ST}`);
    });

    it("promptEnd emits OSC 633 ; B ST", () => {
        expect(promptEnd()).toBe(`${OSC}633;B${ST}`);
    });

    it("preExecution emits OSC 633 ; C ST", () => {
        expect(preExecution()).toBe(`${OSC}633;C${ST}`);
    });

    it("done emits OSC 633 ; D ; <exitcode> ST", () => {
        expect(done(0)).toBe(`${OSC}633;D;0${ST}`);
        expect(done(1)).toBe(`${OSC}633;D;1${ST}`);
        expect(done(127)).toBe(`${OSC}633;D;127${ST}`);
    });
});

describe("OSC 633 — properties (P; <name>=<value>)", () => {
    it("setProperty emits OSC 633 ; P ; <name>=<value> ST", () => {
        expect(setProperty("Foo", "bar")).toBe(`${OSC}633;P;Foo=bar${ST}`);
    });

    it("setCwd emits OSC 633 ; P ; Cwd=<path> ST", () => {
        expect(setCwd("/repo")).toBe(`${OSC}633;P;Cwd=/repo${ST}`);
    });

    it("setCwd escapes special chars in the path (backslash + semicolon)", () => {
        // Windows backslashes and any literal semicolon must be escaped.
        expect(setCwd("D:\\git\\agent-arena")).toBe(`${OSC}633;P;Cwd=D:\\\\git\\\\agent-arena${ST}`);
    });

    it("richCommandDetection emits the canonical True flag", () => {
        expect(richCommandDetection()).toBe(`${OSC}633;P;HasRichCommandDetection=True${ST}`);
    });
});

describe("OSC 633 — command line (E ; <text> [; <nonce>])", () => {
    it("emits OSC 633 ; E ; <text> ST when no nonce (spaces escaped per spec)", () => {
        // Per the docs, "0x20 and below" must be escaped — that includes space (0x20).
        expect(commandLine("echo howdy")).toBe(`${OSC}633;E;echo\\x20howdy${ST}`);
    });

    it("emits OSC 633 ; E ; <text> ; <nonce> ST when nonce is provided", () => {
        expect(commandLine("echo howdy", "abc-123")).toBe(
            `${OSC}633;E;echo\\x20howdy;abc-123${ST}`,
        );
    });

    it("ignores empty-string nonce (treated same as missing)", () => {
        expect(commandLine("echo howdy", "")).toBe(`${OSC}633;E;echo\\x20howdy${ST}`);
    });
});

describe("OSC 633 — escapeCommandLine", () => {
    it("escapes backslash to \\\\", () => {
        expect(escapeCommandLine("a\\b")).toBe("a\\\\b");
    });

    it("escapes semicolon to \\x3b", () => {
        expect(escapeCommandLine("a;b;c")).toBe("a\\x3bb\\x3bc");
    });

    it("escapes newline to \\x0a", () => {
        expect(escapeCommandLine("line1\nline2")).toBe("line1\\x0aline2");
    });

    it("escapes carriage return + tab + null + DEL etc. (any code <= 0x20)", () => {
        expect(escapeCommandLine("\x00")).toBe("\\x00");
        expect(escapeCommandLine("\x09")).toBe("\\x09");
        expect(escapeCommandLine("\x0d")).toBe("\\x0d");
        expect(escapeCommandLine("\x1f")).toBe("\\x1f");
        expect(escapeCommandLine(" ")).toBe("\\x20");
    });

    it("passes printable ASCII through unchanged", () => {
        expect(escapeCommandLine("echo howdy")).toContain("echo");
        expect(escapeCommandLine("!@#$%^&*()_+-={}[]:'\",.<>/?`~")).toBe(
            "!@#$%^&*()_+-={}[]:'\",.<>/?`~",
        );
    });

    it("passes UTF-8 multibyte codepoints through unchanged (no escape) but still escapes embedded spaces", () => {
        // Each codepoint of "café—naïve" is > 0x20, so they pass through
        // unchanged. The space between words is 0x20 and IS escaped.
        expect(escapeCommandLine("café—naïve")).toBe("café—naïve");
        expect(escapeCommandLine("café — naïve")).toBe("café\\x20—\\x20naïve");
    });

    it("composite — a Windows path with backslashes inside a complex prompt", () => {
        const input = "rg --hidden 'TODO' D:\\repo;src\\foo";
        expect(escapeCommandLine(input)).toBe(
            "rg\\x20--hidden\\x20'TODO'\\x20D:\\\\repo\\x3bsrc\\\\foo",
        );
    });
});
