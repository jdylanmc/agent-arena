/*---------------------------------------------------------------------------------------------
 *  src/permission/PromptUserPolicy.ts
 *
 *  Implements `PermissionPolicy` for the yolo-off path: the user is asked
 *  via a VS Code modal dialog (CD-07 §6 — the modal layer is independent
 *  of the surface and was retained from CD-06). The policy never throws;
 *  if the user dismisses the modal (no Allow/Deny chosen), the request
 *  is denied as a safe default.
 *
 *  Modal copy is built per-`kind` from the SDK's `PermissionRequest`:
 *
 *    shell        → "Run shell command?" + fullCommandText + intention
 *    write        → "Write file?" + fileName + intention + diff snippet
 *    read         → "Read file?" + path + intention
 *    url          → "Fetch URL?" + url + intention
 *    mcp          → "Run MCP tool?" + serverName/toolTitle + (args summary)
 *    custom-tool  → "Run custom tool?" + toolName + toolDescription
 *    memory       → "Save memory fact?" + subject + fact (runtime variant
 *                    not in the static `kind` union but emitted by some
 *                    SDK builds — handled defensively)
 *    default      → "Allow tool invocation?" with the raw kind exposed
 *                    so unknown future kinds still produce a sensible modal.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { EventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import type {
    PermissionDecision,
    PermissionDecisionContext,
    PermissionPolicy,
} from "./PermissionPolicy.js";

interface ModalCopy {
    /** First line of the modal body — what's about to happen. */
    title: string;
    /** Subsequent lines of the modal body — the salient details. May be empty. */
    body: string;
    /** Stable label for telemetry — kind plus per-kind identifier (e.g.,
     *  command name, file path) when available. Never an empty string. */
    summary: string;
}

export class PromptUserPolicy implements PermissionPolicy {
    constructor(private readonly emitter: EventEmitter) {}

    async decide(ctx: PermissionDecisionContext): Promise<PermissionDecision> {
        const copy = this.copyForRequest(ctx.request);

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_PERMISSION_PROMPTED,
            agent_id: ctx.agentId,
            correlation_id: ctx.correlationId,
            payload: {
                kind: ctx.request?.kind ?? "unknown",
                summary: copy.summary,
            },
        });

        const message = copy.body.length > 0 ? `${copy.title}\n\n${copy.body}` : copy.title;
        const choice = await vscode.window.showInformationMessage(
            message,
            { modal: true, detail: copy.body },
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
                kind: ctx.request?.kind ?? "unknown",
                summary: copy.summary,
            },
        });

        return allowed
            ? { kind: "allow", reason: "modal_allow" }
            : { kind: "deny", reason: choice === "Deny" ? "modal_deny" : "modal_dismissed" };
    }

    /** Map the SDK's discriminated PermissionRequest into a human-readable
     *  modal title + body + telemetry summary. Reads each kind's specific
     *  fields off the request's index-signature (`[key: string]: unknown`)
     *  with defensive coercion so a malformed payload still renders. */
    private copyForRequest(request: unknown): ModalCopy {
        const r = (request ?? {}) as Record<string, unknown>;
        const kind = typeof r["kind"] === "string" ? (r["kind"] as string) : "unknown";

        switch (kind) {
            case "shell": {
                const command = stringField(r, "fullCommandText");
                const intention = stringField(r, "intention");
                const warning = stringField(r, "warning");
                const body = [
                    command ? `$ ${command}` : "",
                    intention,
                    warning ? `⚠ ${warning}` : "",
                ]
                    .filter((s) => s.length > 0)
                    .join("\n\n");
                return {
                    title: "Agent Arena: Run shell command?",
                    body,
                    summary: command || "shell",
                };
            }
            case "write": {
                const fileName = stringField(r, "fileName");
                const intention = stringField(r, "intention");
                const diff = stringField(r, "diff");
                const diffPreview = truncate(diff, 1200);
                const body = [
                    fileName ? `File: ${fileName}` : "",
                    intention,
                    diffPreview ? `\n${diffPreview}` : "",
                ]
                    .filter((s) => s.length > 0)
                    .join("\n");
                return {
                    title: "Agent Arena: Write to file?",
                    body,
                    summary: fileName || "write",
                };
            }
            case "read": {
                const filePath = stringField(r, "path");
                const intention = stringField(r, "intention");
                const body = [filePath ? `Path: ${filePath}` : "", intention]
                    .filter((s) => s.length > 0)
                    .join("\n");
                return {
                    title: "Agent Arena: Read file?",
                    body,
                    summary: filePath || "read",
                };
            }
            case "url": {
                const url = stringField(r, "url");
                const intention = stringField(r, "intention");
                const body = [url ? `URL: ${url}` : "", intention]
                    .filter((s) => s.length > 0)
                    .join("\n");
                return {
                    title: "Agent Arena: Fetch URL?",
                    body,
                    summary: url || "url",
                };
            }
            case "mcp": {
                const serverName = stringField(r, "serverName");
                const toolTitle = stringField(r, "toolTitle");
                const toolName = stringField(r, "toolName");
                const label =
                    toolTitle || (serverName && toolName ? `${serverName}/${toolName}` : toolName);
                const args = r["args"];
                const argsPreview =
                    args && typeof args === "object"
                        ? truncate(JSON.stringify(args, null, 2), 1200)
                        : "";
                const body = [label ? `Tool: ${label}` : "", argsPreview]
                    .filter((s) => s.length > 0)
                    .join("\n\n");
                return {
                    title: "Agent Arena: Run MCP tool?",
                    body,
                    summary: label || "mcp",
                };
            }
            case "custom-tool": {
                const toolName = stringField(r, "toolName");
                const description = stringField(r, "toolDescription");
                const args = r["args"];
                const argsPreview =
                    args && typeof args === "object"
                        ? truncate(JSON.stringify(args, null, 2), 1200)
                        : "";
                const body = [
                    toolName ? `Tool: ${toolName}` : "",
                    description,
                    argsPreview,
                ]
                    .filter((s) => s.length > 0)
                    .join("\n\n");
                return {
                    title: "Agent Arena: Run custom tool?",
                    body,
                    summary: toolName || "custom-tool",
                };
            }
            case "memory": {
                // Runtime variant; not in the static `kind` union but emitted
                // by some SDK builds via the index-signature.
                const subject = stringField(r, "subject");
                const fact = stringField(r, "fact");
                const body = [
                    subject ? `Subject: ${subject}` : "",
                    fact ? `Fact: ${fact}` : "",
                ]
                    .filter((s) => s.length > 0)
                    .join("\n");
                return {
                    title: "Agent Arena: Save memory fact?",
                    body,
                    summary: subject || "memory",
                };
            }
            default: {
                // Unknown / future kind. Show the kind name and any
                // string-shaped metadata we can scrape so the user has
                // *something* to decide against.
                const fallback = Object.entries(r)
                    .filter(
                        ([k, v]) =>
                            k !== "kind" && k !== "toolCallId" && typeof v === "string",
                    )
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .slice(0, 6)
                    .join("\n");
                return {
                    title: `Agent Arena: Allow tool invocation?`,
                    body: [`Kind: ${kind}`, fallback].filter((s) => s.length > 0).join("\n\n"),
                    summary: kind,
                };
            }
        }
    }
}

function stringField(r: Record<string, unknown>, key: string): string {
    const v = r[key];
    return typeof v === "string" ? v : "";
}

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, max)}\n… (${s.length - max} more chars)`;
}
