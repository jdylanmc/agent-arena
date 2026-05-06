# Webview ↔ Extension-Host Protocol

**Author attribution**: copilot(developer:opus-4.7)
**Binds**: CD-04, FR-009, FR-021
**See also**: [data-model.md](../data-model.md) for the `MessageEnvelope` and `CanonicalEvent` types.

This document is the authoritative protocol contract between the webview (React app) and the extension host (Node.js). Both sides MUST validate every envelope at runtime. Unknown `type` values MUST be rejected and surfaced as `aa.webview.message.rejected.v1` (per CD-01).

The protocol's intent is *minimum viable* for the scaffold. Subsequent specs (Swarm UI, background agents, workflow panel) will add `type` values; they MUST NOT change the envelope shape.

---

## Envelope (versioned)

```typescript
{
  protocol_version: 1,
  message_id: "<uuid v4>",        // unique per message
  correlation_id: "<uuid v4>",    // shared across an entire causal chain
  session_id?: "<sdk session id>",
  agent_id?: "<agent id>",
  type: "<from enum below>",
  payload: { /* schema depends on type */ }
}
```

### Field semantics

| Field | Required? | Notes |
|---|---|---|
| `protocol_version` | yes | Integer literal `1` for this scaffold. **MAJOR** bumps when the envelope shape changes; **NOT** when only the type enum grows. |
| `message_id` | yes | Per-message UUID v4. Used to detect replays / debug. |
| `correlation_id` | yes | UUID v4 minted by the originator of a causal chain (typically the webview when the user submits a prompt). The host MUST propagate it into every EI-1 event emitted as a downstream consequence (per CD-01). The host MUST also include it on every host→webview message in the same chain. |
| `session_id` | optional | Present once a session has been created or resumed. Inbound `prompt.submit` may omit it (host creates the session on demand). |
| `agent_id` | optional | Present when scoped to a specific agent. Always `"primary"` in this scaffold. |
| `type` | yes | One of the enum values below. |
| `payload` | yes | Object. Per-`type` schema enforced by Zod on receipt. |

### Validation

