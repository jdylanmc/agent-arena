/*---------------------------------------------------------------------------------------------
 *  webview-src/protocol/messageBus.ts
 *
 *  Thin wrapper around `acquireVsCodeApi()` for typed envelope I/O between
 *  the webview and the extension host. The webview never imports anything
 *  outside its own bundle — this file is the only place that touches the
 *  VS Code webview API.
 *--------------------------------------------------------------------------------------------*/

import { validateEnvelope, type MessageEnvelope } from "./envelope.js";
import {
  MESSAGE_SCHEMAS,
  type InboundMessageType,
  type OutboundMessageType,
} from "./types.js";
import type { z } from "zod";

interface VsCodeApi {
  postMessage(message: unknown): void;
  setState(state: unknown): void;
  getState(): unknown;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const vscodeApi = window.acquireVsCodeApi?.();

type OutboundHandler<T extends OutboundMessageType> = (
  payload: z.infer<(typeof MESSAGE_SCHEMAS)[T]>,
  envelope: MessageEnvelope,
) => void;

const handlers = new Map<OutboundMessageType, Set<(payload: unknown, envelope: MessageEnvelope) => void>>();

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const result = validateEnvelope(event.data);
  if (!result.ok) return; // host-side rejection mirror; webview ignores garbage silently
  const env = result.envelope;
  const type = env.type as OutboundMessageType;
  const schema = MESSAGE_SCHEMAS[type];
  if (!schema) return;
  const payloadResult = schema.safeParse(env.payload);
  if (!payloadResult.success) return;
  const bucket = handlers.get(type);
  if (!bucket) return;
  for (const handler of bucket) {
    handler(payloadResult.data, env);
  }
});

export const bus = {
  on<T extends OutboundMessageType>(type: T, handler: OutboundHandler<T>): () => void {
    let bucket = handlers.get(type);
    if (!bucket) {
      bucket = new Set();
      handlers.set(type, bucket);
    }
    const wrapped = handler as (payload: unknown, envelope: MessageEnvelope) => void;
    bucket.add(wrapped);
    return () => bucket?.delete(wrapped);
  },

  send<T extends InboundMessageType>(
    type: T,
    payload: z.infer<(typeof MESSAGE_SCHEMAS)[T]>,
    options?: { correlationId?: string; sessionId?: string; agentId?: string },
  ): void {
    if (!vscodeApi) return;
    const envelope: MessageEnvelope = {
      protocol_version: 1,
      message_id: uuidv4(),
      correlation_id: options?.correlationId ?? uuidv4(),
      session_id: options?.sessionId,
      agent_id: options?.agentId,
      type,
      payload: payload as Record<string, unknown>,
    };
    vscodeApi.postMessage(envelope);
  },

  ready(): void {
    this.send("webview.ready", {});
  },
};

/** Browser-friendly UUID v4. The webview cannot import node:crypto. */
function uuidv4(): string {
  const c = window.crypto;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  // Fallback (very old browsers): simple v4 using Math.random.
  const buf = new Uint8Array(16);
  c?.getRandomValues?.(buf);
  buf[6] = (buf[6]! & 0x0f) | 0x40;
  buf[8] = (buf[8]! & 0x3f) | 0x80;
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
