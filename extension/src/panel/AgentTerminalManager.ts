/*---------------------------------------------------------------------------------------------
 *  src/panel/AgentTerminalManager.ts
 *
 *  Maps `agentId` → live `AgentTerminal` (per CD-11 §2 + §7, CD-13
 *  reversal of CD-07). Idempotent `open(agentId)` reveals an existing
 *  terminal or creates a new one. When a terminal is disposed (user
 *  closes its tab via the trash-can button or `Cmd+W`), the manager
 *  removes the entry; the underlying Agent stays alive.
 *
 *  Replaces the prior `AgentPanelManager` (WebviewPanel-keyed map).
 *  Same shape, different render surface.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { AgentRegistry } from "../state/AgentRegistry.js";
import type { EventEmitter as CanonicalEventEmitter } from "../telemetry/EventEmitter.js";
import { AgentTerminal } from "./AgentTerminal.js";

export interface AgentTerminalManagerOptions {
    registry: AgentRegistry;
    emitter: CanonicalEventEmitter;
}

export class AgentTerminalManager implements vscode.Disposable {
    private readonly terminals = new Map<string, AgentTerminal>();
    private readonly registry: AgentRegistry;
    private readonly emitter: CanonicalEventEmitter;
    /** Set during `dispose()` so the synchronous `terminal.onDidDispose`
     *  callback (fired by the underlying VS Code teardown) does not
     *  mutate `this.terminals` mid-iteration. */
    private isDisposing = false;

    constructor(opts: AgentTerminalManagerOptions) {
        this.registry = opts.registry;
        this.emitter = opts.emitter;
    }

    /** Reveal the terminal for `agentId` or create a new one. Throws
     *  if no Agent is registered under that id. Per CD-11 §2 — clicking
     *  a TreeView row whose terminal is open MUST reveal the existing
     *  tab, not duplicate it. */
    open(agentId: string): void {
        const existing = this.terminals.get(agentId);
        if (existing) {
            existing.reveal();
            return;
        }
        const agent = this.registry.get(agentId);
        if (!agent) {
            throw new Error(`AgentTerminalManager: no agent registered under id "${agentId}"`);
        }
        const term = new AgentTerminal({
            agent,
            emitter: this.emitter,
        });
        // When the user closes the tab, drop our reference. Agent
        // stays alive (CD-11 §6).
        term.onDidDispose(() => {
            if (this.isDisposing) return;
            this.terminals.delete(agentId);
        });
        this.terminals.set(agentId, term);
        term.reveal();
    }

    /** Disposes every live terminal. Agents survive (per CD-11 §6) —
     *  only the `vscode.Terminal` instances go. Called only on
     *  extension deactivate. */
    dispose(): void {
        this.isDisposing = true;
        // Snapshot the values so the synchronous onDidDispose callback
        // can't surprise us even if a future refactor turns the guard
        // off — we never iterate the Map directly during teardown.
        const terms = Array.from(this.terminals.values());
        this.terminals.clear();
        for (const term of terms) {
            try {
                term.dispose();
            } catch {
                /* ignore */
            }
        }
        this.isDisposing = false;
    }
}
