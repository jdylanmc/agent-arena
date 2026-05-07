/*---------------------------------------------------------------------------------------------
 *  src/permission/PromptUserPolicy.ts
 *
 *  Implements `PermissionPolicy` for the yolo-off path: the user is asked
 *  via a VS Code modal dialog (CD-07 §6 — the modal layer is independent
 *  of the surface and was retained from CD-06). The policy never throws;
 *  if the user dismisses the modal (no Allow/Deny chosen), the request
 *  is denied as a safe default.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { EventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import type {
    PermissionDecision,
    PermissionDecisionContext,
    PermissionPolicy,
} from "./PermissionPolicy.js";

export class PromptUserPolicy implements PermissionPolicy {
    constructor(private readonly emitter: EventEmitter) {}

    async decide(ctx: PermissionDecisionContext): Promise<PermissionDecision> {
        const toolName = ctx.invocation?.toolName ?? ctx.request?.toolName ?? "this tool";
        const summary = ctx.request?.summary ?? "";

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_PERMISSION_PROMPTED,
            agent_id: ctx.agentId,
            correlation_id: ctx.correlationId,
            payload: { toolName, summary },
        });

        const choice = await vscode.window.showInformationMessage(
            `Agent Arena: allow ${toolName}?\n\n${summary}`,
            { modal: true },
            "Allow",
            "Deny",
        );
        const allowed = choice === "Allow";

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_PERMISSION_RESOLVED,
            agent_id: ctx.agentId,
            correlation_id: ctx.correlationId,
            payload: {
                decision: allowed ? "allow" : "deny",
                source: "modal",
                toolName,
            },
        });

        return allowed
            ? { kind: "allow", reason: "modal_allow" }
            : { kind: "deny", reason: choice === "Deny" ? "modal_deny" : "modal_dismissed" };
    }
}
