/*---------------------------------------------------------------------------------------------
 *  src/permission/PermissionPolicy.ts
 *
 *  Typed PermissionPolicy interface (FR-019 / R-06).
 *
 *  Proves the spec's promise that a future per-tool policy can replace the
 *  binary yolo without changing handler call sites: the session's
 *  onPermissionRequest shim resolves the active PermissionPolicy via
 *  PolicyResolver and delegates. Future PerToolPolicy implementations satisfy
 *  this interface; the shim itself never changes.
 *
 *  See:
 *    - specs/20260506-144809-scaffold-application/contracts/permission-policy.ts
 *    - specs/20260506-144809-scaffold-application/data-model.md (PermissionPolicy)
 *
 *  Author attribution: copilot(developer:opus-4.7)
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequest } from "@github/copilot-sdk";

/**
 * The output of a policy decision. The scaffold ships exactly the first two
 * variants. `ask` is reserved for future per-tool policies that may want to
 * defer to a richer prompt experience than PromptUserPolicy provides.
 */
export type PermissionDecision =
    | { kind: "allow"; reason?: string }
    | { kind: "deny"; reason: string }
    | { kind: "ask"; promptHint?: string };

/**
 * Everything a policy needs to decide. The correlationId is the CD-04 envelope
 * id from the originating webview message, so a denial can be traced through
 * both the EI-1 canonical log and the protocol round-trip.
 *
 * `request` carries the SDK's `PermissionRequest` verbatim — discriminated by
 * `kind` (`shell` / `write` / `read` / `mcp` / `url` / `custom-tool`, plus
 * runtime variants like `memory`). Per-kind fields live on the same object
 * via the SDK type's `[key: string]: unknown` index signature; policies that
 * need to reach into them MUST `switch (request.kind)` first and narrow.
 *
 * Note: the SDK's `PermissionHandler` callback also receives an `invocation`
 * argument of shape `{ sessionId: string }`. Since `sessionId` is already
 * carried at the top level of this context, we don't duplicate it.
 */
export interface PermissionDecisionContext {
    agentId: string;
    sessionId: string;
    request: PermissionRequest;
    correlationId: string;
}

/**
 * The seam future per-tool policies will plug into.
 */
export interface PermissionPolicy {
    /**
     * MUST be deterministic given the same context (modulo the user's
     * interactive answer for PromptUserPolicy).
     *
     * MUST NOT throw. Errors during decision SHOULD return
     * `{ kind: "deny", reason: "<error>" }` and emit
     * `aa.permission.policy_error.v1` to the EI-1 log.
     */
    decide(ctx: PermissionDecisionContext): Promise<PermissionDecision>;
}

/**
 * Active policy resolver. Given an agent, returns the currently bound policy.
 * In the scaffold: `agent.yoloMode === true ? YoloPolicy : PromptUserPolicy`.
 * Future specs may bind a PerToolPolicy per agent via configuration without
 * changing this interface.
 */
export interface PolicyResolver {
    forAgent(agentId: string): PermissionPolicy;
}
