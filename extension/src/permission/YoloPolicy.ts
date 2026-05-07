/*---------------------------------------------------------------------------------------------
 *  src/permission/YoloPolicy.ts
 *
 *  Implements `PermissionPolicy` for the yolo-on path: every request is
 *  auto-approved without prompting the user. The bound EventEmitter is
 *  used to log the canonical `aa.permission.resolved.v1` decision so the
 *  audit trail still records that yolo bypassed the prompt.
 *--------------------------------------------------------------------------------------------*/

import type { EventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import type {
    PermissionDecision,
    PermissionDecisionContext,
    PermissionPolicy,
} from "./PermissionPolicy.js";

export class YoloPolicy implements PermissionPolicy {
    constructor(private readonly emitter: EventEmitter) {}

    async decide(ctx: PermissionDecisionContext): Promise<PermissionDecision> {
        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_PERMISSION_RESOLVED,
            agent_id: ctx.agentId,
            correlation_id: ctx.correlationId,
            payload: {
                decision: "allow",
                source: "yolo",
                kind: ctx.request?.kind ?? "unknown",
            },
        });
        return { kind: "allow", reason: "yolo" };
    }
}