- Both sides import `MessageEnvelopeSchema` from `extension/src/protocol/envelope.ts` (see [data-model.md](../data-model.md#messageenvelope-cd-04--r-09)).
- The webview re-uses the same schema file via the build-time copy step (Vite config copies `extension/src/protocol/*.ts` into `extension/webview-src/protocol/`); a unit test asserts the two copies are byte-identical.
- A receiver that fails validation MUST NOT throw at the message dispatcher; it MUST log + emit `aa.webview.message.rejected.v1` and return.

### Reject-unknown rule

- Any envelope with `protocol_version !== 1` is rejected with reason `"unsupported_protocol_version"`.
- Any envelope whose `type` is not in the type enum (below) is rejected with reason `"unknown_type"`.
- Any envelope whose `payload` fails the per-`type` Zod schema is rejected with reason `"payload_schema_violation"` and a structured error trace under the rejection event's payload.

---

## Type enum

Each `type` is a stable identifier owned by the extension host. Adding a `type` requires:

1. Updating the Zod schema enumeration in `extension/src/protocol/types.ts`.
2. Updating this document's table.
3. Updating `wiki/docs/webview-protocol.md` (the agent-readable mirror).
4. Adding a unit test that round-trips a representative envelope of that type.

### webview → host (inbound to extension host)

| `type` | Payload (Zod) | Semantics |
|---|---|---|
| `webview.ready` | `z.object({})` | Webview has finished mounting and is ready to receive messages. Sent once per webview lifecycle. Host responds with `session.state`. |
| `prompt.submit` | `z.object({ promptText: z.string().min(1), agentId: z.string() })` | User submitted a prompt for the named agent. Host either sends to the existing session or creates one (FR-015 enqueue semantics apply). |
| `yolo.set` | `z.object({ enabled: z.boolean(), agentId: z.string() })` | User toggled yolo. Host updates `workspaceState` per CD-05, swaps the active `PermissionPolicy` for the agent, and emits `aa.yolo.toggled.v1`. |
| `permission.respond` | `z.object({ requestId: z.string(), decision: z.enum(["allow", "deny"]) })` | User responded to a permission prompt. The matching `requestId` MUST match a prior outbound `permission.prompt`. |

### host → webview (outbound to webview)

| `type` | Payload (Zod) | Semantics |
|---|---|---|
| `assistant.delta` | `z.object({ chunk: z.string(), sessionId: z.string(), turnId: z.string() })` | One streaming token / chunk of an assistant response. Webview appends to the rendered turn. |
| `assistant.message.final` | `z.object({ text: z.string(), sessionId: z.string(), turnId: z.string() })` | Final consolidated assistant message for the turn. Webview can use this to replace the streamed accumulation if it prefers a clean final render. |
| `permission.prompt` | `z.object({ requestId: z.string(), toolName: z.string(), summary: z.string() })` | Host needs the user to allow or deny a tool invocation. Webview shows a modal / inline prompt; user's choice arrives as `permission.respond`. |
| `session.state` | `z.object({ status: z.enum(["idle", "running", "queued", "error"]), sessionId: z.string() })` | Lifecycle update for the agent's session. Webview reflects this in the terminal header. |
| `error` | `z.object({ code: z.string(), message: z.string(), recoverable: z.boolean() })` | Host-side error surfaced to the user. `code` is from a stable enumeration documented in `wiki/docs/webview-protocol.md`. |

---

## Causal-chain example

A user sends "Reply: pong" with yolo OFF. The agent attempts no tool calls. End-to-end envelope flow:

```
correlation_id = "c1" (webview-minted)

→ host: { type: "prompt.submit", correlation_id: "c1", payload: { promptText: "Reply: pong", agentId: "primary" } }
← webview: { type: "session.state", correlation_id: "c1", payload: { status: "running", sessionId: "aa-primary-…" } }
← webview: { type: "assistant.delta", correlation_id: "c1", payload: { chunk: "p", sessionId: "…", turnId: "t1" } }
← webview: { type: "assistant.delta", correlation_id: "c1", payload: { chunk: "ong", sessionId: "…", turnId: "t1" } }
← webview: { type: "assistant.message.final", correlation_id: "c1", payload: { text: "pong", sessionId: "…", turnId: "t1" } }
← webview: { type: "session.state", correlation_id: "c1", payload: { status: "idle", sessionId: "…" } }
```

In parallel, the EI-1 canonical log records (per CD-01):

```jsonl
{"ts":"2026-…","level":"info","event":"aa.webview.message.received.v1","agent_id":"…","correlation_id":"c1","payload":{"type":"prompt.submit"}}
{"ts":"2026-…","level":"info","event":"copilot.session.created.v1","agent_id":"…","correlation_id":"c1","payload":{"sessionId":"aa-primary-…","sdk":{ /* original SDK payload */ }}}
{"ts":"2026-…","level":"info","event":"copilot.session.user_message.v1","agent_id":"…","correlation_id":"c1","payload":{"sdk":{ /* … */ }}}
{"ts":"2026-…","level":"info","event":"copilot.session.assistant_message_delta.v1","agent_id":"…","correlation_id":"c1","payload":{"sdk":{ /* … */ }}}
{"ts":"2026-…","level":"info","event":"copilot.session.assistant_message.v1","agent_id":"…","correlation_id":"c1","payload":{"sdk":{ /* … */ }}}
{"ts":"2026-…","level":"info","event":"copilot.session.idle.v1","agent_id":"…","correlation_id":"c1","payload":{"sdk":{ /* … */ }}}
```

`correlation_id="c1"` ties every entry across both surfaces.

---

## Out of scope for this scaffold

These will be added by subsequent specs but are explicitly NOT in the scaffold's protocol:

- Multi-agent fan-out (`type: "agent.spawn"`, `type: "agent.dispose"`).
- Workflow execution (`type: "workflow.start"`, `type: "workflow.step.advance"`).
- Background agent grid state (`type: "agents.snapshot"`).
- Per-tool permission policy declarations (`type: "policy.set"`).

When these land, they MUST be additive (new `type` values + their schemas) and MUST NOT change the envelope shape. If the envelope shape needs to change, `protocol_version` bumps to `2` and both sides MUST handle both versions during a deprecation window per Keep a Changelog 1.1.0.

— copilot(developer:opus-4.7)
