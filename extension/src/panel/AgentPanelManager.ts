/*---------------------------------------------------------------------------------------------
 *  src/panel/AgentPanelManager.ts
 *
 *  Maps agentId → live AgentPanel (per CD-11 §2 + §7). Idempotent
 *  `open(agentId)` reveals an existing panel or creates a new one. When
 *  a panel is disposed (user closes its tab), the manager removes the
 *  entry; the underlying Agent stays put.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { AgentRegistry } from "../state/AgentRegistry.js";
import type { EventEmitter as CanonicalEventEmitter } from "../telemetry/EventEmitter.js";
import { AgentPanel } from "./AgentPanel.js";

export interface AgentPanelManagerOptions {
    registry: AgentRegistry;
    extensionUri: vscode.Uri;
    emitter: CanonicalEventEmitter;
}

export class AgentPanelManager implements vscode.Disposable {
    private readonly panels = new Map<string, AgentPanel>();
    private readonly registry: AgentRegistry;
    private readonly extensionUri: vscode.Uri;
    private readonly emitter: CanonicalEventEmitter;
    /** Set during `dispose()` so the synchronous `panel.onDidDispose`
     *  callback (fired by the underlying VS Code panel teardown) does
     *  not mutate `this.panels` mid-iteration. Without this guard, the
     *  for…of below would walk a Map being modified by its own callback
     *  — a Heisenbug waiting to surface under any future refactor. */
    private isDisposing = false;

    constructor(opts: AgentPanelManagerOptions) {
        this.registry = opts.registry;
        this.extensionUri = opts.extensionUri;
        this.emitter = opts.emitter;
    }

    /** Reveal the panel for `agentId` or create a new one. Throws if no
     *  Agent is registered under that id. Per CD-11 §2 — clicking a
     *  TreeView row whose window is open MUST reveal the existing
     *  window, not duplicate it. */
    open(agentId: string, viewColumn?: vscode.ViewColumn): void {
        const existing = this.panels.get(agentId);
        if (existing) {
            existing.reveal(viewColumn);
            return;
        }
        const agent = this.registry.get(agentId);
        if (!agent) {
            throw new Error(`AgentPanelManager: no agent registered under id "${agentId}"`);
        }
        const panel = new AgentPanel({
            agent,
            extensionUri: this.extensionUri,
            emitter: this.emitter,
        });
        // When the user closes the tab, drop our reference. Agent stays.
        panel.onDidDispose(() => {
            if (this.isDisposing) return;
            this.panels.delete(agentId);
        });
        this.panels.set(agentId, panel);
        panel.reveal(viewColumn);
    }

    /** Disposes every live panel. Agents survive (per CD-11 §6) — only
     *  the WebviewPanels go. Called only on extension deactivate. */
    dispose(): void {
        this.isDisposing = true;
        // Snapshot the values so the synchronous onDidDispose callback
        // can't surprise us even if a future refactor turns the guard
        // off — we never iterate the Map directly during teardown.
        const panels = Array.from(this.panels.values());
        this.panels.clear();
        for (const panel of panels) {
            try {
                panel.dispose();
            } catch {
                /* ignore */
            }
        }
        this.isDisposing = false;
    }
}
