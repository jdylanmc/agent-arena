/*---------------------------------------------------------------------------------------------
 *  src/telemetry/EventEmitter.ts
 *
 *  Single canonical JSONL writer for the EI-1 event log
 *  (CD-01 / FR-020 / FR-021).
 *
 *  Writes to ${context.logUri}/agent-arena.events.jsonl, one CanonicalEvent
 *  per line. Single-writer guarantee per VS Code window. Synchronous append
 *  (Node fs.appendFileSync) — the volume is low (events per turn, not per
 *  token) so the simplicity is worth the cost. Size-based rotation arrives
 *  in T082-T083.
 *
 *  Subscribers may register handlers that fire on every emit (used by the
 *  webview view to surface state changes to the React UI). Subscriber errors
 *  surface as `aa.event_handler.failed.v1` events but do NOT break emission.
 *--------------------------------------------------------------------------------------------*/

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { CanonicalEvent } from "./event.js";
import { makeEvent } from "./event.js";
import { EVENT_NAMES } from "./eventNames.js";

export type EventSubscriber = (event: CanonicalEvent) => void;

export interface EventEmitterOptions {
    /** Absolute path to the JSONL log file. Parent directory is created. */
    filePath: string;
    /** When true, never write to disk (used by tests). Defaults to false. */
    silent?: boolean;
}

/**
 * Single-writer JSONL emitter. NOT thread-safe (extension host is single-
 * threaded). One instance per VS Code window.
 */
export class EventEmitter {
    private readonly filePath: string;
    private readonly silent: boolean;
    private readonly subscribers: EventSubscriber[] = [];

    constructor(options: EventEmitterOptions) {
        this.filePath = options.filePath;
        this.silent = options.silent ?? false;
        if (!this.silent) {
            try {
                mkdirSync(dirname(this.filePath), { recursive: true });
            } catch {
                // mkdir tolerated; appendFileSync will surface real errors.
            }
        }
    }

    /**
     * Emit one event. Writes a single JSONL line + newline. Notifies
     * subscribers. Subscriber errors are caught and re-emitted as
     * AA_EVENT_HANDLER_FAILED to preserve audit-trail integrity.
     */
    emit(event: CanonicalEvent): void {
        this.writeToDisk(event);
        this.notifySubscribers(event, /* allowReemit */ true);
    }

    private writeToDisk(event: CanonicalEvent): void {
        if (this.silent) return;
        const line = JSON.stringify(event) + "\n";
        try {
            appendFileSync(this.filePath, line, "utf8");
        } catch {
            // Even the writer can fail (disk full, permission). We can't
            // log this through ourselves (recursion risk). Silently drop;
            // the canonical "log of last resort" is the OS error stream
            // and we don't want to bypass EI-1's "no console" rule.
            // Future: a fallback handler injection point.
        }
    }

    private notifySubscribers(event: CanonicalEvent, allowReemit: boolean): void {
        for (const subscriber of [...this.subscribers]) {
            try {
                subscriber(event);
            } catch (err: unknown) {
                if (!allowReemit) {
                    // Re-emit failure inside re-emit dispatch — drop silently
                    // to avoid unbounded recursion when subscribers consistently
                    // throw on every event including AA_EVENT_HANDLER_FAILED.
                    continue;
                }
                const failureEvent = makeEvent({
                    level: "warn",
                    event: EVENT_NAMES.AA_EVENT_HANDLER_FAILED,
                    agent_id: event.agent_id,
                    correlation_id: event.correlation_id,
                    payload: {
                        failedEvent: event.event,
                        error: err instanceof Error ? err.message : String(err),
                    },
                });
                this.writeToDisk(failureEvent);
                this.notifySubscribers(failureEvent, /* allowReemit */ false);
            }
        }
    }

    /**
     * Convenience: build + emit. Saves callers from duplicating makeEvent.
     */
    emitNew<P extends Record<string, unknown>>(args: {
        level: CanonicalEvent["level"];
        event: string;
        agent_id: string | null;
        correlation_id?: string;
        payload: P;
    }): void {
        this.emit(
            makeEvent({
                level: args.level,
                event: args.event,
                agent_id: args.agent_id,
                correlation_id: args.correlation_id ?? randomUUID(),
                payload: args.payload,
            }),
        );
    }

    subscribe(subscriber: EventSubscriber): { dispose(): void } {
        this.subscribers.push(subscriber);
        return {
            dispose: () => {
                const idx = this.subscribers.indexOf(subscriber);
                if (idx >= 0) this.subscribers.splice(idx, 1);
            },
        };
    }
}
