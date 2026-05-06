/*---------------------------------------------------------------------------------------------
 *  src/sdk/lifecycle.ts
 *
 *  Supervisor state machine for the underlying CopilotClient (R-11c +
 *  significant finding #8). Tracks transitions through:
 *
 *    notStarted → starting → ready → degraded → restarting → ready
 *                                            ↘ stopped
 *
 *  In `degraded`, new prompts are rejected with a typed result so callers can
 *  decide whether to wait or surface an error to the user. The supervisor
 *  emits `aa.sdk.cli.start_failed.v1`, `aa.sdk.cli.degraded.v1`, and
 *  `aa.sdk.cli.restart_attempted.v1` events as transitions occur.
 *
 *  Pure logic; no SDK or VS Code dependencies. The CopilotSdkAdapter wires it
 *  to the actual CopilotClient.
 *--------------------------------------------------------------------------------------------*/

export type SupervisorState =
    | "notStarted"
    | "starting"
    | "ready"
    | "degraded"
    | "restarting"
    | "stopped";

export type SupervisorTransition =
    | { kind: "start.requested" }
    | { kind: "start.succeeded" }
    | { kind: "start.failed"; error: unknown }
    | { kind: "runtime.error"; error: unknown }
    | { kind: "restart.requested" }
    | { kind: "restart.succeeded" }
    | { kind: "restart.failed"; error: unknown }
    | { kind: "stop.requested" };

export type SupervisorObserver = (transition: {
    from: SupervisorState;
    to: SupervisorState;
    cause: SupervisorTransition;
}) => void;

/**
 * Returns whether a prompt may be sent given the current supervisor state.
 * Used by the SdkSessionMessaging-side wrappers to reject early in
 * `degraded` / `restarting` rather than letting the SDK call fail.
 */
export function canAcceptPrompts(state: SupervisorState): boolean {
    return state === "ready";
}

/**
 * Pure transition function. Returns the next state given the current state
 * and the transition cause. Invalid transitions return the current state
 * unchanged (the supervisor logs them as a warning rather than throwing,
 * since transition races are expected during startup/teardown).
 */
export function nextState(
    state: SupervisorState,
    transition: SupervisorTransition,
): SupervisorState {
    switch (transition.kind) {
        case "start.requested":
            return state === "notStarted" ? "starting" : state;
        case "start.succeeded":
            return state === "starting" ? "ready" : state;
        case "start.failed":
            return state === "starting" ? "stopped" : state;
        case "runtime.error":
            return state === "ready" ? "degraded" : state;
        case "restart.requested":
            return state === "degraded" ? "restarting" : state;
        case "restart.succeeded":
            return state === "restarting" ? "ready" : state;
        case "restart.failed":
            return state === "restarting" ? "stopped" : state;
        case "stop.requested":
            return "stopped";
    }
}

/**
 * In-memory supervisor. Mutable state + observer list. Not thread-safe (the
 * extension host is single-threaded). Use one instance per SDK client.
 */
export class Supervisor {
    private _state: SupervisorState = "notStarted";
    private readonly observers: SupervisorObserver[] = [];

    get state(): SupervisorState {
        return this._state;
    }

    canAcceptPrompts(): boolean {
        return canAcceptPrompts(this._state);
    }

    /** Apply a transition. Returns the new state (which may equal the old one
     *  if the transition was invalid for the current state). */
    apply(transition: SupervisorTransition): SupervisorState {
        const from = this._state;
        const to = nextState(from, transition);
        if (to !== from) {
            this._state = to;
            for (const observer of this.observers) {
                try {
                    observer({ from, to, cause: transition });
                } catch {
                    // Observers MUST NOT break the state machine. Swallow.
                }
            }
        }
        return to;
    }

    observe(observer: SupervisorObserver): { dispose(): void } {
        this.observers.push(observer);
        return {
            dispose: () => {
                const idx = this.observers.indexOf(observer);
                if (idx >= 0) this.observers.splice(idx, 1);
            },
        };
    }
}
