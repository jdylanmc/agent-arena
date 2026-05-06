/*---------------------------------------------------------------------------------------------
 *  contracts/permission-policy.ts
 *
 *  FR-019 / Research R-06: the typed interface that proves the spec's promise
 *  ("a future spec can replace the binary yolo/prompt logic with a fine-grained
 *  per-tool policy without changing the handler's call sites").
 *
 *  The session-side `onPermissionRequest` shim (`extension/src/permission/handler.ts`)
 *  resolves the active `PermissionPolicy` for an agent and delegates. Future per-tool
 *  policies implement this interface with internal allowlist/denylist logic; no change
 *  to the shim or the session's onPermissionRequest registration is needed.
 *
 *  Author attribution: copilot(developer:opus-4.7)
 *  Binds: FR-016, FR-017, FR-018, FR-019, CD-05
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequest, ToolInvocation } from "@github/copilot-sdk";

/**
 * The output of a policy decision. The scaffold ships exactly the first two
 * variants; `ask` is reserved for future per-tool policies that may want to
 * defer to a richer prompt experience than `PromptUserPolicy` provides.
 */
export type PermissionDecision =
    | { kind: "allow"; reason?: string }
    | { kind: "deny"; reason: string }
    | { kind: "ask"; promptHint?: string };

/**
 * Everything a policy needs to decide. The `correlationId` is the CD-04
 * envelope id from the originating webview message, so a denial can be
 * traced through both the EI-1 canonical log and the protocol round-trip.
 */
export interface PermissionDecisionContext {
    agentId: string;
    sessionId: string;
    request: PermissionRequest;
    invocation: ToolInvocation;
    correlationId: string;
}

/**
 * The seam future per-tool policies will plug into.
 *
 * Implementations:
 *   - `YoloPolicy` — always returns `{ kind: "allow" }`.
 *   - `PromptUserPolicy` — surfaces a `permission.prompt` envelope to the
 *     webview, awaits the matching `permission.respond`, returns based on the
 *     user's choice.
 *
 *   - (FUTURE) `PerToolPolicy` — internal rules per tool name (allowlist /
 *     denylist / ask-once-then-remember). Lands in a follow-up spec WITHOUT
 *     modifying `extension/src/permission/handler.ts`.
 */
export interface PermissionPolicy {
    /**
     * MUST be deterministic given the same context (modulo the user's
     * interactive answer for `PromptUserPolicy`).
     *
     * MUST NOT throw. Errors during decision SHOULD be returned as
     * `{ kind: "deny", reason: "<error>" }` and emitted to the EI-1 log
     * as `aa.permission.policy_error.v1`.
     */
    decide(ctx: PermissionDecisionContext): Promise<PermissionDecision>;
}

/**
 * The active policy resolver. Given an agent, returns the policy currently
 * bound to it. In the scaffold, this is `agent.yoloMode === true ? YoloPolicy
 * : PromptUserPolicy` — but future specs may bind a `PerToolPolicy` per agent
 * via configuration.
 */
export interface PolicyResolver {
    forAgent(agentId: string): PermissionPolicy;
}
