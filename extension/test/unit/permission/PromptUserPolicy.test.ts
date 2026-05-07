/*---------------------------------------------------------------------------------------------
 *  test/unit/permission/PromptUserPolicy.test.ts
 *
 *  Unit tests for PromptUserPolicy. Allow / deny / dismissed paths each
 *  emit the canonical aa.permission.prompted.v1 + aa.permission.resolved.v1
 *  events. Modal copy is generated per `request.kind` from the SDK's
 *  PermissionRequest discriminated union — fixtures use the real SDK
 *  per-kind shape (per the adversarial review I2: previously these
 *  fixtures used `as never` to invent fields like `toolName` and
 *  `summary` that don't exist on the SDK union).
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockShow } = vi.hoisted(() => ({
    mockShow: vi.fn<(...args: unknown[]) => Promise<string | undefined>>(),
}));

vi.mock("vscode", () => ({
    window: {
        showInformationMessage: mockShow,
    },
}));

// Import AFTER vi.mock so the policy picks up the stub.
import { PromptUserPolicy } from "../../../src/permission/PromptUserPolicy.js";
import type { CanonicalEvent } from "../../../src/telemetry/event.js";
import type { PermissionDecisionContext } from "../../../src/permission/PermissionPolicy.js";

class FakeEmitter {
    public emitted: CanonicalEvent[] = [];
    emitNew(event: Omit<CanonicalEvent, "ts">): void {
        this.emitted.push({ ts: "2026-05-06T00:00:00Z", ...event } as CanonicalEvent);
    }
}

/** Real SDK PermissionRequest fixtures (per
 *  node_modules/@github/copilot-sdk/dist/generated/session-events.d.ts). */
function shellRequest(): PermissionDecisionContext {
    return {
        agentId: "primary",
        sessionId: "s1",
        correlationId: "c1",
        request: {
            kind: "shell",
            toolCallId: "tc-1",
            fullCommandText: "echo howdy",
            intention: "echo something to stdout",
            commands: [{ command: "echo", args: ["howdy"] }],
            possiblePaths: [],
            possibleUrls: [],
            hasWriteFileRedirection: false,
            canOfferSessionApproval: true,
        } as never,
    };
}

function writeRequest(): PermissionDecisionContext {
    return {
        agentId: "primary",
        sessionId: "s1",
        correlationId: "c2",
        request: {
            kind: "write",
            toolCallId: "tc-2",
            intention: "create scratch file",
            fileName: "scratch.txt",
            diff: "+ hello world",
        } as never,
    };
}

function readRequest(): PermissionDecisionContext {
    return {
        agentId: "primary",
        sessionId: "s1",
        correlationId: "c3",
        request: {
            kind: "read",
            toolCallId: "tc-3",
            intention: "load config",
            path: "/etc/passwd",
        } as never,
    };
}

function urlRequest(): PermissionDecisionContext {
    return {
        agentId: "primary",
        sessionId: "s1",
        correlationId: "c4",
        request: {
            kind: "url",
            toolCallId: "tc-4",
            intention: "look up release notes",
            url: "https://example.com/notes",
        } as never,
    };
}

describe("PromptUserPolicy", () => {
    let emitter: FakeEmitter;
    let policy: PromptUserPolicy;

    beforeEach(() => {
        mockShow.mockReset();
        emitter = new FakeEmitter();
        policy = new PromptUserPolicy(emitter as never);
    });

    it("returns kind: allow when the user clicks Allow (shell)", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        const decision = await policy.decide(shellRequest());
        expect(decision.kind).toBe("allow");
        if (decision.kind === "allow") {
            expect(decision.reason).toBe("modal_allow");
        }
    });

    it("returns kind: deny with reason: modal_deny when the user clicks Deny", async () => {
        mockShow.mockResolvedValueOnce("Deny");
        const decision = await policy.decide(shellRequest());
        expect(decision.kind).toBe("deny");
        if (decision.kind === "deny") {
            expect(decision.reason).toBe("modal_deny");
        }
    });

    it("returns kind: deny with reason: modal_dismissed when the user dismisses (undefined)", async () => {
        mockShow.mockResolvedValueOnce(undefined);
        const decision = await policy.decide(shellRequest());
        expect(decision.kind).toBe("deny");
        if (decision.kind === "deny") {
            expect(decision.reason).toBe("modal_dismissed");
        }
    });

    it("emits aa.permission.prompted.v1 BEFORE the user answers", async () => {
        let capturedAtPromptTime = 0;
        mockShow.mockImplementationOnce(async () => {
            capturedAtPromptTime = emitter.emitted.length;
            return "Allow";
        });
        await policy.decide(shellRequest());
        expect(capturedAtPromptTime).toBe(1);
        expect(emitter.emitted[0]!.event).toBe("aa.permission.prompted.v1");
    });

    it("emits aa.permission.resolved.v1 with source: modal AFTER the user answers", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide(shellRequest());
        expect(emitter.emitted).toHaveLength(2);
        const resolved = emitter.emitted[1]!;
        expect(resolved.event).toBe("aa.permission.resolved.v1");
        const payload = resolved.payload as { decision: string; source: string };
        expect(payload.decision).toBe("allow");
        expect(payload.source).toBe("modal");
    });

    it("logs decision: deny in resolved when the user denies", async () => {
        mockShow.mockResolvedValueOnce("Deny");
        await policy.decide(shellRequest());
        const resolved = emitter.emitted[1]!;
        const payload = resolved.payload as { decision: string };
        expect(payload.decision).toBe("deny");
    });

    it("propagates the same correlationId from prompted → resolved", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide(shellRequest());
        expect(emitter.emitted[0]!.correlation_id).toBe("c1");
        expect(emitter.emitted[1]!.correlation_id).toBe("c1");
    });

    it("modal copy for shell shows the command text", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide(shellRequest());
        expect(mockShow).toHaveBeenCalledTimes(1);
        const [message, options] = mockShow.mock.calls[0] as [string, Record<string, unknown>];
        expect(message).toContain("Run shell command");
        expect(message).toContain("echo howdy");
        expect(options).toMatchObject({ modal: true });
    });

    it("modal copy for write shows the file name + diff", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide(writeRequest());
        const [message] = mockShow.mock.calls[0] as [string];
        expect(message).toContain("Write to file");
        expect(message).toContain("scratch.txt");
        expect(message).toContain("hello world");
    });

    it("modal copy for read shows the path + intention", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide(readRequest());
        const [message] = mockShow.mock.calls[0] as [string];
        expect(message).toContain("Read file");
        expect(message).toContain("/etc/passwd");
        expect(message).toContain("load config");
    });

    it("modal copy for url shows the URL + intention", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide(urlRequest());
        const [message] = mockShow.mock.calls[0] as [string];
        expect(message).toContain("Fetch URL");
        expect(message).toContain("https://example.com/notes");
        expect(message).toContain("release notes");
    });

    it("resolved event surfaces request.kind in payload", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide(shellRequest());
        const resolved = emitter.emitted[1]!;
        const payload = resolved.payload as { kind: string; summary: string };
        expect(payload.kind).toBe("shell");
        expect(payload.summary).toBe("echo howdy");
    });

    it("falls back to a generic title for unknown kinds", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide({
            agentId: "primary",
            sessionId: "s1",
            correlationId: "c-unknown",
            request: { kind: "future-kind", toolCallId: "tc-x", flavor: "extra" } as never,
        });
        const [message] = mockShow.mock.calls[0] as [string];
        expect(message).toContain("Allow tool invocation");
        expect(message).toContain("future-kind");
    });
});
