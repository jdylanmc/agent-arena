/*---------------------------------------------------------------------------------------------
 *  test/unit/sdk/lifecycle.test.ts
 *
 *  Covers task T033 → T034: supervisor state machine transitions.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import {
    Supervisor,
    canAcceptPrompts,
    nextState,
    type SupervisorState,
} from "../../../src/sdk/lifecycle.js";

describe("nextState (pure)", () => {
    it("notStarted + start.requested → starting", () => {
        expect(nextState("notStarted", { kind: "start.requested" })).toBe("starting");
    });

    it("starting + start.succeeded → ready", () => {
        expect(nextState("starting", { kind: "start.succeeded" })).toBe("ready");
    });

    it("starting + start.failed → stopped", () => {
        expect(nextState("starting", { kind: "start.failed", error: new Error() })).toBe(
            "stopped",
        );
    });

    it("ready + runtime.error → degraded", () => {
        expect(nextState("ready", { kind: "runtime.error", error: new Error() })).toBe(
            "degraded",
        );
    });

    it("degraded + restart.requested → restarting", () => {
        expect(nextState("degraded", { kind: "restart.requested" })).toBe("restarting");
    });

    it("restarting + restart.succeeded → ready", () => {
        expect(nextState("restarting", { kind: "restart.succeeded" })).toBe("ready");
    });

    it("restarting + restart.failed → stopped", () => {
        expect(nextState("restarting", { kind: "restart.failed", error: new Error() })).toBe(
            "stopped",
        );
    });

    it("any state + stop.requested → stopped", () => {
        const states: SupervisorState[] = [
            "notStarted",
            "starting",
            "ready",
            "degraded",
            "restarting",
            "stopped",
        ];
        for (const state of states) {
            expect(nextState(state, { kind: "stop.requested" })).toBe("stopped");
        }
    });

    it("invalid transitions are no-ops (return input state)", () => {
        // start.succeeded outside of starting is invalid
        expect(nextState("ready", { kind: "start.succeeded" })).toBe("ready");
        // restart.requested outside of degraded is invalid
        expect(nextState("ready", { kind: "restart.requested" })).toBe("ready");
        // runtime.error outside of ready is invalid
        expect(nextState("starting", { kind: "runtime.error", error: new Error() })).toBe(
            "starting",
        );
    });
});

describe("canAcceptPrompts", () => {
    it("returns true only when state is ready", () => {
        expect(canAcceptPrompts("ready")).toBe(true);
        expect(canAcceptPrompts("notStarted")).toBe(false);
        expect(canAcceptPrompts("starting")).toBe(false);
        expect(canAcceptPrompts("degraded")).toBe(false);
        expect(canAcceptPrompts("restarting")).toBe(false);
        expect(canAcceptPrompts("stopped")).toBe(false);
    });
});

describe("Supervisor (stateful)", () => {
    it("starts in notStarted", () => {
        const sup = new Supervisor();
        expect(sup.state).toBe("notStarted");
        expect(sup.canAcceptPrompts()).toBe(false);
    });

    it("transitions through a happy-path lifecycle", () => {
        const sup = new Supervisor();
        sup.apply({ kind: "start.requested" });
        expect(sup.state).toBe("starting");
        sup.apply({ kind: "start.succeeded" });
        expect(sup.state).toBe("ready");
        expect(sup.canAcceptPrompts()).toBe(true);
        sup.apply({ kind: "runtime.error", error: new Error("net") });
        expect(sup.state).toBe("degraded");
        expect(sup.canAcceptPrompts()).toBe(false);
        sup.apply({ kind: "restart.requested" });
        expect(sup.state).toBe("restarting");
        sup.apply({ kind: "restart.succeeded" });
        expect(sup.state).toBe("ready");
    });

    it("notifies observers of every state change", () => {
        const sup = new Supervisor();
        const transitions: Array<{ from: SupervisorState; to: SupervisorState }> = [];
        sup.observe(({ from, to }) => {
            transitions.push({ from, to });
        });
        sup.apply({ kind: "start.requested" });
        sup.apply({ kind: "start.succeeded" });
        expect(transitions).toEqual([
            { from: "notStarted", to: "starting" },
            { from: "starting", to: "ready" },
        ]);
    });

    it("does NOT notify observers when transition is a no-op", () => {
        const sup = new Supervisor();
        let count = 0;
        sup.observe(() => {
            count++;
        });
        // notStarted + start.succeeded is a no-op
        sup.apply({ kind: "start.succeeded" });
        expect(count).toBe(0);
    });

    it("observer errors do not break the state machine", () => {
        const sup = new Supervisor();
        sup.observe(() => {
            throw new Error("boom");
        });
        // Should not throw; state should still transition.
        sup.apply({ kind: "start.requested" });
        expect(sup.state).toBe("starting");
    });

    it("observe().dispose() removes the observer", () => {
        const sup = new Supervisor();
        let count = 0;
        const sub = sup.observe(() => {
            count++;
        });
        sup.apply({ kind: "start.requested" });
        expect(count).toBe(1);
        sub.dispose();
        sup.apply({ kind: "start.succeeded" });
        expect(count).toBe(1); // Not incremented after dispose
    });
});
